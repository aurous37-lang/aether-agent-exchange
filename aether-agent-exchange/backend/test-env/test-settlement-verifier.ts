#!/usr/bin/env npx tsx
// Focused Base Sepolia settlement receipt verifier/indexer tests.

import assert from 'assert';
import http from 'http';
import { Interface } from 'ethers';
import prisma from '../src/lib/prisma';
import { amountToUnits, assertJobCanComplete } from '../src/services/settlement';
import { verifyAndRecordSettlementReceipt } from '../src/services/settlementVerifier';
import { verifyAndRecordX402SettlementReceipt, X402FacilitatorAdapter } from '../src/services/x402';
import { CHAINS, getChainById } from '../src/config/chains';
import { settlementReceiptSchema } from '../src/utils/validation';
import { baseSepoliaFundingProof, hashForFixture, WALLET_ALICE } from './helpers';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const SETTLEMENT_EVENT_INTERFACE = new Interface([
  'event JobApproved(bytes32 indexed jobId, uint256 agentPayout, uint256 platformFee)',
]);

let passed = 0;
let failed = 0;
let escrowCounter = 0x9000;

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
  return `0x${escrowCounter.toString(16).padStart(40, '0')}`;
}

function txHashFor(seed: string, fill: string): string {
  const hexSeed = seed.replace(/[^a-fA-F0-9]/g, '');
  return `0x${(hexSeed + fill.repeat(64)).slice(0, 64)}`;
}

async function ensureClient() {
  return prisma.user.upsert({
    where: { walletAddress: WALLET_ALICE.address.toLowerCase() },
    update: {},
    create: {
      walletAddress: WALLET_ALICE.address.toLowerCase(),
      displayName: 'Settlement Verifier Client',
      role: 'CLIENT',
      termsAcceptedAt: new Date(),
      policyVersion: 'test',
    },
  });
}

async function createPaidJob(overrides: Record<string, unknown> = {}) {
  const client = await ensureClient();
  const token = String(overrides.budgetToken || 'USDC');
  const amount = Number(overrides.budgetAmount || 25);
  return (prisma as any).job.create({
    data: {
      title: `Settlement Verifier ${Date.now()} ${Math.random()}`,
      description: 'Focused Base Sepolia settlement verifier fixture job.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: JSON.stringify(['verified settlement evidence']),
      budgetAmount: amount,
      budgetToken: token,
      settlementRail: 'standard',
      network: 'base-sepolia',
      chainId: 84532,
      escrowAddress: escrowAddress(),
      escrowContractVersion: token === 'ETH' ? 'native-eth' : 'legacy',
      status: 'PENDING_REVIEW',
      clientId: client.id,
      ...overrides,
    },
  });
}

function settlementInput(job: any, overrides: Record<string, any> = {}) {
  const tokenSymbol = overrides.tokenSymbol || job.budgetToken;
  const amount = overrides.amount || String(job.budgetAmount);
  const txHash = overrides.txHash || txHashFor(job.id, 'a');
  const receiptHash = overrides.receiptHash || hashForFixture(job.id, 'b');
  const amountAtomic = overrides.amountAtomic || amountToUnits(amount, tokenSymbol).toString();
  const nativeValue = tokenSymbol === 'ETH' || tokenSymbol === 'MON' ? amountAtomic : undefined;
  const escrow = overrides.escrowAddress || job.escrowAddress;

  return {
    receipt: overrides.receipt || `verified-receipt-${job.id}`,
    rail: overrides.rail || job.settlementRail,
    amount,
    tokenSymbol,
    tokenAddress: overrides.tokenAddress,
    walletAddress: WALLET_ALICE.address,
    escrowAddress: escrow,
    txHash,
    receiptHash,
    chainId: overrides.chainId || job.chainId,
    network: overrides.network || job.network,
    status: 'SETTLED',
    redactedReference: `verifier:${job.id.slice(0, 8)}`,
    escrowContractVersion: overrides.escrowContractVersion || job.escrowContractVersion,
    condition: overrides.condition || 'release',
    verificationProof: overrides.verificationProof || baseSepoliaFundingProof({
      jobId: job.id,
      txHash,
      receiptHash,
      escrowAddress: escrow,
      amountAtomic,
      tokenAddress: overrides.tokenAddress,
      nativeValue,
      status: overrides.proofStatus,
      condition: overrides.condition || 'release',
    }),
  };
}

async function expectReject(name: string, fn: () => Promise<unknown>, includes: string) {
  try {
    await fn();
    throw new Error(`${name} should have rejected`);
  } catch (error: any) {
    assert(String(error.message).includes(includes), `${name} should include "${includes}", got "${error.message}"`);
  }
}

async function startJsonRpcServer(handler: (method: string, params: any[]) => unknown): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const requests = JSON.parse(body || '[]');
      const batch = Array.isArray(requests) ? requests : [requests];
      const response = batch.map((entry: any) => {
        try {
          return {
            jsonrpc: '2.0',
            id: entry.id,
            result: handler(entry.method, entry.params || []),
          };
        } catch (error: any) {
          return {
            jsonrpc: '2.0',
            id: entry.id,
            error: { code: -32000, message: error.message || 'mock rpc error' },
          };
        }
      });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(Array.isArray(requests) ? response : response[0]));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'mock RPC server should listen on a TCP port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

function hexQuantity(value: number | bigint): string {
  return `0x${BigInt(value).toString(16)}`;
}

function mockTransaction(txHash: string, to: string) {
  return {
    hash: txHash,
    type: '0x2',
    accessList: [],
    blockHash: hashForFixture(`${txHash}:block`, 'd'),
    blockNumber: hexQuantity(200),
    transactionIndex: '0x0',
    confirmations: '0x4',
    from: WALLET_ALICE.address,
    gasPrice: '0x1',
    maxPriorityFeePerGas: '0x1',
    maxFeePerGas: '0x1',
    gas: '0x5208',
    to,
    value: '0x0',
    nonce: '0x1',
    input: '0x',
    chainId: '0x14a34',
    v: '0x1',
    r: hashForFixture(`${txHash}:r`, '1'),
    s: hashForFixture(`${txHash}:s`, '2'),
  };
}

function mockReceipt(txHash: string, job: any, amountAtomic: bigint) {
  const fee = amountAtomic * 17n / 1000n;
  const payout = amountAtomic - fee;
  const event = SETTLEMENT_EVENT_INTERFACE.encodeEventLog(
    SETTLEMENT_EVENT_INTERFACE.getEvent('JobApproved')!,
    [job.onchainJobId, payout, fee],
  );
  const blockHash = hashForFixture(`${txHash}:receipt-block`, 'e');
  return {
    transactionHash: txHash,
    hash: txHash,
    transactionIndex: '0x0',
    blockHash,
    blockNumber: hexQuantity(200),
    from: WALLET_ALICE.address,
    to: job.escrowAddress,
    cumulativeGasUsed: '0x5208',
    gasUsed: '0x5208',
    contractAddress: null,
    logsBloom: `0x${'0'.repeat(512)}`,
    status: '0x1',
    type: '0x2',
    effectiveGasPrice: '0x1',
    logs: [{
      address: job.escrowAddress,
      topics: event.topics,
      data: event.data,
      blockHash,
      blockNumber: hexQuantity(200),
      transactionHash: txHash,
      transactionIndex: '0x0',
      logIndex: '0x0',
      removed: false,
    }],
  };
}

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━ Base Sepolia Settlement Verifier Tests ━━━${RESET}\n`);

  await test('success records a verified settled PaymentLedger row', async () => {
    const job = await createPaidJob();
    const ledger = await verifyAndRecordSettlementReceipt(job.id, settlementInput(job));
    assert.equal(ledger.status, 'SETTLED');
    assert.equal(ledger.jobId, job.id);
    const verification = await (prisma as any).settlementReceiptVerification.findFirst({ where: { paymentLedgerId: ledger.id } });
    assert(verification, 'verification record should be linked to ledger');
    assert.equal(verification.status, 'PASSED');
    assert.equal(verification.network, 'base-sepolia');
    assert.equal(verification.chainId, 84532);
    assert.equal(verification.proofType, 'event');
    assert.equal(verification.condition, 'release');
    const indexedEvent = await (prisma as any).indexedChainEvent.findFirst({ where: { jobId: job.id } });
    assert.equal(indexedEvent, null, 'settlement verification must not create lifecycle indexer evidence');
    const lifecycle = await (prisma as any).escrowLifecycleState.findUnique({ where: { jobId: job.id } });
    assert.equal(lifecycle, null, 'settlement verification must not update escrow lifecycle projection');
  });

  await test('release proof accepts gross amount split across payout plus platform fee', async () => {
    const job = await createPaidJob({ budgetAmount: 25 });
    const gross = amountToUnits(job.budgetAmount, job.budgetToken);
    const fee = gross * 17n / 1000n;
    const payout = gross - fee;
    const input = settlementInput(job);
    input.verificationProof = {
      ...input.verificationProof,
      logs: [{
        address: job.escrowAddress,
        eventName: 'JobApproved',
        args: {
          agentPayout: payout.toString(),
          platformFee: fee.toString(),
        },
        logIndex: 0,
      }],
      contractState: undefined,
    };

    const ledger = await verifyAndRecordSettlementReceipt(job.id, input);
    assert.equal(ledger.status, 'SETTLED');
    const verification = await (prisma as any).settlementReceiptVerification.findFirst({ where: { paymentLedgerId: ledger.id } });
    assert.equal(verification?.eventName, 'JobApproved');
  });

  await test('under-confirmed settlement receipt is not accepted as final settlement', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job);
    input.verificationProof = {
      ...input.verificationProof,
      confirmations: 0,
      finalityStatus: 'PENDING',
    };
    await expectReject('under-confirmed receipt', () => verifyAndRecordSettlementReceipt(job.id, input), 'confirmations before final settlement');
  });

  await test('funding-only escrow proof is not accepted as final settlement', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job, { condition: 'funding' });
    await expectReject('funding-only settlement', () => verifyAndRecordSettlementReceipt(job.id, input), 'funding proof is not final settlement');
  });

  await test('wrong chain proof is rejected', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job);
    input.verificationProof = { ...input.verificationProof, chainId: 84531 };
    await expectReject('wrong chain', () => verifyAndRecordSettlementReceipt(job.id, input), 'chainId 84532');
  });

  await test('Base mainnet fixture proof is gated behind explicit mainnet enablement', async () => {
    const job = await createPaidJob({
      network: 'base',
      chainId: 8453,
      escrowAddress: escrowAddress(),
    });
    const input = settlementInput(job, {
      network: 'base',
      chainId: 8453,
      verificationProof: baseSepoliaFundingProof({
        jobId: job.id,
        txHash: txHashFor(job.id, 'c'),
        receiptHash: hashForFixture(job.id, 'd'),
        escrowAddress: job.escrowAddress,
        amountAtomic: amountToUnits(job.budgetAmount, job.budgetToken).toString(),
      }),
    });
    input.verificationProof.network = 'base';
    input.verificationProof.chainId = 8453;
    delete input.verificationProof;
    const previous = process.env.AAE_ENABLE_BASE_MAINNET_RECEIPT_INDEXER;
    process.env.AAE_ENABLE_BASE_MAINNET_RECEIPT_INDEXER = 'false';
    try {
      await expectReject('mainnet disabled', () => verifyAndRecordSettlementReceipt(job.id, input), 'AAE_ENABLE_BASE_MAINNET_RECEIPT_INDEXER');
    } finally {
      if (previous === undefined) delete process.env.AAE_ENABLE_BASE_MAINNET_RECEIPT_INDEXER;
      else process.env.AAE_ENABLE_BASE_MAINNET_RECEIPT_INDEXER = previous;
    }
  });

  await test('live RPC verifier tries fallback URLs when the primary has no receipt', async () => {
    const job = await createPaidJob({
      onchainJobId: hashForFixture(`fallback-job-${Date.now()}`, '9'),
    });
    const txHash = txHashFor(job.id, 'd');
    const receiptHash = hashForFixture(job.id, 'e');
    const amountAtomic = amountToUnits(job.budgetAmount, job.budgetToken);
    let primaryReceiptLookups = 0;
    let fallbackReceiptLookups = 0;

    const primary = await startJsonRpcServer((method) => {
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'eth_blockNumber') return hexQuantity(206);
      if (method === 'eth_getTransactionReceipt') {
        primaryReceiptLookups++;
        return null;
      }
      if (method === 'eth_getTransactionByHash') return null;
      throw new Error(`unsupported primary method ${method}`);
    });
    const fallback = await startJsonRpcServer((method) => {
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'eth_blockNumber') return hexQuantity(206);
      if (method === 'eth_getTransactionReceipt') {
        fallbackReceiptLookups++;
        return mockReceipt(txHash, job, amountAtomic);
      }
      if (method === 'eth_getTransactionByHash') return mockTransaction(txHash, job.escrowAddress);
      throw new Error(`unsupported fallback method ${method}`);
    });

    const chain = CHAINS['base-sepolia'];
    const previousRpcUrl = chain.rpcUrl;
    const previousFallbackUrls = chain.rpcFallbackUrls;
    const previousIndexerFlag = process.env.AAE_ENABLE_BASE_SEPOLIA_RECEIPT_INDEXER;
    chain.rpcUrl = primary.url;
    chain.rpcFallbackUrls = [fallback.url];
    process.env.AAE_ENABLE_BASE_SEPOLIA_RECEIPT_INDEXER = 'true';

    try {
      const input = settlementInput(job, {
        txHash,
        receiptHash,
        verificationProof: undefined,
        onchainJobId: job.onchainJobId,
      });
      delete input.verificationProof;

      const ledger = await verifyAndRecordSettlementReceipt(job.id, input);
      assert.equal(ledger.status, 'SETTLED');
      assert.equal(ledger.txHash, txHash.toLowerCase());
      assert.equal(primaryReceiptLookups, 1, 'primary RPC should be queried first');
      assert.equal(fallbackReceiptLookups, 1, 'fallback RPC should be queried after a null primary receipt');
    } finally {
      chain.rpcUrl = previousRpcUrl;
      chain.rpcFallbackUrls = previousFallbackUrls;
      if (previousIndexerFlag === undefined) delete process.env.AAE_ENABLE_BASE_SEPOLIA_RECEIPT_INDEXER;
      else process.env.AAE_ENABLE_BASE_SEPOLIA_RECEIPT_INDEXER = previousIndexerFlag;
      await primary.close();
      await fallback.close();
    }
  });

  await test('Monad mainnet chain config is available and uses chain ID 143', () => {
    assert.equal(CHAINS.monad.chainId, 143);
    assert.equal(CHAINS.monad.nativeCurrency.symbol, 'MON');
    assert(CHAINS.monad.supportedTokens.includes('MON'));
    assert(CHAINS.monad.settlementRails.includes('standard'));
    assert.equal(getChainById(143)?.key, 'monad');
    assert.equal(getChainById(10143)?.key, 'monad-testnet');
  });

  await test('Ethereum chain config is available for mainnet and Sepolia', () => {
    assert.equal(CHAINS.ethereum.chainId, 1);
    assert.equal(CHAINS.ethereum.nativeCurrency.symbol, 'ETH');
    assert(CHAINS.ethereum.supportedTokens.includes('USDC'));
    assert(CHAINS.ethereum.supportedTokens.includes('ETH'));
    assert.equal(getChainById(1)?.key, 'ethereum');
    assert.equal(getChainById(11155111)?.key, 'ethereum-sepolia');
  });

  await test('Ethereum Sepolia fixture proof records settled ledger without lifecycle projection', async () => {
    const job = await createPaidJob({
      network: 'ethereum-sepolia',
      chainId: 11155111,
      escrowAddress: escrowAddress(),
    });
    const txHash = txHashFor(job.id, 'e');
    const receiptHash = hashForFixture(job.id, 'f');
    const input = settlementInput(job, {
      network: 'ethereum-sepolia',
      chainId: 11155111,
      txHash,
      receiptHash,
      verificationProof: baseSepoliaFundingProof({
        jobId: job.id,
        txHash,
        receiptHash,
        escrowAddress: job.escrowAddress,
        amountAtomic: amountToUnits(job.budgetAmount, job.budgetToken).toString(),
        condition: 'release',
      }),
    });
    input.verificationProof.network = 'ethereum-sepolia';
    input.verificationProof.chainId = 11155111;

    const ledger = await verifyAndRecordSettlementReceipt(job.id, input);
    assert.equal(ledger.status, 'SETTLED');
    assert.equal(ledger.network, 'ethereum-sepolia');
    assert.equal(ledger.chainId, 11155111);

    const lifecycle = await (prisma as any).escrowLifecycleState.findUnique({ where: { jobId: job.id } });
    assert.equal(lifecycle, null, 'ethereum-sepolia settlement verification should not update lifecycle projection');
  });

  await test('Ethereum mainnet paid rails are gated before live verification', async () => {
    const job = await createPaidJob({
      network: 'ethereum',
      chainId: 1,
      escrowAddress: escrowAddress(),
    });
    const input = settlementInput(job, {
      network: 'ethereum',
      chainId: 1,
    });
    input.verificationProof.network = 'ethereum';
    input.verificationProof.chainId = 1;

    const previous = process.env.AAE_ENABLE_ETHEREUM_MAINNET_PAID_RAILS;
    process.env.AAE_ENABLE_ETHEREUM_MAINNET_PAID_RAILS = 'false';
    try {
      await expectReject('ethereum mainnet paid rail disabled', () => verifyAndRecordSettlementReceipt(job.id, input), 'AAE_ENABLE_ETHEREUM_MAINNET_PAID_RAILS');
    } finally {
      if (previous === undefined) delete process.env.AAE_ENABLE_ETHEREUM_MAINNET_PAID_RAILS;
      else process.env.AAE_ENABLE_ETHEREUM_MAINNET_PAID_RAILS = previous;
    }
  });

  await test('Monad testnet native MON rejects legacy escrow metadata', async () => {
    const job = await createPaidJob({
      network: 'monad-testnet',
      chainId: 10143,
      budgetToken: 'MON',
      budgetAmount: 0.02,
      escrowContractVersion: 'legacy',
      escrowAddress: escrowAddress(),
    });
    const input = settlementInput(job, {
      network: 'monad-testnet',
      chainId: 10143,
      tokenSymbol: 'MON',
      amount: '0.02',
      amountAtomic: amountToUnits('0.02', 'MON').toString(),
      escrowContractVersion: 'legacy',
    });
    input.verificationProof.network = 'monad-testnet';
    input.verificationProof.chainId = 10143;
    await expectReject('monad native legacy metadata', () => verifyAndRecordSettlementReceipt(job.id, input), 'Native MON');
  });

  await test('Monad testnet native MON rejects ERC20 token evidence', async () => {
    const job = await createPaidJob({
      network: 'monad-testnet',
      chainId: 10143,
      budgetToken: 'MON',
      budgetAmount: 0.02,
      escrowContractVersion: 'native-eth',
      tokenAddress: '0x0000000000000000000000000000000000001010',
      escrowAddress: escrowAddress(),
    });
    const input = settlementInput(job, {
      network: 'monad-testnet',
      chainId: 10143,
      tokenSymbol: 'MON',
      amount: '0.02',
      amountAtomic: amountToUnits('0.02', 'MON').toString(),
      tokenAddress: job.tokenAddress,
      escrowContractVersion: 'native-eth',
    });
    input.verificationProof.network = 'monad-testnet';
    input.verificationProof.chainId = 10143;
    await expectReject('monad native token address', () => verifyAndRecordSettlementReceipt(job.id, input), 'Native MON');
  });

  await test('Monad mainnet settlement proof is gated behind explicit paid-rail enablement', async () => {
    const job = await createPaidJob({
      network: 'monad',
      chainId: 143,
      budgetToken: 'MON',
      budgetAmount: 0.02,
      escrowContractVersion: 'native-eth',
      escrowAddress: escrowAddress(),
    });
    const input = settlementInput(job, {
      network: 'monad',
      chainId: 143,
      tokenSymbol: 'MON',
      amount: '0.02',
      amountAtomic: amountToUnits('0.02', 'MON').toString(),
      nativeValue: amountToUnits('0.02', 'MON').toString(),
      escrowContractVersion: 'native-eth',
    });
    input.verificationProof.network = 'monad';
    input.verificationProof.chainId = 143;
    const previous = process.env.AAE_ENABLE_MONAD_MAINNET_PAID_RAILS;
    process.env.AAE_ENABLE_MONAD_MAINNET_PAID_RAILS = 'false';
    try {
      await expectReject('monad mainnet disabled', () => verifyAndRecordSettlementReceipt(job.id, input), 'AAE_ENABLE_MONAD_MAINNET_PAID_RAILS');
    } finally {
      if (previous === undefined) delete process.env.AAE_ENABLE_MONAD_MAINNET_PAID_RAILS;
      else process.env.AAE_ENABLE_MONAD_MAINNET_PAID_RAILS = previous;
    }
  });

  await test('Monad mainnet fixture proof can record MON settlement only when explicitly enabled', async () => {
    const job = await createPaidJob({
      network: 'monad',
      chainId: 143,
      budgetToken: 'MON',
      budgetAmount: 0.03,
      escrowContractVersion: 'native-eth',
      escrowAddress: escrowAddress(),
    });
    const amountAtomic = amountToUnits('0.03', 'MON').toString();
    const input = settlementInput(job, {
      network: 'monad',
      chainId: 143,
      tokenSymbol: 'MON',
      amount: '0.03',
      amountAtomic,
      nativeValue: amountAtomic,
      escrowContractVersion: 'native-eth',
    });
    input.verificationProof.network = 'monad';
    input.verificationProof.chainId = 143;
    const previous = process.env.AAE_ENABLE_MONAD_MAINNET_PAID_RAILS;
    process.env.AAE_ENABLE_MONAD_MAINNET_PAID_RAILS = 'true';
    try {
      const ledger = await verifyAndRecordSettlementReceipt(job.id, input);
      assert.equal(ledger.status, 'SETTLED');
      assert.equal(ledger.network, 'monad');
      assert.equal(ledger.chainId, 143);
      assert.equal(ledger.tokenSymbol, 'MON');
    } finally {
      if (previous === undefined) delete process.env.AAE_ENABLE_MONAD_MAINNET_PAID_RAILS;
      else process.env.AAE_ENABLE_MONAD_MAINNET_PAID_RAILS = previous;
    }
  });

  await test('wrong amount proof is rejected', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job, { amountAtomic: '24000000' });
    input.verificationProof.logs[0].args.amount = '24000000';
    input.verificationProof.contractState.escrowAmount = '24000000';
    await expectReject('wrong amount', () => verifyAndRecordSettlementReceipt(job.id, input), 'event or contract state');
  });

  await test('native ETH value cannot satisfy an ERC20 job', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job);
    input.verificationProof = { ...input.verificationProof, value: '1000000000000000000' };
    await expectReject('native confusion', () => verifyAndRecordSettlementReceipt(job.id, input), 'native ETH value');
  });

  await test('wrong escrow proof is rejected', async () => {
    const job = await createPaidJob();
    const wrongEscrow = escrowAddress();
    const input = settlementInput(job);
    input.verificationProof.logs[0].address = wrongEscrow;
    input.verificationProof.contractState.address = wrongEscrow;
    await expectReject('wrong escrow', () => verifyAndRecordSettlementReceipt(job.id, input), 'event or contract state');
  });

  await test('duplicate tx and receipt references are idempotent only for the same job', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job);
    const firstLedger = await verifyAndRecordSettlementReceipt(job.id, input);
    const secondLedger = await verifyAndRecordSettlementReceipt(job.id, input);
    assert.equal(secondLedger.id, firstLedger.id);

    const replayJob = await createPaidJob();
    const replayInput = settlementInput(replayJob, {
      txHash: input.txHash,
      receiptHash: input.receiptHash,
    });
    await expectReject('duplicate replay', () => verifyAndRecordSettlementReceipt(replayJob.id, replayInput), 'another job');
  });

  await test('failed onchain receipt is rejected', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job, { proofStatus: 'failed' });
    await expectReject('failed receipt', () => verifyAndRecordSettlementReceipt(job.id, input), 'did not succeed');
  });

  await test('same escrow cannot be replayed across jobs', async () => {
    const escrow = escrowAddress();
    const firstJob = await createPaidJob({ escrowAddress: escrow });
    await verifyAndRecordSettlementReceipt(firstJob.id, settlementInput(firstJob));

    const secondJob = await createPaidJob({ escrowAddress: escrow });
    await expectReject('same escrow replay', () => verifyAndRecordSettlementReceipt(secondJob.id, settlementInput(secondJob)), 'another job');
  });

  await test('missing event and state proof is rejected', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job);
    input.verificationProof = {
      provider: 'fixture',
      network: 'base-sepolia',
      chainId: 84532,
      txHash: input.txHash,
      receiptHash: input.receiptHash,
      status: 'success',
      logs: [],
    };
    await expectReject('missing proof', () => verifyAndRecordSettlementReceipt(job.id, input), 'event or contract state');
  });

  await test('state proof without amount evidence is rejected', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job);
    input.verificationProof = {
      provider: 'fixture',
      network: 'base-sepolia',
      chainId: 84532,
      txHash: input.txHash,
      receiptHash: input.receiptHash,
      status: 'success',
      logs: [],
      contractState: {
        address: input.escrowAddress,
        state: 'FUNDED',
      },
    };
    await expectReject('state proof without amount', () => verifyAndRecordSettlementReceipt(job.id, input), 'amount evidence');
  });

  await test('inline fixture proof cannot be labeled as live RPC proof', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job);
    input.verificationProof = {
      ...input.verificationProof,
      provider: 'base-sepolia-rpc',
    };
    await expectReject('mislabeled fixture proof', () => verifyAndRecordSettlementReceipt(job.id, input), 'fixture provider');
  });

  await test('settlement receipt validation rejects unknown raw proof fields', async () => {
    const job = await createPaidJob();
    const input = settlementInput(job);
    const parsed = settlementReceiptSchema.safeParse({
      ...input,
      verificationProof: {
        ...input.verificationProof,
        rawCalldata: '0x1234',
      },
    });
    assert.equal(parsed.success, false);
  });

  await test('verified ledger does not complete the job without lifecycle approval', async () => {
    const job = await createPaidJob();
    const ledger = await verifyAndRecordSettlementReceipt(job.id, settlementInput(job));
    const stillPending = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(stillPending?.status, 'PENDING_REVIEW');

    const completionReceipt = await assertJobCanComplete(job, { ledgerId: ledger.id });
    assert.equal(completionReceipt?.id, ledger.id);
    const afterGateCheck = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(afterGateCheck?.status, 'PENDING_REVIEW');
  });

  await test('x402 facilitator evidence creates a settled ledger but does not complete the job', async () => {
    const job = await createPaidJob({
      settlementRail: 'x402',
      escrowAddress: null,
      escrowContractVersion: 'legacy',
    });
    const txHash = txHashFor(job.id, 'e');
    const receiptHash = hashForFixture(job.id, 'f');
    const adapter: X402FacilitatorAdapter = {
      verify: async () => ({
        ok: true,
        status: 'valid',
        reference: `facilitator:${job.id}`,
        payer: WALLET_ALICE.address,
        payee: '0x2222222222222222222222222222222222222222',
        amount: String(job.budgetAmount),
        tokenSymbol: job.budgetToken,
      }),
      settle: async () => ({
        ok: true,
        status: 'settled',
        txHash,
        receiptHash,
        reference: `facilitator:${job.id}`,
        payer: WALLET_ALICE.address,
        payee: '0x2222222222222222222222222222222222222222',
        amount: String(job.budgetAmount),
        tokenSymbol: job.budgetToken,
      }),
    };

    const ledger = await verifyAndRecordX402SettlementReceipt(job.id, {
      rail: 'x402',
      network: 'base-sepolia',
      chainId: 84532,
      caip2Network: 'eip155:84532',
      amount: String(job.budgetAmount),
      tokenSymbol: job.budgetToken,
      payerWallet: WALLET_ALICE.address,
      payeeWallet: '0x2222222222222222222222222222222222222222',
      endpoint: 'https://agent.example.test/resource',
      txHash,
      receiptHash,
      facilitatorReference: `facilitator:${job.id}`,
      receipt: 'redacted-x402-facilitator-receipt',
      status: 'SETTLED',
    }, {
      adapter,
      policy: {
        provider: 'coinbase-cdp',
        facilitatorUrl: 'https://api.cdp.coinbase.com/platform/v2/x402',
        allowedNetworks: ['eip155:84532'],
        maxPaymentUsd: '100',
        maxRetryCount: 1,
        sellerEnabled: false,
        buyerEnabled: false,
        mainnetEnabled: false,
      },
    });

    assert.equal(ledger.status, 'SETTLED');
    assert.equal(ledger.rail, 'x402');
    assert.equal(ledger.redactedReferenceType, 'coinbase-cdp:x402-facilitator');
    assert(!JSON.stringify(ledger).includes('X-PAYMENT'));

    const stillPending = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(stillPending?.status, 'PENDING_REVIEW');
    const completionReceipt = await assertJobCanComplete(job, { ledgerId: ledger.id });
    assert.equal(completionReceipt?.id, ledger.id);
  });

  await test('x402 facilitator reference cannot replay across jobs', async () => {
    const reference = 'facilitator:shared-reference';
    const first = await createPaidJob({ settlementRail: 'px402', escrowAddress: null });
    const adapter: X402FacilitatorAdapter = {
      verify: async () => ({ ok: true, status: 'valid', reference, amount: String(first.budgetAmount), tokenSymbol: first.budgetToken }),
      settle: async () => ({ ok: true, status: 'settled', reference, txHash: txHashFor(first.id, '1'), receiptHash: hashForFixture(first.id, '2'), amount: String(first.budgetAmount), tokenSymbol: first.budgetToken }),
    };
    const policy = {
      provider: 'coinbase-cdp',
      facilitatorUrl: 'https://api.cdp.coinbase.com/platform/v2/x402',
      allowedNetworks: ['eip155:84532'],
      maxPaymentUsd: '100',
      maxRetryCount: 1,
      sellerEnabled: false,
      buyerEnabled: false,
      mainnetEnabled: false,
    };
    await verifyAndRecordX402SettlementReceipt(first.id, {
      rail: 'px402',
      network: 'base-sepolia',
      chainId: 84532,
      amount: String(first.budgetAmount),
      tokenSymbol: first.budgetToken,
      txHash: txHashFor(first.id, '1'),
      receiptHash: hashForFixture(first.id, '2'),
      facilitatorReference: reference,
      receipt: 'redacted-px402-facilitator-receipt',
    }, { adapter, policy });

    const second = await createPaidJob({ settlementRail: 'px402', escrowAddress: null });
    await expectReject('x402 replay', () => verifyAndRecordX402SettlementReceipt(second.id, {
      rail: 'px402',
      network: 'base-sepolia',
      chainId: 84532,
      amount: String(second.budgetAmount),
      tokenSymbol: second.budgetToken,
      txHash: txHashFor(second.id, '3'),
      receiptHash: hashForFixture(second.id, '4'),
      facilitatorReference: reference,
      receipt: 'redacted-px402-facilitator-receipt',
    }, { adapter, policy }), 'another job');
  });

  const failedVerifications = await (prisma as any).settlementReceiptVerification.count({ where: { status: 'FAILED' } });
  assert(failedVerifications >= 7, 'failed verifier attempts should be persisted for auditability');

  console.log(`\n${BOLD}Verifier Test Results${RESET}`);
  console.log(`  ${GREEN}Passed: ${passed}${RESET}`);
  if (failed > 0) {
    console.log(`  ${RED}Failed: ${failed}${RESET}`);
    process.exit(1);
  }
  console.log(`  ${GREEN}All verifier tests passed!${RESET}\n`);
}

main()
  .catch((err) => {
    console.error(`${RED}${err.message}${RESET}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
