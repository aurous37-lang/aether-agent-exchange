#!/usr/bin/env npx tsx
// ─── Invariant Test Suite ────────────────────────────────────────
// Tests 10 lifecycle invariants against the running backend API.
// Run: npx tsx test-env/invariant-tests.ts

import { privateKeyToAccount } from 'viem/accounts';
import {
  authenticateWallet,
  WALLET_ALICE,
  WALLET_BOB,
  API,
  sleep,
  baseSepoliaFundingProof,
  hashForFixture,
} from './helpers';

// Hardhat account #2 — an uninvolved third party
const WALLET_CHARLIE = privateKeyToAccount(
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
);

// ─── Raw fetch helper (does NOT throw on error status) ──────────

async function raw(method: string, path: string, token: string, body?: any) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json() };
}

// ─── Job & agent creation helpers ───────────────────────────────

let jobCounter = 0;

async function createJob(token: string) {
  jobCounter++;
  const res = await raw('POST', '/jobs', token, {
    title: `Invariant Test Job ${jobCounter} ${Date.now()}`,
    description: 'A test job created for invariant testing purposes.',
    category: 'CODE_DEVELOPMENT',
    deliverables: ['test-deliverable'],
    budgetAmount: 100,
    budgetToken: 'USDC',
    settlementRail: 'offchain',
  });
  if (res.status !== 201) throw new Error(`Failed to create job: ${JSON.stringify(res.data)}`);
  return res.data;
}

let agentCounter = 0;

async function registerAgent(token: string) {
  agentCounter++;
  const wallet = `0x${agentCounter.toString(16).padStart(40, '0')}`;
  const res = await raw('POST', '/agents', token, {
    name: `InvTestAgent-${agentCounter}-${Date.now()}`,
    description: 'An agent registered for invariant testing.',
    capabilities: ['testing'],
    models: ['test-model'],
    metadataURI: `ipfs://test-${agentCounter}`,
    agentWallet: wallet,
  });
  if (res.status === 409) {
    const existing = await raw('GET', '/handler/agents', token);
    const agent = Array.isArray(existing.data) ? existing.data[0] : null;
    if (agent?.id) return agent;
  }
  if (res.status !== 201) throw new Error(`Failed to register agent: ${JSON.stringify(res.data)}`);
  return res.data;
}

async function placeBid(token: string, jobId: string, agentId: string) {
  const res = await raw('POST', `/jobs/${jobId}/bid`, token, {
    agentId,
    amount: 90,
    estimatedDuration: '2 days',
    message: 'Invariant test bid',
  });
  if (res.status !== 201) throw new Error(`Failed to place bid: ${JSON.stringify(res.data)}`);
  return res.data;
}

async function acceptJob(token: string, jobId: string, agentId: string) {
  const res = await raw('POST', `/jobs/${jobId}/accept`, token, { agentId });
  if (res.status !== 200) throw new Error(`Failed to accept job: ${JSON.stringify(res.data)}`);
  return res.data;
}

async function submitDeliverable(token: string, jobId: string) {
  const res = await raw('POST', `/jobs/${jobId}/submit`, token, {
    deliverableHash: `0xdeadbeef${Date.now()}`,
    notes: 'Invariant test deliverable',
  });
  if (res.status !== 201) throw new Error(`Failed to submit: ${JSON.stringify(res.data)}`);
  return res.data;
}

async function approveJob(token: string, jobId: string) {
  const jobRes = await raw('GET', `/jobs/${jobId}`, token);
  if (jobRes.status !== 200) throw new Error(`Failed to load job before approval: ${JSON.stringify(jobRes.data)}`);

  const job = jobRes.data;
  if (job.budgetAmount > 0 && ['standard', 'erc8183'].includes(job.settlementRail || 'standard')) {
    const txHash = '0x' + jobId.replace(/-/g, '').padEnd(64, '0').slice(0, 64);
    const receiptHash = hashForFixture(jobId, '7');
    const escrowAddress = job.escrowAddress || '0x0000000000000000000000000000000000008453';
    const receipt = await raw('POST', `/jobs/${jobId}/settlement-receipts`, token, {
      receipt: `invariant-settlement-${jobId}`,
      rail: job.settlementRail || 'standard',
      amount: job.budgetAmount,
      tokenSymbol: job.budgetToken,
      walletAddress: WALLET_ALICE.address,
      escrowAddress,
      txHash,
      receiptHash,
      chainId: job.chainId || 84532,
      network: job.network || 'base-sepolia',
      status: 'SETTLED',
      redactedReference: `inv:${jobId.slice(0, 8)}`,
      verificationProof: baseSepoliaFundingProof({
        jobId,
        txHash,
        receiptHash,
        escrowAddress,
        amountAtomic: String(Math.round(Number(job.budgetAmount) * 1_000_000)),
      }),
    });
    if (receipt.status !== 201) throw new Error(`Failed to record settlement receipt: ${JSON.stringify(receipt.data)}`);
  }

  const res = await raw('POST', `/jobs/${jobId}/approve`, token);
  if (res.status !== 200) throw new Error(`Failed to approve: ${JSON.stringify(res.data)}`);
  return res.data;
}

async function disputeJob(token: string, jobId: string) {
  const res = await raw('POST', `/jobs/${jobId}/dispute`, token, {
    reason: 'Invariant test dispute reason text',
  });
  if (res.status !== 201) throw new Error(`Failed to dispute: ${JSON.stringify(res.data)}`);
  return res.data;
}

// ─── Test runner ────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

type TestResult = { name: string; passed: boolean; detail?: string };
const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ${GREEN}PASS${RESET}  ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, detail: err.message });
    console.log(`  ${RED}FAIL${RESET}  ${name}`);
    console.log(`        ${DIM}${err.message}${RESET}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}${CYAN}=== Invariant Test Suite (10 lifecycle invariants) ===${RESET}\n`);

  // Authenticate all wallets
  const aliceAuth = await authenticateWallet(WALLET_ALICE);
  await sleep(500);
  const bobAuth = await authenticateWallet(WALLET_BOB);
  await sleep(500);
  const charlieAuth = await authenticateWallet(WALLET_CHARLIE);

  const alice = aliceAuth.token;
  const bob = bobAuth.token;
  const charlie = charlieAuth.token;

  // Pre-register an agent for Bob (reused across tests)
  const sharedAgent = await registerAgent(bob);
  const secondaryAgent = await registerAgent(charlie);

  // ─── 1. Approved jobs cannot return to OPEN ────────────────────

  await runTest('1. Approved jobs cannot return to OPEN', async () => {
    const job = await createJob(alice);
    await placeBid(bob, job.id, sharedAgent.id);
    await acceptJob(alice, job.id, sharedAgent.id);
    await submitDeliverable(bob, job.id);
    await approveJob(alice, job.id);
    // Try to update the completed job back (PUT only works on OPEN)
    const res = await raw('PUT', `/jobs/${job.id}`, alice, { title: 'Hijacked title' });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // ─── 2. Canceled jobs cannot accept bids ───────────────────────

  await runTest('2. Canceled jobs cannot accept bids', async () => {
    const job = await createJob(alice);
    // Cancel the job
    const delRes = await raw('DELETE', `/jobs/${job.id}`, alice);
    assert(delRes.status === 200, `Cancel failed: ${delRes.status}`);
    // Try to bid
    const res = await raw('POST', `/jobs/${job.id}/bid`, bob, {
      agentId: sharedAgent.id, amount: 50, estimatedDuration: '1 day',
    });
    assert([400, 403].includes(res.status), `Expected 400 or 403, got ${res.status}`);
  });

  // ─── 3. Disputed jobs cannot be rated before resolution ────────

  await runTest('3. Disputed jobs cannot be rated before resolution', async () => {
    const job = await createJob(alice);
    await placeBid(bob, job.id, sharedAgent.id);
    await acceptJob(alice, job.id, sharedAgent.id);
    await submitDeliverable(bob, job.id);
    await disputeJob(alice, job.id);
    // Try to rate while DISPUTED
    const res = await raw('POST', `/jobs/${job.id}/rate`, alice, { score: 5, comment: 'Great' });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // ─── 4. A job can only have one accepted agent at a time ───────

  await runTest('4. A job can only have one accepted agent at a time', async () => {
    const job = await createJob(alice);
    await placeBid(bob, job.id, sharedAgent.id);
    await placeBid(charlie, job.id, secondaryAgent.id);
    await acceptJob(alice, job.id, sharedAgent.id);
    // Try to accept again with a different agent
    const res = await raw('POST', `/jobs/${job.id}/accept`, alice, { agentId: secondaryAgent.id });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // ─── 5. Ratings cannot be overwritten once written ─────────────

  await runTest('5. Ratings cannot be overwritten once written', async () => {
    const job = await createJob(alice);
    await placeBid(bob, job.id, sharedAgent.id);
    await acceptJob(alice, job.id, sharedAgent.id);
    await submitDeliverable(bob, job.id);
    await approveJob(alice, job.id);
    // First rating
    const r1 = await raw('POST', `/jobs/${job.id}/rate`, alice, { score: 4, comment: 'Good' });
    assert(r1.status === 200, `First rating failed: ${r1.status}`);
    // Second rating should be 409
    const r2 = await raw('POST', `/jobs/${job.id}/rate`, alice, { score: 1, comment: 'Changed mind' });
    assert(r2.status === 409, `Expected 409, got ${r2.status}`);
  });

  // ─── 6. Unauthorized roles cannot perform privileged transitions

  await runTest('6. Unauthorized roles cannot perform privileged transitions', async () => {
    const job = await createJob(alice);
    await placeBid(bob, job.id, sharedAgent.id);
    // Charlie (not the client) tries to accept — only the job's client can accept
    const res = await raw('POST', `/jobs/${job.id}/accept`, charlie, { agentId: sharedAgent.id });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // ─── 7. Deliverables cannot be submitted before acceptance ─────

  await runTest('7. Deliverables cannot be submitted before acceptance', async () => {
    const job = await createJob(alice);
    // Job is OPEN, try to submit
    const res = await raw('POST', `/jobs/${job.id}/submit`, bob, {
      deliverableHash: '0xabc123', notes: 'Too early',
    });
    assert([400, 403].includes(res.status), `Expected 400 or 403, got ${res.status}`);
  });

  // ─── 8. Approval cannot occur before a deliverable exists ──────

  await runTest('8. Approval cannot occur before a deliverable exists', async () => {
    const job = await createJob(alice);
    await placeBid(bob, job.id, sharedAgent.id);
    await acceptJob(alice, job.id, sharedAgent.id);
    // Job is IN_PROGRESS (no deliverable), try to approve
    const res = await raw('POST', `/jobs/${job.id}/approve`, alice);
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // ─── 9. Bids cannot be placed on non-OPEN jobs ────────────────

  await runTest('9. Bids cannot be placed on non-OPEN jobs', async () => {
    const job = await createJob(alice);
    await placeBid(bob, job.id, sharedAgent.id);
    await acceptJob(alice, job.id, sharedAgent.id);
    // Job is IN_PROGRESS, try to bid with a new agent
    const res = await raw('POST', `/jobs/${job.id}/bid`, charlie, {
      agentId: secondaryAgent.id, amount: 80, estimatedDuration: '1 day',
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // ─── 10. Self-dealing is blocked ───────────────────────────────

  await runTest('10. Self-dealing is blocked -- client cannot bid on own job', async () => {
    // Alice needs an agent to attempt self-bidding
    const aliceAgent = await registerAgent(alice);
    const job = await createJob(alice);
    const res = await raw('POST', `/jobs/${job.id}/bid`, alice, {
      agentId: aliceAgent.id, amount: 50, estimatedDuration: '1 day',
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // ─── Summary ──────────────────────────────────────────────────

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n${BOLD}${CYAN}=== Summary ===${RESET}`);
  console.log(`  ${GREEN}Passed: ${passed}${RESET}  ${failed > 0 ? RED : ''}Failed: ${failed}${RESET}  Total: ${results.length}`);

  if (failed > 0) {
    console.log(`\n  ${RED}Failed invariants:${RESET}`);
    for (const r of results.filter(r => !r.passed)) {
      console.log(`    - ${r.name}: ${r.detail}`);
    }
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n${RED}Fatal error:${RESET}`, err.message);
  process.exit(2);
});
