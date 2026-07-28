#!/usr/bin/env npx tsx
// Focused AAE Base Sepolia testnet-agent wallet exercise.
// Reads fresh testnet-only wallet secret material from a local ignored path.
// Does not print private keys, mnemonics, signatures, JWTs, raw payment headers, calldata, or wallet delegation material.

import assert from 'assert';
import fs from 'fs';
import http from 'http';
import { privateKeyToAccount } from 'viem/accounts';
import { amountToUnits, SettlementError } from '../src/services/settlement';
import { ApiClient, authenticateWallet, baseSepoliaFundingProof, hashForFixture, logError, logHeader } from './helpers';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

let passed = 0;
let failed = 0;

const deployedSmokeConfig = {
  escrowAddress: process.env.AAE_BASE_SEPOLIA_SMOKE_ESCROW_ADDRESS as `0x${string}` | undefined,
  tokenAddress: process.env.AAE_BASE_SEPOLIA_SMOKE_TOKEN_ADDRESS as `0x${string}` | undefined,
  fundTxHash: process.env.AAE_BASE_SEPOLIA_SMOKE_FUND_TX_HASH,
  amount: Number(process.env.AAE_BASE_SEPOLIA_SMOKE_AMOUNT || '100'),
};

function hasDeployedSmokeConfig(): boolean {
  return Boolean(deployedSmokeConfig.escrowAddress && deployedSmokeConfig.tokenAddress && deployedSmokeConfig.fundTxHash);
}

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

type WalletRecord = {
  role: string;
  purpose: string;
  address: `0x${string}`;
  privateKey: `0x${string}`;
};

function loadWallets(): { client: WalletRecord; provider: WalletRecord } {
  const secretFile = process.env.AAE_TESTNET_WALLET_SECRET_FILE;
  if (!secretFile) throw new Error('AAE_TESTNET_WALLET_SECRET_FILE is required');
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
  assert(!text.includes('X-PAYMENT'), 'rendered X-PAYMENT material');
  assert(!text.includes('Payment-Required'), 'rendered raw 402 challenge header material');
  assert(!text.includes('raw-signature'), 'rendered raw signature material');
  assert(!text.includes('prxvt'), 'rendered PRXVT note material');
}

function fakeTxHash(seed: string): `0x${string}` {
  return `0x${Buffer.from(seed).toString('hex').padEnd(64, '0').slice(0, 64)}` as `0x${string}`;
}

function assertEthDecimalBehavior(): void {
  assert.equal(amountToUnits('0.000000000000000001', 'ETH'), 1n);
  assert.equal(amountToUnits('1.234567890123456789', 'ETH'), 1234567890123456789n);
  assert.throws(() => amountToUnits('0.0000001', 'USDC'), SettlementError);
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

async function withMockX402Server(fn: (url: string) => Promise<void>): Promise<void> {
  const server = http.createServer((_req, res) => {
    res.statusCode = 402;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Payment-Required', JSON.stringify({ scheme: 'exact', network: 'base-sepolia' }));
    res.end(JSON.stringify({
      accepts: [{
        scheme: 'exact',
        network: 'base-sepolia',
        chainId: 84532,
        maxAmountRequired: '10000',
        currency: 'USDC',
        payTo: '0x1111111111111111111111111111111111111111',
      }],
    }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    await fn(`http://127.0.0.1:${address.port}/probe`);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━ Live Testnet Agent Wallet Exercise ━━━${RESET}\n`);

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
  let offchainJobId = '';

  logHeader('Wallet Auth');

  await test('fresh generated testnet wallets authenticate and accept consent without exposing secrets', async () => {
    clientAuth = await authenticateWallet(clientAccount);
    providerAuth = await authenticateWallet(providerAccount);
    assert.equal(clientAuth.user.walletAddress.toLowerCase(), client.address.toLowerCase());
    assert.equal(providerAuth.user.walletAddress.toLowerCase(), provider.address.toLowerCase());
    clientApi = new ApiClient(clientAuth.token);
    providerApi = new ApiClient(providerAuth.token);
    const clientConsent = await clientApi.get('/auth/consent-status');
    const providerConsent = await providerApi.get('/auth/consent-status');
    assert.equal(clientConsent.allAccepted, true);
    assert.equal(providerConsent.allAccepted, true);
    assertNoRawMaterial({ client: clientAuth.user, provider: providerAuth.user, clientConsent, providerConsent });
  });

  logHeader('Default Offchain Job Lifecycle');

  await test('provider wallet registers as an agent', async () => {
    const agent = await providerApi.post('/agents', {
      name: `AAE Base Sepolia Testnet Agent ${Date.now()}`,
      description: 'Fresh Herman-generated Base Sepolia testnet provider wallet for AAE activation testing.',
      capabilities: ['base-sepolia', 'testnet-activation', 'workspace-evidence'],
      models: ['testnet-manual'],
      metadataURI: `ipfs://aae-base-sepolia-testnet-agent-${Date.now()}`,
      agentWallet: provider.address,
      availability: 'testnet activation window',
      responseTime: '< 1 hour',
      paymentPrivacyMode: 'px402-preferred',
      px402Supported: true,
    });
    agentId = agent.id;
    assert.equal(agent.walletAddress.toLowerCase(), provider.address.toLowerCase());
  });

  await test('client wallet creates default offchain Base Sepolia job', async () => {
    const job = await clientApi.post('/jobs', {
      title: 'AAE Base Sepolia Testnet Activation Job',
      description: 'Fresh generated client and provider wallets exercise the default offchain AAE lifecycle before paid-chain activation.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: ['auth evidence', 'workspace evidence', 'settlement gate evidence'],
      budgetAmount: 42,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
    });
    offchainJobId = job.id;
    assert.equal(job.settlementRail, 'offchain');
    assert.equal(job.network, 'base-sepolia');
    assert.equal(job.chainId, 84532);
  });

  await test('client wallet can create and complete default offchain ETH job without treating gas as job payment escrow', async () => {
    const job = await clientApi.post('/jobs', {
      title: 'AAE Base Sepolia ETH Offchain Job',
      description: 'Verify ETH is accepted as a Base Sepolia budget token for the default offchain product path only.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: ['eth offchain budget evidence'],
      budgetAmount: 0.001,
      budgetToken: 'ETH',
      reviewPeriod: 604800,
    });
    assert.equal(job.budgetToken, 'ETH');
    assert.equal(job.settlementRail, 'offchain');
    assert.equal(job.network, 'base-sepolia');
    assert.equal(job.chainId, 84532);

    await providerApi.post(`/jobs/${job.id}/bid`, { agentId, amount: 0.001, estimatedDuration: '1 day' });
    await clientApi.post(`/jobs/${job.id}/accept`, { agentId });
    await providerApi.post(`/jobs/${job.id}/submit`, { deliverableHash: 'ipfs://QmAAEEthOffchain' });
    const completed = await clientApi.post(`/jobs/${job.id}/approve`, {});
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.settlementStatus, 'SETTLED');
  });

  await test('provider bids, client accepts, provider submits, and client approves default offchain job', async () => {
    await providerApi.post(`/jobs/${offchainJobId}/bid`, {
      agentId,
      amount: 42,
      estimatedDuration: '1 day',
      message: 'Fresh testnet provider wallet bid for controlled AAE activation testing.',
    });
    const accepted = await clientApi.post(`/jobs/${offchainJobId}/accept`, { agentId, workspaceProvider: 'github' });
    assert.equal(accepted.status, 'IN_PROGRESS');
    await providerApi.post(`/jobs/${offchainJobId}/submit`, {
      deliverableHash: 'ipfs://QmAAEBaseSepoliaTestnetActivation',
      notes: 'Submitted by fresh testnet provider wallet; no paid-chain settlement implied.',
    });
    const completed = await clientApi.post(`/jobs/${offchainJobId}/approve`, {});
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.settlementStatus, 'SETTLED');
  });

  logHeader('Paid-Chain Gate and MCP/px402 Boundary');

  await test('paid-chain job cannot complete without a matching settled PaymentLedger receipt', async () => {
    const useDeployedSmoke = hasDeployedSmokeConfig();
    const job = await clientApi.post('/jobs', {
      title: 'AAE Base Sepolia Paid Gate Test',
      description: useDeployedSmoke
        ? 'Fresh generated wallets verify paid-chain completion gates against the deployed Base Sepolia smoke escrow metadata.'
        : 'Fresh generated wallets verify paid-chain completion remains gated before any live escrow funding.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: ['paid-chain gate evidence'],
      budgetAmount: useDeployedSmoke ? deployedSmokeConfig.amount : 15,
      budgetToken: 'USDC',
      settlementRail: 'standard',
      network: 'base-sepolia',
      chainId: 84532,
      escrowAddress: useDeployedSmoke
        ? deployedSmokeConfig.escrowAddress
        : '0x0000000000000000000000000000000000008453',
      ...(useDeployedSmoke ? { tokenAddress: deployedSmokeConfig.tokenAddress, escrowContractVersion: 'legacy' } : {}),
      reviewPeriod: 604800,
    });
    await providerApi.post(`/jobs/${job.id}/bid`, { agentId, amount: useDeployedSmoke ? deployedSmokeConfig.amount : 15, estimatedDuration: '1 day' });
    await clientApi.post(`/jobs/${job.id}/accept`, { agentId });
    await providerApi.post(`/jobs/${job.id}/submit`, { deliverableHash: 'ipfs://QmAAEPaidGate' });
    const blocked = await raw('POST', `/jobs/${job.id}/approve`, clientAuth.token, {});
    assert.equal(blocked.status, 409);

    if (useDeployedSmoke) {
      const receiptHash = hashForFixture(job.id, 'a');
      const receipt = await clientApi.post(`/jobs/${job.id}/settlement-receipts`, {
        receipt: 'redacted-base-sepolia-smoke-fund-receipt',
        rail: 'standard',
        amount: deployedSmokeConfig.amount,
        tokenSymbol: 'USDC',
        tokenAddress: deployedSmokeConfig.tokenAddress,
        walletAddress: client.address,
        escrowAddress: deployedSmokeConfig.escrowAddress,
        txHash: deployedSmokeConfig.fundTxHash,
        receiptHash,
        chainId: 84532,
        network: 'base-sepolia',
        status: 'SETTLED',
        redactedReference: 'base-sepolia-smoke-escrow-funded',
        redactedReferenceType: 'basescan-tx',
        escrowContractVersion: 'legacy',
        verificationProof: baseSepoliaFundingProof({
          jobId: job.id,
          txHash: deployedSmokeConfig.fundTxHash,
          receiptHash,
          escrowAddress: deployedSmokeConfig.escrowAddress,
          amountAtomic: amountToUnits(deployedSmokeConfig.amount, 'USDC').toString(),
          tokenAddress: deployedSmokeConfig.tokenAddress,
        }),
      });
      assert.equal(receipt.status, 'SETTLED');
      const completed = await clientApi.post(`/jobs/${job.id}/approve`, { txHash: deployedSmokeConfig.fundTxHash });
      assert.equal(completed.status, 'COMPLETED');
      assert.equal(completed.settlementStatus, 'SETTLED');
      assertNoRawMaterial({ receipt, completed });
    }
  });

  await test('Base Sepolia native ETH paid-chain path stays distinct and requires native-eth escrow metadata', async () => {
    assertEthDecimalBehavior();

    const wethLike = await raw('POST', '/jobs', clientAuth.token, {
      title: 'AAE Base Sepolia WETH-like Rejection Test',
      description: 'Verify budgetToken ETH cannot be mixed with an ERC20 tokenAddress masquerading as native ETH.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: ['native eth distinction evidence'],
      budgetAmount: 0.001,
      budgetToken: 'ETH',
      settlementRail: 'standard',
      network: 'base-sepolia',
      chainId: 84532,
      tokenAddress: '0x4200000000000000000000000000000000000006',
      escrowAddress: '0x0000000000000000000000000000000000008453',
      reviewPeriod: 604800,
    });
    assert.equal(wethLike.status, 400);
    assert(String(wethLike.data.error).includes('WETH/ERC20'));

    const legacyNative = await raw('POST', '/jobs', clientAuth.token, {
      title: 'AAE Base Sepolia Native ETH Legacy Rejection Test',
      description: 'Verify native ETH paid jobs cannot use the legacy/ERC20-only escrow metadata.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: ['native eth legacy rejection evidence'],
      budgetAmount: 0.000001,
      budgetToken: 'ETH',
      settlementRail: 'standard',
      network: 'base-sepolia',
      chainId: 84532,
      escrowAddress: '0x0000000000000000000000000000000000008453',
      reviewPeriod: 604800,
    });
    assert.equal(legacyNative.status, 400);
    assert(String(legacyNative.data.error).includes('native-eth'));

    const nativeEscrowAddress = process.env.AAE_BASE_SEPOLIA_NATIVE_ETH_ESCROW_ADDRESS || '0x0000000000000000000000000000000000008454';
    const nativeFundTxHash = process.env.AAE_BASE_SEPOLIA_NATIVE_ETH_FUND_TX_HASH || fakeTxHash(`eth-native-${Date.now()}`);
    const nativeAmount = process.env.AAE_BASE_SEPOLIA_NATIVE_ETH_AMOUNT || '0.000001';
    const job = await clientApi.post('/jobs', {
      title: 'AAE Base Sepolia Native ETH Paid Gate Test',
      description: 'Verify native ETH job-payment requires the separate native-eth escrow path and matching PaymentLedger receipt.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: ['native eth paid-chain evidence'],
      budgetAmount: Number(nativeAmount),
      budgetToken: 'ETH',
      settlementRail: 'standard',
      network: 'base-sepolia',
      chainId: 84532,
      escrowAddress: nativeEscrowAddress,
      escrowContractVersion: 'native-eth',
      reviewPeriod: 604800,
    });
    assert.equal(job.budgetToken, 'ETH');
    assert.equal(job.settlementRail, 'standard');
    assert.equal(job.tokenAddress, null);
    assert.equal(job.escrowContractVersion, 'native-eth');

    await providerApi.post(`/jobs/${job.id}/bid`, { agentId, amount: Number(nativeAmount), estimatedDuration: '1 day' });
    await clientApi.post(`/jobs/${job.id}/accept`, { agentId });
    await providerApi.post(`/jobs/${job.id}/submit`, { deliverableHash: 'ipfs://QmAAENativeEthPaid' });
    const blockedBeforeReceipt = await raw('POST', `/jobs/${job.id}/approve`, clientAuth.token, {});
    assert.equal(blockedBeforeReceipt.status, 409);

    const receiptHash = hashForFixture(job.id, 'b');
    const nativeAmountAtomic = amountToUnits(nativeAmount, 'ETH').toString();
    const receipt = await clientApi.post(`/jobs/${job.id}/settlement-receipts`, {
      receipt: 'redacted-base-sepolia-native-eth-fund-receipt',
      rail: 'standard',
      amount: nativeAmount,
      tokenSymbol: 'ETH',
      walletAddress: client.address,
      escrowAddress: nativeEscrowAddress,
      txHash: nativeFundTxHash,
      receiptHash,
      chainId: 84532,
      network: 'base-sepolia',
      status: 'SETTLED',
      redactedReference: 'native-eth-escrow-funded',
      redactedReferenceType: 'basescan-tx',
      escrowContractVersion: 'native-eth',
      verificationProof: baseSepoliaFundingProof({
        jobId: job.id,
        txHash: nativeFundTxHash,
        receiptHash,
        escrowAddress: nativeEscrowAddress,
        amountAtomic: nativeAmountAtomic,
        nativeValue: nativeAmountAtomic,
      }),
    });
    assert.equal(receipt.status, 'SETTLED');
    const completed = await clientApi.post(`/jobs/${job.id}/approve`, { txHash: nativeFundTxHash });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.settlementStatus, 'SETTLED');
    assertNoRawMaterial({ wethLike, legacyNative, receipt, completed });
  });

  await test('px402 dry-run evidence remains redacted and cannot become live x402 execution by default', async () => {
    await withMockX402Server(async url => {
      const response = await clientApi.post('/px402/dry-run', {
        jobId: offchainJobId,
        url,
        method: 'GET',
      });
      assert.equal(response.jobId, offchainJobId);
      assert.equal(response.executeDisabled, true);
      assert.equal(response.quote.rawPaymentHeaderStored, false);
      assertNoRawMaterial(response);
      const prepared = await clientApi.post('/mcp/base/requests/prepare', {
        toolName: 'base.x402.quote.dry_run',
        action: 'x402',
        category: 'x402',
        jobId: offchainJobId,
        network: 'base-sepolia',
        chainId: 84532,
        x402Reference: response.quote.redactedReceiptReference,
        metadata: { amountUsd: '0.01', tokenSymbol: 'USDC', summary: 'redacted x402 dry-run request record' },
      });
      assert.equal(prepared.request.allowed, false);
      assert.equal(prepared.request.state, 'BLOCKED');
      assertNoRawMaterial(prepared);
    });
  });

  console.log(`\n${BOLD}━━━ Results ━━━${RESET}`);
  console.log(`  ${GREEN}${passed} passed${RESET}`);
  if (failed > 0) console.log(`  ${RED}${failed} failed${RESET}`);
  console.log(`  ${passed + failed} total\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  logError(`Live testnet agent wallet exercise crashed: ${e.message}`);
  console.error(e.stack || e);
  process.exit(1);
});
