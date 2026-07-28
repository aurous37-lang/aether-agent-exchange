#!/usr/bin/env npx tsx
// ─── Full Lifecycle Simulation ──────────────────────────────────
// Runs a complete marketplace simulation with 2 test wallets:
//
//   Alice = Client — posts jobs, funds escrow, approves, rates
//   Bob   = Handler — runs 2 dummy agents that bid, accept, work, submit
//
// Simulates fake USDC/MON currency with escrow payouts and 1.7% fees.

import { WALLET_ALICE, WALLET_BOB, FakeLedger, logHeader, logStep, logSuccess, logDim, logError, sleep } from './helpers';
import { DummyAgent } from './dummy-agent';
import { TestClient } from './test-client';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

async function main() {
  console.log(`
${BOLD}${CYAN}╔════════════════════════════════════════════════════════════╗
║            AETHER AGENT EXCHANGE — SIMULATION              ║
║                  Local Test Environment                     ║
╚════════════════════════════════════════════════════════════╝${RESET}
`);

  // ─── Initialize Fake Currency ─────────────────────────────────

  logHeader('Phase 0: Fund Test Wallets');

  const ledger = new FakeLedger();
  ledger.fund(WALLET_ALICE.address, 1000, 500);  // Alice gets 1000 USDC + 500 MON
  ledger.fund(WALLET_BOB.address, 0, 100);        // Bob gets 100 MON (handlers earn, not spend)

  logStep('💎', `Alice (Client):  ${WALLET_ALICE.address}`);
  logDim(`  Funded: 1000 USDC + 500 MON`);
  logStep('💎', `Bob (Handler):   ${WALLET_BOB.address}`);
  logDim(`  Funded: 100 MON`);

  // ─── Authenticate Both Wallets ────────────────────────────────

  logHeader('Phase 1: Wallet Authentication');

  const alice = new TestClient(
    { account: WALLET_ALICE, displayName: 'Alice (Test Client)' },
    ledger
  );
  await alice.init();

  const agentAlpha = new DummyAgent({
    account: WALLET_BOB,
    name: 'Alpha',
    description: 'Fast full-stack agent specializing in smart contracts and backend services. Test agent for simulation.',
    capabilities: ['solidity', 'typescript', 'nodejs', 'testing'],
    models: ['test-model-primary'],
    bidStrategy: 'undercut',
    workDurationMs: 3000,
  });
  await agentAlpha.init();

  // Re-auth Bob for a second agent with different config
  const agentBeta = new DummyAgent({
    account: WALLET_BOB,
    name: 'Beta',
    description: 'Research and content agent. Handles analysis, documentation, and reports. Test agent for simulation.',
    capabilities: ['research', 'data-analysis', 'content-writing', 'documentation'],
    models: ['test-model-fast'],
    bidStrategy: 'match',
    workDurationMs: 2000,
  });
  // Beta reuses Bob's wallet — can't register a second agent with same wallet
  // Instead, Beta will use Bob's auth but bid as Alpha's agent
  // For a proper 2-agent test, we'll have Alpha handle both job types

  // ─── Post Jobs ────────────────────────────────────────────────

  logHeader('Phase 2: Client Posts Jobs');

  const job1 = await alice.postJob({
    title: 'Build ERC-721 Enumerable Token',
    description: 'Create an ERC-721 NFT contract with enumerable extension. Must include minting, burning, metadata URI, and royalty support (EIP-2981). Foundry tests required.',
    category: 'BLOCKCHAIN_WEB3',
    deliverables: ['Solidity contract', 'Foundry test suite', 'Deploy script'],
    budgetAmount: 120,
    budgetToken: 'USDC',
    acceptanceCriteria: 'All tests pass, EIP-2981 compliant, gas optimized',
  });

  await sleep(500);

  const job2 = await alice.postJob({
    title: 'Market Analysis: L1 Chain Comparison Report',
    description: 'Research report comparing Monad, Solana, and Ethereum L2s for DeFi deployment. Include TPS benchmarks, cost analysis, ecosystem maturity, and developer tooling assessment.',
    category: 'RESEARCH',
    deliverables: ['Markdown report (2000+ words)', 'Comparison matrix', 'Recommendation summary'],
    budgetAmount: 60,
    budgetToken: 'USDC',
  });

  await sleep(500);

  const job3 = await alice.postJob({
    title: 'CI/CD Pipeline with Slither Integration',
    description: 'Set up GitHub Actions for a Solidity project with Foundry build, test, coverage, Slither static analysis, and automated testnet deploy on main merge.',
    category: 'AUTOMATION',
    deliverables: ['GitHub Actions workflow files', 'Configuration docs'],
    budgetAmount: 40,
    budgetToken: 'MON',
  });

  // ─── Agents Scan and Bid ──────────────────────────────────────

  logHeader('Phase 3: Agents Scan & Bid');

  await sleep(500);

  // Alpha bids on jobs
  const bid1 = await agentAlpha.scanAndBid();
  await sleep(300);
  const bid2 = await agentAlpha.scanAndBid();
  await sleep(300);
  const bid3 = await agentAlpha.scanAndBid();

  // ─── Client Reviews Bids ──────────────────────────────────────

  logHeader('Phase 4: Client Reviews Bids');

  await sleep(500);

  const bids1 = await alice.viewBids(job1.id);
  await sleep(300);
  const bids2 = await alice.viewBids(job2.id);

  // ─── Job 1: Full Happy Path ───────────────────────────────────

  logHeader('Phase 5: Job Lifecycle — Happy Path (USDC)');
  logDim(`Job: "${job1.title}"`);

  await sleep(500);

  // Client accepts the bid, then agent works and submits
  await alice.acceptBid(job1.id, agentAlpha.id);
  const accepted = await agentAlpha.workAndSubmit(job1.id);
  if (!accepted) {
    logError('Agent could not complete job 1 — skipping');
  } else {
    await sleep(500);

    // Client approves
    await alice.approveDeliverable(
      job1.id,
      agentAlpha.wallet,
      120,
      'USDC'
    );

    await sleep(300);

    // Client rates
    await alice.rateAgent(job1.id, 5, 'Excellent smart contract work. Clean code, comprehensive tests.');
  }

  // ─── Job 3: Full Path with MON Token ──────────────────────────

  logHeader('Phase 6: Job Lifecycle — MON Token Payment');
  logDim(`Job: "${job3.title}"`);

  await sleep(500);

  await alice.acceptBid(job3.id, agentAlpha.id);
  const accepted3 = await agentAlpha.workAndSubmit(job3.id);
  if (!accepted3) {
    logError('Agent could not complete job 3 — skipping');
  } else {
    await sleep(500);

    await alice.approveDeliverable(
      job3.id,
      agentAlpha.wallet,
      40,
      'MON'
    );

    await sleep(300);

    await alice.rateAgent(job3.id, 4, 'Good automation work, delivered on time.');
  }

  // ─── Job 2: Dispute Path ──────────────────────────────────────

  logHeader('Phase 7: Job Lifecycle — Dispute Path');
  logDim(`Job: "${job2.title}"`);

  await sleep(500);

  // Client accepts bid, then agent works and submits
  await alice.acceptBid(job2.id, agentAlpha.id);
  const accepted2 = await agentAlpha.workAndSubmit(job2.id);
  if (accepted2) {
    await sleep(500);

    // Client disputes instead of approving
    const dispute = await alice.disputeJob(job2.id, 'Report lacks data sources and the comparison matrix is incomplete. Key metrics missing.');
    logDim(`Dispute ID: ${dispute.id}`);
  }

  // ─── Final Dashboard ──────────────────────────────────────────

  logHeader('Phase 8: Dashboard Summary');

  await sleep(500);

  // Client dashboard
  logStep('📊', `Alice's Client Dashboard:`);
  const clientDash = await alice.viewDashboard();
  logDim(`  Jobs Posted:     ${clientDash.totalPosted}`);
  logDim(`  Open:            ${clientDash.open}`);
  logDim(`  In Progress:     ${clientDash.inProgress}`);
  logDim(`  Pending Review:  ${clientDash.pendingReview}`);
  logDim(`  Completed:       ${clientDash.completed}`);
  logDim(`  Total Spent:     $${clientDash.totalSpent}`);

  // Final balances
  logStep('💰', 'Final Ledger Balances:');
  ledger.print();

  // Transaction summary
  logHeader('Transaction Log');
  const aliceBal = ledger.balance(WALLET_ALICE.address);
  const bobBal = ledger.balance(WALLET_BOB.address);
  const treasury = ledger.balance('0x0000000000000000000000000000000000000001');

  logStep('📒', 'Alice (Client):');
  logDim(`  Started:  1000 USDC, 500 MON`);
  logDim(`  Current:  ${aliceBal.USDC} USDC, ${aliceBal.MON} MON`);
  logDim(`  Spent:    ${1000 - aliceBal.USDC} USDC, ${500 - aliceBal.MON} MON`);

  logStep('📒', 'Bob / Agent Alpha (Handler):');
  logDim(`  Started:  0 USDC, 100 MON`);
  logDim(`  Current:  ${bobBal.USDC} USDC, ${bobBal.MON} MON`);
  logDim(`  Earned:   ${bobBal.USDC} USDC, ${bobBal.MON - 100} MON (after 1.7% fee)`);

  logStep('📒', 'Platform Treasury:');
  logDim(`  Collected: ${treasury.USDC} USDC, ${treasury.MON} MON (1.7% fees)`);

  console.log(`
${BOLD}${GREEN}╔════════════════════════════════════════════════════════════╗
║                  SIMULATION COMPLETE                       ║
╚════════════════════════════════════════════════════════════╝${RESET}
`);
}

main().catch((e) => {
  logError(`Simulation failed: ${e.message}`);
  console.error(e);
  process.exit(1);
});
