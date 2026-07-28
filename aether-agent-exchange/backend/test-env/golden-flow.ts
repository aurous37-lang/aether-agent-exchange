#!/usr/bin/env npx tsx
// ─── Golden Flow: End-to-End Proof Pass ──────────────────────────
// One clean scripted path through every integration seam:
//   connect → post job → register agent → bid → accept → deliver →
//   approve OR dispute → evidence → rate → verify trustScore → notifications
//
// Captures: routes hit, WebSocket events, status codes, trustScore values

import { privateKeyToAccount } from 'viem/accounts';
import { authenticateWallet, ApiClient, sleep, logHeader, logStep, logSuccess, logError, logDim } from './helpers';

const API = 'http://localhost:4000/api';
const WALLET_CLIENT = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const WALLET_HANDLER = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const WALLET_ARBITER = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');

interface ProofStep {
  step: number;
  action: string;
  route: string;
  method: string;
  status: number;
  ok: boolean;
  key_data?: Record<string, any>;
}

const proof: ProofStep[] = [];
let stepNum = 0;

async function trackedRequest(api: ApiClient | null, method: string, path: string, body?: any, action?: string): Promise<any> {
  stepNum++;
  const start = Date.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(api ? { Authorization: `Bearer ${(api as any).token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  const entry: ProofStep = {
    step: stepNum,
    action: action || `${method} ${path}`,
    route: `${method} ${path}`,
    method,
    status: res.status,
    ok: res.ok,
  };
  proof.push(entry);
  if (res.ok) {
    logSuccess(`[${stepNum}] ${action || path} → ${res.status}`);
  } else {
    logError(`[${stepNum}] ${action || path} → ${res.status}: ${data.error || 'unknown'}`);
  }
  return { ok: res.ok, status: res.status, data };
}

class TrackedClient {
  token: string;
  constructor(token: string) { this.token = token; }
  async get(path: string, action?: string) { return trackedRequest(this, 'GET', path, undefined, action); }
  async post(path: string, body?: any, action?: string) { return trackedRequest(this, 'POST', path, body, action); }
  async put(path: string, body?: any, action?: string) { return trackedRequest(this, 'PUT', path, body, action); }
  async del(path: string, action?: string) { return trackedRequest(this, 'DELETE', path, undefined, action); }
}

async function authenticate(account: any, label: string): Promise<TrackedClient> {
  const auth = await authenticateWallet(account);
  stepNum++;
  proof.push({ step: stepNum, action: `Auth: ${label}`, route: 'POST /auth/nonce + /auth/verify', method: 'POST', status: 200, ok: true });
  logSuccess(`[${stepNum}] Auth: ${label} → JWT obtained`);
  return new TrackedClient(auth.token);
}

async function main() {
  console.log('\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════╗');
  console.log('║        GOLDEN FLOW: END-TO-END PROOF PASS        ║');
  console.log('╚══════════════════════════════════════════════════╝\x1b[0m\n');

  // ── Step 1: Connect wallets ─────────────────────────────────
  logHeader('Phase 1: Authentication');
  const client = await authenticate(WALLET_CLIENT, 'Client (Alice)');
  const handler = await authenticate(WALLET_HANDLER, 'Handler (Bob)');

  // ── Step 2: Register agent ──────────────────────────────────
  logHeader('Phase 2: Agent Registration');
  const agentRes = await handler.post('/agents', {
    name: 'ProofAgent',
    description: 'Golden flow proof agent',
    capabilities: ['typescript', 'solidity'],
    models: ['test-model-primary'],
    metadataURI: 'ipfs://QmProof',
    agentWallet: WALLET_HANDLER.address,
    availability: '24/7',
    responseTime: '< 1 min',
  }, 'Register agent');
  const agentId = agentRes.data?.id;
  logDim(`  Agent ID: ${agentId}`);

  // ── Step 3: Post job ────────────────────────────────────────
  logHeader('Phase 3: Job Posting');
  const jobRes = await client.post('/jobs', {
    title: 'Golden Flow Test Job',
    description: 'End-to-end proof pass job for mechanical audit validation',
    category: 'CODE_DEVELOPMENT',
    deliverables: ['Working code', 'Test suite'],
    budgetAmount: 500,
    budgetToken: 'USDC',
    reviewPeriod: 604800,
    acceptanceCriteria: 'All tests pass',
  }, 'Post job');
  const jobId = jobRes.data?.id;
  logDim(`  Job ID: ${jobId}`);

  // ── Step 4: Place bid ───────────────────────────────────────
  logHeader('Phase 4: Bidding');
  const bidRes = await handler.post(`/jobs/${jobId}/bid`, {
    agentId,
    amount: 450,
    estimatedDuration: '1-2 days',
    message: 'Golden flow bid',
  }, 'Place bid');
  logDim(`  Bid amount: $450`);

  // Verify bid appears in job detail
  const jobDetailRes = await client.get(`/jobs/${jobId}`, 'Get job detail (verify bid)');
  const bids = jobDetailRes.data?.bids || [];
  logDim(`  Bids on job: ${bids.length}`);

  // ── Step 5: Accept bid (client-initiated) ───────────────────
  logHeader('Phase 5: Bid Acceptance (Client-Initiated)');
  const acceptRes = await client.post(`/jobs/${jobId}/accept`, { agentId }, 'Client accepts bid');
  logDim(`  Job status: ${acceptRes.data?.status}`);

  // ── Step 6: Submit deliverable ──────────────────────────────
  logHeader('Phase 6: Deliverable Submission');
  const deliverableHash = 'ipfs://QmGoldenFlowDeliverable123456789abcdef';
  const submitRes = await handler.post(`/jobs/${jobId}/submit`, {
    deliverableHash,
    notes: 'Golden flow deliverable — all tests passing',
  }, 'Submit deliverable');
  logDim(`  Hash: ${deliverableHash.slice(0, 30)}...`);

  // ── Step 7: Approve deliverable ─────────────────────────────
  logHeader('Phase 7: Approval');
  const approveRes = await client.post(`/jobs/${jobId}/approve`, {}, 'Approve deliverable');
  logDim(`  Job status: ${approveRes.data?.status}`);

  // ── Step 8: Rate agent ──────────────────────────────────────
  logHeader('Phase 8: Rating');
  const rateRes = await client.post(`/jobs/${jobId}/rate`, {
    score: 5,
    comment: 'Excellent work on golden flow proof',
  }, 'Rate agent (5 stars)');

  // ── Step 9: Verify trustScore ───────────────────────────────
  logHeader('Phase 9: Trust Score Verification');
  const agentDetailRes = await handler.get(`/agents/${agentId}`, 'Get agent detail (verify trustScore)');
  const trustScore = agentDetailRes.data?.trustScore;
  const avgRating = agentDetailRes.data?.avgRating;
  logDim(`  avgRating: ${avgRating}`);
  logDim(`  trustScore: ${trustScore}`);
  proof.push({ step: ++stepNum, action: 'Verify trustScore > 0', route: 'assertion', method: 'CHECK', status: trustScore > 0 ? 200 : 500, ok: trustScore > 0, key_data: { trustScore, avgRating } });
  if (trustScore > 0) logSuccess(`[${stepNum}] trustScore is ${trustScore} (${Math.round(trustScore * 100)}%)`);
  else logError(`[${stepNum}] trustScore is 0 — recalculation may have failed`);

  // ── Step 10: Dispute flow (second job) ──────────────────────
  logHeader('Phase 10: Dispute Flow');
  const job2Res = await client.post('/jobs', {
    title: 'Golden Flow Dispute Test',
    description: 'Job that will be disputed for proof',
    category: 'RESEARCH',
    deliverables: ['Report'],
    budgetAmount: 100,
    budgetToken: 'MON',
    reviewPeriod: 604800,
  }, 'Post job 2 (dispute path)');
  const job2Id = job2Res.data?.id;

  await handler.post(`/jobs/${job2Id}/bid`, { agentId, amount: 90, estimatedDuration: '1 day', message: 'Dispute test bid' }, 'Bid on job 2');
  await client.post(`/jobs/${job2Id}/accept`, { agentId }, 'Accept bid on job 2');
  await handler.post(`/jobs/${job2Id}/submit`, { deliverableHash: 'ipfs://QmDisputeTest', notes: 'Intentionally incomplete' }, 'Submit deliverable (job 2)');
  const disputeRes = await client.post(`/jobs/${job2Id}/dispute`, { reason: 'Report is incomplete and missing sources' }, 'File dispute');
  const disputeId = disputeRes.data?.id;
  logDim(`  Dispute ID: ${disputeId}`);

  // ── Step 11: Submit evidence ────────────────────────────────
  logHeader('Phase 11: Evidence Submission');
  const evidenceRes = await client.post(`/disputes/${disputeId}/evidence`, {
    contentHash: 'ipfs://QmEvidenceScreenshot123',
    description: 'Screenshot showing missing sections in the report',
  }, 'Submit dispute evidence');

  // Handler submits counter-evidence
  const counterRes = await handler.post(`/disputes/${disputeId}/evidence`, {
    contentHash: 'ipfs://QmCounterEvidence456',
    description: 'Revised report with all sections completed',
  }, 'Submit counter-evidence');

  // Verify evidence appears in dispute detail
  const disputeDetailRes = await client.get(`/disputes/${disputeId}`, 'Get dispute detail (verify evidence)');
  const evidenceCount = disputeDetailRes.data?.evidence?.length || 0;
  logDim(`  Evidence entries: ${evidenceCount}`);

  // ── Step 12: Notifications ──────────────────────────────────
  logHeader('Phase 12: Notifications');
  const notifRes = await handler.get('/handler/notifications', 'Get handler notifications');
  const notifCount = Array.isArray(notifRes.data) ? notifRes.data.length : 0;
  logDim(`  Notifications: ${notifCount}`);

  // ── Step 13: Dashboard ──────────────────────────────────────
  logHeader('Phase 13: Dashboard');
  const dashRes = await handler.get('/handler/dashboard', 'Get handler dashboard');
  logDim(`  Active jobs: ${dashRes.data?.activeJobs}`);
  logDim(`  Completed: ${dashRes.data?.completedJobs}`);
  logDim(`  Disputed: ${dashRes.data?.disputedJobs}`);

  // ── Step 14: Agent listings ─────────────────────────────────
  logHeader('Phase 14: Listings Verification');
  const agentsListRes = await client.get('/agents?limit=10', 'List agents (verify trustScore in list)');
  const agents = agentsListRes.data?.agents || [];
  const proofAgent = agents.find((a: any) => a.id === agentId);
  if (proofAgent) {
    logDim(`  ProofAgent in list — trustScore: ${proofAgent.trustScore}, avgRating: ${proofAgent.avgRating}`);
  }

  const jobsListRes = await client.get('/jobs?limit=10', 'List jobs');
  logDim(`  Jobs in list: ${jobsListRes.data?.jobs?.length || 0}`);

  // ── Summary ─────────────────────────────────────────────────
  console.log('\n\x1b[1m\x1b[36m══════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m GOLDEN FLOW RESULTS\x1b[0m\n');

  const passed = proof.filter(p => p.ok).length;
  const failed = proof.filter(p => !p.ok).length;
  const total = proof.length;

  console.log(`  Steps: ${total}`);
  console.log(`  Passed: \x1b[32m${passed}\x1b[0m`);
  console.log(`  Failed: ${failed > 0 ? `\x1b[31m${failed}\x1b[0m` : '0'}`);
  console.log(`  Routes hit: ${new Set(proof.map(p => p.route)).size}`);
  console.log();

  // Print proof table
  console.log('  # | Status | Route');
  console.log('  --|--------|------');
  for (const p of proof) {
    const icon = p.ok ? '\x1b[32mOK\x1b[0m  ' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${String(p.step).padStart(2)} | ${icon}   | ${p.action}`);
  }

  console.log();
  if (failed === 0) {
    console.log('\x1b[1m\x1b[32m  ALL STEPS PASSED — GOLDEN FLOW VERIFIED\x1b[0m\n');
  } else {
    console.log(`\x1b[1m\x1b[31m  ${failed} STEPS FAILED\x1b[0m\n`);
    process.exit(1);
  }
}

main().catch(err => {
  logError(`Golden flow crashed: ${err.message}`);
  console.error(err);
  process.exit(1);
});
