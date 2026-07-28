#!/usr/bin/env npx tsx
// Gated live Base Sepolia receipt-indexer exercise.
// Reads testnet-only wallet material from a local ignored path and verifies a
// fresh public funding tx through live RPC. It never prints private keys,
// signatures, raw calldata, payment headers, PRXVT notes, or raw env contents.

import assert from 'assert';
import fs from 'fs';
import prisma from '../src/lib/prisma';
import { ApiClient, authenticateWallet, logError, logHeader } from './helpers';
import { privateKeyToAccount } from 'viem/accounts';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

type WalletRecord = {
  role: string;
  purpose: string;
  address: `0x${string}`;
  privateKey: `0x${string}`;
};

let passed = 0;
let failed = 0;

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

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function loadWallets(): { client: WalletRecord; provider: WalletRecord } {
  const secretFile = requiredEnv('AAE_TESTNET_WALLET_SECRET_FILE');
  const payload = JSON.parse(fs.readFileSync(secretFile, 'utf8'));
  assert.equal(payload.network, 'base-sepolia');
  assert.equal(payload.chainId, 84532);

  const wallets = payload.wallets as WalletRecord[];
  const client = wallets.find(wallet => wallet.role === 'aae-testnet-client');
  const provider = wallets.find(wallet => wallet.role === 'aae-testnet-provider');
  assert(client?.privateKey, 'client testnet wallet is required');
  assert(provider?.privateKey, 'provider testnet wallet is required');
  return { client, provider };
}

function assertNoRawMaterial(value: unknown): void {
  const text = JSON.stringify(value);
  assert(!text.includes('privateKey'), 'rendered privateKey field');
  assert(!text.includes('mnemonic'), 'rendered mnemonic field');
  assert(!text.includes('signature'), 'rendered signature material');
  assert(!text.includes('rawCalldata'), 'rendered raw calldata material');
  assert(!text.includes('X-PAYMENT'), 'rendered payment header material');
  assert(!text.includes('Payment-Required'), 'rendered raw 402 challenge header material');
  assert(!text.includes('prxvt'), 'rendered PRXVT note material');
}

async function raw(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; data: any }> {
  const { API } = await import('./helpers');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

function assertStageEnv(): void {
  assert.equal(process.env.AAE_ACTIVE_CHAIN || 'base-sepolia', 'base-sepolia');
  assert.equal(process.env.AAE_ENABLE_BASE_SEPOLIA_RECEIPT_INDEXER, 'true');
  assert(process.env.BASE_SEPOLIA_RPC_URL, 'BASE_SEPOLIA_RPC_URL is required but must not be printed');
  for (const flag of ['AAE_ENABLE_MCP_WRITES', 'AAE_ENABLE_MCP_WRITE_EXECUTION', 'AAE_ENABLE_MCP_X402_EXECUTION', 'AAE_ENABLE_MCP_MAINNET']) {
    assert.notEqual(process.env[flag], 'true', `${flag} must remain disabled`);
  }
}

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━ Live Base Sepolia Receipt Indexer Exercise ━━━${RESET}\n`);

  assertStageEnv();
  const escrowAddress = requiredEnv('AAE_BASE_SEPOLIA_STAGE5_ESCROW_ADDRESS') as `0x${string}`;
  const fundTxHash = requiredEnv('AAE_BASE_SEPOLIA_STAGE5_FUND_TX_HASH') as `0x${string}`;
  const onchainJobId = requiredEnv('AAE_BASE_SEPOLIA_STAGE5_ONCHAIN_JOB_ID') as `0x${string}`;
  const amountEth = requiredEnv('AAE_BASE_SEPOLIA_STAGE5_AMOUNT_ETH');

  assert.match(escrowAddress, /^0x[a-fA-F0-9]{40}$/);
  assert.match(fundTxHash, /^0x[a-fA-F0-9]{64}$/);
  assert.match(onchainJobId, /^0x[a-fA-F0-9]{64}$/);
  assert.match(amountEth, /^\d+(\.\d{1,18})?$/);

  const { client, provider } = loadWallets();
  const clientAccount = privateKeyToAccount(client.privateKey);
  const providerAccount = privateKeyToAccount(provider.privateKey);
  assert.equal(clientAccount.address.toLowerCase(), client.address.toLowerCase());
  assert.equal(providerAccount.address.toLowerCase(), provider.address.toLowerCase());

  let clientAuth: Awaited<ReturnType<typeof authenticateWallet>>;
  let providerAuth: Awaited<ReturnType<typeof authenticateWallet>>;
  let clientApi: ApiClient;
  let providerApi: ApiClient;
  let agentId = '';
  let jobId = '';
  let ledgerId = '';

  logHeader('Local API Lifecycle');

  await test('testnet wallets authenticate locally without exposing secret material', async () => {
    clientAuth = await authenticateWallet(clientAccount);
    providerAuth = await authenticateWallet(providerAccount);
    clientApi = new ApiClient(clientAuth.token);
    providerApi = new ApiClient(providerAuth.token);
    assertNoRawMaterial({ client: clientAuth.user, provider: providerAuth.user });
  });

  await test('provider wallet registers as local AAE agent', async () => {
    const agent = await providerApi.post('/agents', {
      name: `AAE Stage 5 Live Receipt Agent ${Date.now()}`,
      description: 'Scoped Base Sepolia testnet provider for the live receipt-indexer gate exercise.',
      capabilities: ['base-sepolia', 'live-receipt-indexer', 'settlement-gate'],
      models: ['testnet-manual'],
      metadataURI: `ipfs://aae-stage5-live-receipt-${Date.now()}`,
      agentWallet: provider.address,
      availability: 'testnet activation window',
      responseTime: '< 1 hour',
    });
    agentId = agent.id;
    assert.equal(agent.walletAddress.toLowerCase(), provider.address.toLowerCase());
  });

  await test('client creates a paid native-ETH job bound to the fresh escrow metadata', async () => {
    const job = await clientApi.post('/jobs', {
      title: 'AAE Stage 5 Base Sepolia Live Receipt Gate',
      description: 'Local API job bound to a fresh Base Sepolia native ETH escrow funding receipt verified through live RPC.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: ['stage-5 live receipt evidence'],
      budgetAmount: Number(amountEth),
      budgetToken: 'ETH',
      settlementRail: 'standard',
      network: 'base-sepolia',
      chainId: 84532,
      escrowAddress,
      onchainJobId,
      escrowContractVersion: 'native-eth',
      reviewPeriod: 604800,
    });
    jobId = job.id;
    assert.equal(job.settlementRail, 'standard');
    assert.equal(job.network, 'base-sepolia');
    assert.equal(job.chainId, 84532);
    assert.equal(job.budgetToken, 'ETH');
    assert.equal(job.escrowContractVersion, 'native-eth');
    assert.equal(job.tokenAddress, null);
  });

  await test('approval is blocked before a matching settled PaymentLedger receipt exists', async () => {
    await providerApi.post(`/jobs/${jobId}/bid`, { agentId, amount: Number(amountEth), estimatedDuration: '1 day' });
    await clientApi.post(`/jobs/${jobId}/accept`, { agentId });
    await providerApi.post(`/jobs/${jobId}/submit`, { deliverableHash: 'ipfs://QmAAEStage5LiveReceipt' });
    const blocked = await raw('POST', `/jobs/${jobId}/approve`, clientAuth.token, {});
    assert.equal(blocked.status, 409);
  });

  await test('live RPC verifier records a settled PaymentLedger without fixture proof', async () => {
    const receipt = await clientApi.post(`/jobs/${jobId}/settlement-receipts`, {
      receipt: 'redacted-base-sepolia-stage5-native-eth-funding-receipt',
      rail: 'standard',
      amount: amountEth,
      tokenSymbol: 'ETH',
      walletAddress: client.address,
      escrowAddress,
      onchainJobId,
      txHash: fundTxHash,
      chainId: 84532,
      network: 'base-sepolia',
      status: 'SETTLED',
      redactedReference: `basescan:base-sepolia:${fundTxHash}`,
      redactedReferenceType: 'basescan-tx',
      escrowContractVersion: 'native-eth',
      condition: 'funding',
    });
    assert.equal(receipt.status, 'SETTLED');
    assert.equal(receipt.settlementStatus, 'SETTLED');
    assertNoRawMaterial(receipt);

    const detail = await clientApi.get(`/jobs/${jobId}`);
    assert.equal(detail.status, 'PENDING_REVIEW');
    assert.equal(detail.settlementStatus, 'SETTLED');
    assert.equal(detail.paymentLedger.length, 1);
    const ledger = detail.paymentLedger[0];
    ledgerId = ledger.id;
    assert.equal(ledger.status, 'SETTLED');
    assert.equal(ledger.network, 'base-sepolia');
    assert.equal(ledger.chainId, 84532);
    assert.equal(ledger.rail, 'standard');
    assert.equal(ledger.tokenSymbol, 'ETH');
    assert.equal(ledger.escrowContractVersion, 'native-eth');
    assert.equal(ledger.txHash, fundTxHash.toLowerCase());
    assert.equal(ledger.escrowAddress, escrowAddress.toLowerCase());

    const verification = await (prisma as any).settlementReceiptVerification.findFirst({
      where: { paymentLedgerId: ledger.id },
      orderBy: { verifiedAt: 'desc' },
    });
    assert(verification, 'verification record should be linked to the ledger');
    assert.equal(verification.status, 'PASSED');
    assert.equal(verification.provider, 'base-sepolia-rpc');
    assert.equal(verification.proofType, 'event');
    assert.equal(verification.eventName, 'EscrowFunded');
    assert.equal(verification.chainId, 84532);
    assert.equal(verification.network, 'base-sepolia');
  });

  await test('normal approval gate completes the job after the matching settled ledger exists', async () => {
    const completed = await clientApi.post(`/jobs/${jobId}/approve`, { ledgerId });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.settlementStatus, 'SETTLED');
    assertNoRawMaterial(completed);
  });

  console.log(`\n${BOLD}━━━ Results ━━━${RESET}`);
  console.log(`  ${GREEN}${passed} passed${RESET}`);
  if (failed > 0) console.log(`  ${RED}${failed} failed${RESET}`);
  console.log(`  ${passed + failed} total\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    logError(`Live Base Sepolia receipt-indexer exercise crashed: ${e.message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
