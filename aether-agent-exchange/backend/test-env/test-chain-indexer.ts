#!/usr/bin/env npx tsx
// Focused chain indexer projection tests.

import assert from 'assert';
import { Interface } from 'ethers';
import prisma from '../src/lib/prisma';
import { CHAINS } from '../src/config/chains';
import { decodedEventArgs, persistEscrowLifecycleEvent, planChainIndexerRanges, reconcileCanonicalEventsForRange } from '../src/services/chainIndexer';
import { loadEscrowLifecycleEvidence } from '../src/services/escrowLifecycle';
import { WALLET_ALICE, WALLET_BOB, hashForFixture, seedIndexedErc8183EscrowFunded } from './helpers';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BASE_SEPOLIA_USDC_TOKEN = '0x7D60207c8b23Df81c4512cC2ffcd30DED775AA0f';

let passed = 0;
let failed = 0;
let escrowCounter = 0xa100;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ${GREEN}✓${RESET} ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ${RED}✗${RESET} ${name}`);
    console.log(`    ${RED}${e.message}${RESET}`);
  }
}

function escrowAddress(): string {
  escrowCounter += 1;
  const entropy = `${Date.now().toString(16)}${Math.floor(Math.random() * 0xfffffff).toString(16)}${escrowCounter.toString(16)}`;
  return `0x${entropy.padStart(40, '0').slice(-40)}`;
}

function bytes32(seed: string): string {
  return hashForFixture(seed, 'b');
}

function txHash(seed: string): string {
  return hashForFixture(seed, 'c');
}

function uintBytes32(value: number | bigint): string {
  return `0x${BigInt(value).toString(16).padStart(64, '0')}`;
}

function addressWithSuffix(suffix: string): string {
  return `0x${suffix.replace(/^0x/, '').padStart(40, '0').slice(-40)}`;
}

async function ensureUser(walletAddress: string, displayName: string, role = 'CLIENT') {
  return prisma.user.upsert({
    where: { walletAddress: walletAddress.toLowerCase() },
    update: {},
    create: {
      walletAddress: walletAddress.toLowerCase(),
      displayName,
      role,
      termsAcceptedAt: new Date(),
      policyVersion: 'test',
    },
  });
}

async function createAgent(handlerId: string, agentId: string) {
  return prisma.agent.create({
    data: {
      agentId,
      walletAddress: `0x${Math.floor(Math.random() * 0xffffffffffff).toString(16).padStart(40, '0')}`,
      handlerId,
      metadataURI: `ipfs://chain-indexer-${Date.now()}-${Math.random()}`,
      name: `Chain Indexer Agent ${Date.now()}`,
      description: 'Chain indexer projection fixture agent.',
      capabilities: JSON.stringify(['chain-indexer']),
      models: JSON.stringify(['fixture']),
    },
  });
}

async function createDirectWalletJob(overrides: Record<string, unknown> = {}) {
  const client = await ensureUser(WALLET_ALICE.address, 'Chain Indexer Client');
  const handler = await ensureUser(WALLET_BOB.address, 'Chain Indexer Handler', 'HANDLER');
  const agentId = bytes32(`agent-${Date.now()}-${Math.random()}`);
  const agent = await createAgent(handler.id, agentId);
  const onchainJobId = bytes32(`job-${Date.now()}-${Math.random()}`);
  const escrow = escrowAddress();

  const job = await (prisma as any).job.create({
    data: {
      title: `Chain Indexer Projection ${Date.now()}`,
      description: 'Direct wallet escrow lifecycle projection test job.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: JSON.stringify(['indexed lifecycle evidence']),
      budgetAmount: 0.001,
      budgetToken: 'ETH',
      settlementRail: 'standard',
      network: 'ethereum-sepolia',
      chainId: 11155111,
      escrowAddress: escrow,
      onchainJobId,
      escrowContractVersion: 'native-eth',
      status: 'OPEN',
      settlementStatus: 'PENDING',
      clientId: client.id,
      ...overrides,
    },
  });

  return { client, handler, agent, agentId, job, onchainJobId, escrow };
}

function eventInput(job: any, eventName: string, index: number, overrides: Record<string, unknown> = {}) {
  const chain = CHAINS['ethereum-sepolia'];
  return {
    chainKey: chain.key,
    chainId: chain.chainId,
    caip2Network: chain.caip2Network,
    txHash: txHash(`${job.id}-${eventName}-${index}`),
    logIndex: index,
    blockNumber: 1000 + index,
    blockHash: hashForFixture(`${job.id}-block-${index}`, 'd'),
    transactionIndex: 0,
    contractAddress: job.escrowAddress,
    escrowAddress: job.escrowAddress,
    eventName,
    onchainJobId: job.onchainJobId,
    finalityStatus: 'FINAL' as const,
    confirmations: 12,
    decodedArgs: {},
    ...overrides,
  };
}

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━ Chain Indexer Projection Tests ━━━${RESET}\n`);

  await test('scan planner keeps cursor monotonic when reorg depth exceeds RPC batch size', async () => {
    const first = planChainIndexerRanges({
      lastIndexedBlock: 1000,
      finalizedBlock: 1010,
      startBlock: 0,
      reorgDepth: 64,
      maxBlocks: 10,
      reorgScanBlock: 900,
    });
    assert.equal(first.nextLastIndexedBlock, 1010);
    assert.deepEqual(first.ranges, [
      { kind: 'forward', fromBlock: 1001, toBlock: 1010 },
      { kind: 'reorg', fromBlock: 947, toBlock: 956 },
    ]);
    assert.equal(first.nextReorgScanBlock, 957);

    const second = planChainIndexerRanges({
      lastIndexedBlock: first.nextLastIndexedBlock,
      finalizedBlock: 1015,
      startBlock: 0,
      reorgDepth: 64,
      maxBlocks: 10,
      reorgScanBlock: first.nextReorgScanBlock,
    });
    assert.equal(second.nextLastIndexedBlock, 1015);
    assert.deepEqual(second.ranges, [
      { kind: 'forward', fromBlock: 1011, toBlock: 1015 },
      { kind: 'reorg', fromBlock: 957, toBlock: 966 },
    ]);

    const caughtUp = planChainIndexerRanges({
      lastIndexedBlock: second.nextLastIndexedBlock,
      finalizedBlock: second.nextLastIndexedBlock,
      startBlock: 0,
      reorgDepth: 64,
      maxBlocks: 10,
      reorgScanBlock: second.nextReorgScanBlock,
    });
    assert.equal(caughtUp.nextLastIndexedBlock, 1015);
    assert.deepEqual(caughtUp.ranges, [
      { kind: 'reorg', fromBlock: 967, toBlock: 976 },
    ]);
  });

  await test('factory event decoding preserves named ethers Result arguments', async () => {
    const iface = new Interface(['event EscrowCreated(bytes32 indexed jobId, address escrow, address indexed client, uint256 amount)']);
    const jobId = bytes32('ethers-result-job');
    const escrow = addressWithSuffix('e5c35d6');
    const client = WALLET_ALICE.address;
    const amount = 1_000_000n;
    const log = iface.encodeEventLog(iface.getEvent('EscrowCreated')!, [jobId, escrow, client, amount]);
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    const decoded = decodedEventArgs(parsed!.args);

    assert.equal(decoded.jobId, jobId);
    assert.equal(decoded.escrow.toLowerCase(), escrow.toLowerCase());
    assert.equal(decoded.client.toLowerCase(), client.toLowerCase());
    assert.equal(decoded.amount, amount.toString());
  });

  await test('direct wallet lifecycle events project into canonical job state', async () => {
    const { agent, agentId, job, escrow } = await createDirectWalletJob();

    await persistEscrowLifecycleEvent(eventInput(job, 'EscrowCreated', 0, {
      contractAddress: '0x000000000000000000000000000000000000faca',
      factoryAddress: '0x000000000000000000000000000000000000faca',
      clientAddress: WALLET_ALICE.address,
      amountGross: '1000000000000000',
      tokenSymbol: 'ETH',
      escrowContractVersion: 'native-eth',
      factoryBound: true,
      factoryBindingStatus: 'FACTORY_EVENT_VERIFIED',
      decodedArgs: {
        jobId: job.onchainJobId,
        escrow: job.escrowAddress,
        client: WALLET_ALICE.address,
        amount: '1000000000000000',
      },
    }));
    await persistEscrowLifecycleEvent(eventInput(job, 'EscrowFunded', 1, {
      clientAddress: WALLET_ALICE.address,
      amountGross: '1000000000000000',
      decodedArgs: { jobId: job.onchainJobId, client: WALLET_ALICE.address, amount: '1000000000000000' },
    }));
    await persistEscrowLifecycleEvent(eventInput(job, 'EscrowFunded', 1, {
      clientAddress: WALLET_ALICE.address,
      amountGross: '1000000000000000',
      decodedArgs: { jobId: job.onchainJobId, client: WALLET_ALICE.address, amount: '1000000000000000' },
    }));

    let eventCount = await (prisma as any).indexedChainEvent.count({ where: { jobId: job.id, eventName: 'EscrowFunded' } });
    assert.equal(eventCount, 1, 'duplicate chain event should upsert idempotently');

    let projected = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(projected?.settlementStatus, 'FUNDED');
    assert.equal(projected?.status, 'FUNDED');

    let lifecycle = await loadEscrowLifecycleEvidence(job.id, projected);
    assert.equal(lifecycle.canonicalState, 'FUNDED_OPEN');
    assert.equal(lifecycle.nextAction, 'ACCEPT_BID_BACKEND');

    await persistEscrowLifecycleEvent(eventInput(job, 'WorkStarted', 2, {
      agentAddress: agent.walletAddress,
      decodedArgs: { jobId: job.onchainJobId, agentId },
    }));
    projected = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(projected?.status, 'IN_PROGRESS');
    assert.equal(projected?.agentId, agent.id);
    assert(projected?.acceptedAt, 'WorkStarted should set acceptedAt');

    await persistEscrowLifecycleEvent(eventInput(job, 'DeliverableSubmitted', 3, {
      decodedArgs: { jobId: job.onchainJobId, deliverableHash: bytes32(`deliverable-${job.id}`) },
    }));
    projected = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(projected?.status, 'PENDING_REVIEW');

    await persistEscrowLifecycleEvent(eventInput(job, 'JobApproved', 4, {
      agentPayout: '983000000000000',
      platformFee: '17000000000000',
      decodedArgs: { jobId: job.onchainJobId, agentPayout: '983000000000000', platformFee: '17000000000000' },
    }));
    projected = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(projected?.status, 'PENDING_REVIEW', 'release evidence alone must not complete paid job');
    assert.equal(projected?.settlementStatus, 'FUNDED', 'release evidence alone must not mark settlement settled');
    assert.equal(projected?.completedByEvaluatorAt, null, 'release evidence alone must not set completion timestamp');

    lifecycle = await loadEscrowLifecycleEvidence(job.id, projected);
    assert.equal(lifecycle.canonicalState, 'RELEASED_ONCHAIN');
    assert.equal(lifecycle.nextAction, 'FINALIZED');

    const state = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: escrow.toLowerCase() } },
    });
    assert.equal(state?.state, 'COMPLETED');
    assert.equal(state?.latestTransactionIndex, 0);
    assert.equal(state?.latestLogIndex, 4);
    assert.equal(state?.factoryBound, true);
    assert.equal(state?.factoryBindingStatus, 'FACTORY_EVENT_VERIFIED');
    assert.equal(state?.factoryBindingLogIndex, 0);
    assert.equal(state?.escrowContractVersion, 'native-eth');
    assert.equal(state?.tokenSymbol, 'ETH');

    await persistEscrowLifecycleEvent(eventInput(job, 'EscrowFunded', 9, {
      blockNumber: 1001,
      amountGross: '1000000000000000',
      decodedArgs: { jobId: job.onchainJobId, client: WALLET_ALICE.address, amount: '1000000000000000' },
    }));

    projected = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(projected?.status, 'PENDING_REVIEW', 'older indexed events must not change route-owned completion state');
    const afterLateEvent = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: escrow.toLowerCase() } },
    });
    assert.equal(afterLateEvent?.state, 'COMPLETED', 'older indexed events must not regress lifecycle state');

    await persistEscrowLifecycleEvent(eventInput(job, 'DisputeOpened', 10, {
      blockNumber: 1004,
      transactionIndex: 1,
      logIndex: 0,
      decodedArgs: { jobId: job.onchainJobId, disputedBy: WALLET_ALICE.address, reason: 'same block order guard' },
    }));
    await persistEscrowLifecycleEvent(eventInput(job, 'EscrowFunded', 11, {
      blockNumber: 1004,
      transactionIndex: 0,
      logIndex: 99,
      amountGross: '1000000000000000',
      decodedArgs: { jobId: job.onchainJobId, client: WALLET_ALICE.address, amount: '1000000000000000' },
    }));
    const afterSameBlockOlderTx = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: escrow.toLowerCase() } },
    });
    assert.equal(afterSameBlockOlderTx?.state, 'DISPUTED', 'same-block earlier transaction must not regress lifecycle state');
    assert.equal(afterSameBlockOlderTx?.latestTransactionIndex, 1);
  });

  await test('erc8183 JobCreated persists verified factory binding and preserves token metadata', async () => {
    const erc8183Factory = addressWithSuffix('8183');
    const erc8183Escrow = escrowAddress();
    const usdcToken = addressWithSuffix('a11ce');
    const onchainJobId = uintBytes32(12345);
    const { job } = await createDirectWalletJob({
      settlementRail: 'erc8183',
      budgetToken: 'USDC',
      tokenAddress: usdcToken,
      escrowAddress: null,
      onchainJobId,
      escrowContractVersion: 'erc8183',
    });

    await persistEscrowLifecycleEvent(eventInput({ ...job, escrowAddress: erc8183Escrow }, 'JobCreated', 0, {
      contractAddress: erc8183Factory,
      factoryAddress: erc8183Factory,
      escrowAddress: erc8183Escrow,
      clientAddress: WALLET_ALICE.address,
      agentAddress: WALLET_BOB.address,
      amountGross: '0',
      tokenAddress: usdcToken,
      tokenSymbol: 'USDC',
      escrowContractVersion: 'erc8183',
      factoryBound: true,
      factoryBindingStatus: 'FACTORY_EVENT_VERIFIED',
      decodedArgs: {
        jobId: '12345',
        client: WALLET_ALICE.address,
        provider: WALLET_BOB.address,
        evaluator: WALLET_ALICE.address,
        expiredAt: '4102444800',
        hook: addressWithSuffix('0'),
      },
    }));

    let state = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: erc8183Escrow.toLowerCase() } },
    });
    assert.equal(state?.state, 'UNFUNDED');
    assert.equal(state?.factoryBound, true);
    assert.equal(state?.factoryBindingStatus, 'FACTORY_EVENT_VERIFIED');
    assert.equal(state?.factoryAddress, erc8183Factory.toLowerCase());
    assert.equal(state?.escrowAddress, erc8183Escrow.toLowerCase());
    assert.equal(state?.onchainJobId, onchainJobId);
    assert.equal(state?.escrowContractVersion, 'erc8183');
    assert.equal(state?.tokenAddress, usdcToken.toLowerCase());
    assert.equal(state?.tokenSymbol, 'USDC');
    assert.equal(state?.amountGross, '0');

    let projected = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(projected?.escrowAddress, erc8183Escrow.toLowerCase(), 'factory-bound creation should backfill missing job escrow');
    assert.equal(projected?.settlementStatus, 'ESCROW_CREATED');

    await persistEscrowLifecycleEvent(eventInput({ ...job, escrowAddress: erc8183Escrow }, 'JobFunded', 1, {
      contractAddress: erc8183Factory,
      factoryAddress: erc8183Factory,
      escrowAddress: erc8183Escrow,
      clientAddress: WALLET_ALICE.address,
      amountGross: '1000000',
      decodedArgs: { jobId: '12345', client: WALLET_ALICE.address, amount: '1000000' },
    }));

    state = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: erc8183Escrow.toLowerCase() } },
    });
    assert.equal(state?.state, 'FUNDED');
    assert.equal(state?.factoryBound, true);
    assert.equal(state?.factoryBindingStatus, 'FACTORY_EVENT_VERIFIED');
    assert.equal(state?.amountGross, '1000000');
    assert.equal(state?.escrowContractVersion, 'erc8183', 'non-creation lifecycle events must not overwrite factory-bound version');
    assert.equal(state?.tokenAddress, usdcToken.toLowerCase(), 'non-creation lifecycle events must not overwrite factory-bound token');
    assert.equal(state?.tokenSymbol, 'USDC');

    projected = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(projected?.settlementStatus, 'FUNDED');

    const lifecycle = await loadEscrowLifecycleEvidence(job.id, projected);
    assert.equal(lifecycle.canonicalState, 'FUNDED_OPEN');
  });

  await test('ERC-8183 factory events project with verified creation binding', async () => {
    const { agent, job, escrow } = await createDirectWalletJob({
      settlementRail: 'erc8183',
      budgetAmount: 27,
      budgetToken: 'USDC',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      escrowContractVersion: 'erc8183',
    });

    await seedIndexedErc8183EscrowFunded({
      ...job,
      escrowAddress: escrow,
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      escrowContractVersion: 'erc8183',
    }, {
      amountGross: '27000000',
      createdBlockNumber: 3000,
      blockNumber: 3001,
    });

    const creationEvent = await (prisma as any).indexedChainEvent.findFirst({
      where: { jobId: job.id, eventName: 'JobCreated' },
    });
    assert.equal(creationEvent?.lifecycleType, 'ESCROW_CREATED');
    assert.equal(creationEvent?.factoryBound, true);
    assert.equal(creationEvent?.factoryBindingStatus, 'FACTORY_EVENT_VERIFIED');

    const state = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: escrow.toLowerCase() } },
    });
    assert.equal(state?.state, 'FUNDED');
    assert.equal(state?.factoryBound, true);
    assert.equal(state?.factoryBindingStatus, 'FACTORY_EVENT_VERIFIED');
    assert.equal(state?.escrowContractVersion, 'erc8183');
    assert.equal(state?.tokenAddress, BASE_SEPOLIA_USDC_TOKEN.toLowerCase());
    assert.equal(state?.amountGross, '27000000');

    const lifecycle = await loadEscrowLifecycleEvidence(job.id, job);
    assert.equal(lifecycle.canonicalState, 'FUNDED_OPEN');
    assert.equal(lifecycle.nextAction, 'ACCEPT_BID_BACKEND');

    const acceptedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        agentId: agent.id,
        acceptedAt: new Date(),
        status: 'FUNDED',
        settlementStatus: 'FUNDED',
      },
    });
    const acceptedLifecycle = await loadEscrowLifecycleEvidence(job.id, acceptedJob);
    assert.equal(acceptedLifecycle.canonicalState, 'FUNDED_OPEN');
    assert.equal(acceptedLifecycle.nextAction, 'SUBMIT_DELIVERABLE_ONCHAIN');
    assert.notEqual(acceptedLifecycle.nextAction, 'START_WORK_ONCHAIN');
    assert.equal(acceptedLifecycle.actionAvailability.startWorkOnchain.enabled, false);
    assert.equal(acceptedLifecycle.actionAvailability.submitDeliverableOnchain.enabled, true);
  });

  await test('canonical replay refreshes block hash for surviving event identity', async () => {
    const { job, escrow } = await createDirectWalletJob();
    const original = eventInput(job, 'EscrowFunded', 1, {
      blockNumber: 2001,
      blockHash: bytes32(`old-block-${job.id}`),
      amountGross: '1000000000000000',
      decodedArgs: { jobId: job.onchainJobId, client: WALLET_ALICE.address, amount: '1000000000000000' },
    });
    const replayed = {
      ...original,
      blockNumber: 2002,
      blockHash: bytes32(`new-block-${job.id}`),
      confirmations: 13,
    };

    await persistEscrowLifecycleEvent(original);
    await persistEscrowLifecycleEvent(replayed);

    const storedEvent = await (prisma as any).indexedChainEvent.findUnique({
      where: {
        chainId_txHash_logIndex: {
          chainId: 11155111,
          txHash: original.txHash.toLowerCase(),
          logIndex: original.logIndex,
        },
      },
    });
    assert.equal(storedEvent?.blockNumber, '2002');
    assert.equal(storedEvent?.blockHash, replayed.blockHash);
    assert.equal(storedEvent?.finalityStatus, 'FINAL');
    assert.equal(storedEvent?.removedAt, null);

    const state = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: escrow.toLowerCase() } },
    });
    assert.equal(state?.latestBlockNumber, '2002');
    assert.equal(state?.confirmations, 13);
  });

  await test('reorg reconciliation marks displaced events and recomputes lifecycle state', async () => {
    const { agent, agentId, job, escrow } = await createDirectWalletJob();

    await persistEscrowLifecycleEvent(eventInput(job, 'EscrowFunded', 1, {
      clientAddress: WALLET_ALICE.address,
      amountGross: '1000000000000000',
      decodedArgs: { jobId: job.onchainJobId, client: WALLET_ALICE.address, amount: '1000000000000000' },
    }));
    await persistEscrowLifecycleEvent(eventInput(job, 'WorkStarted', 2, {
      agentAddress: agent.walletAddress,
      decodedArgs: { jobId: job.onchainJobId, agentId },
    }));
    await persistEscrowLifecycleEvent(eventInput(job, 'DeliverableSubmitted', 3, {
      decodedArgs: { jobId: job.onchainJobId, deliverableHash: bytes32(`deliverable-${job.id}`) },
    }));
    const approved = eventInput(job, 'JobApproved', 4, {
      agentPayout: '983000000000000',
      platformFee: '17000000000000',
      decodedArgs: { jobId: job.onchainJobId, agentPayout: '983000000000000', platformFee: '17000000000000' },
    });
    await persistEscrowLifecycleEvent(approved);

    let state = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: escrow.toLowerCase() } },
    });
    assert.equal(state?.state, 'COMPLETED');

    const summary = await reconcileCanonicalEventsForRange(CHAINS['ethereum-sepolia'], 1004, 1004, [], [escrow]);
    assert.equal(summary.reorgedEvents, 1);
    assert.equal(summary.recomputedEscrows, 1);

    const reorgedEvent = await (prisma as any).indexedChainEvent.findUnique({
      where: {
        chainId_txHash_logIndex: {
          chainId: 11155111,
          txHash: approved.txHash.toLowerCase(),
          logIndex: approved.logIndex,
        },
      },
    });
    assert.equal(reorgedEvent?.finalityStatus, 'REORGED');
    assert(reorgedEvent?.removedAt, 'displaced event should record removedAt');

    state = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: escrow.toLowerCase() } },
    });
    assert.equal(state?.state, 'PENDING_REVIEW');
    assert.equal(state?.latestBlockNumber, '1003');
    assert.equal(state?.latestLogIndex, 3);

    const lifecycle = await loadEscrowLifecycleEvidence(job.id);
    assert.equal(lifecycle.canonicalState, 'DELIVERED_ONCHAIN');
  });

  await test('reorg reconciliation marks state reorged when no lifecycle events survive', async () => {
    const { job, escrow } = await createDirectWalletJob();
    const funded = eventInput(job, 'EscrowFunded', 1, {
      clientAddress: WALLET_ALICE.address,
      amountGross: '1000000000000000',
      decodedArgs: { jobId: job.onchainJobId, client: WALLET_ALICE.address, amount: '1000000000000000' },
    });
    await persistEscrowLifecycleEvent(funded);

    const summary = await reconcileCanonicalEventsForRange(CHAINS['ethereum-sepolia'], 1001, 1001, [], [escrow]);
    assert.equal(summary.reorgedEvents, 1);
    assert.equal(summary.recomputedEscrows, 1);

    const state = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId: 11155111, escrowAddress: escrow.toLowerCase() } },
    });
    assert.equal(state?.state, 'REORGED');
    assert.equal(state?.finalityStatus, 'REORGED');

    const lifecycle = await loadEscrowLifecycleEvidence(job.id);
    assert.equal(lifecycle.canonicalState, 'REORGED');
  });

  console.log(`\n${BOLD}${CYAN}Chain Indexer Projection Results${RESET}`);
  console.log(`  ${GREEN}Passed:${RESET} ${passed}`);
  console.log(`  ${failed ? RED : GREEN}Failed:${RESET} ${failed}`);

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
