#!/usr/bin/env npx tsx
// Focused Base MCP rails pilot tests.

import http from 'http';
import assert from 'assert';
import prisma from '../src/lib/prisma';
import { validateMcpPolicy } from '../src/services/mcpPolicy';
import { runPx402DryRun } from '../src/services/px402DryRun';
import { recordBaseMcpSendReceipt } from '../src/services/mcpSettlement';
import {
  authorizeX402SellerResourceAccess,
  buildX402SellerRequirement,
  executeApprovedX402BuyerPayment,
  prepareX402BuyerIntent,
} from '../src/services/x402';
import {
  API,
  ApiClient,
  WALLET_ALICE,
  WALLET_BOB,
  authenticateWallet,
  baseSepoliaFundingProof,
  hashForFixture,
  logError,
  logHeader,
  seedIndexedEscrowDelivered,
  seedIndexedEscrowFunded,
  seedIndexedEscrowReleased,
  seedIndexedEscrowStarted,
} from './helpers';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BASE_SEPOLIA_USDC_TOKEN = '0x7D60207c8b23Df81c4512cC2ffcd30DED775AA0f';

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

async function raw(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; data: any }> {
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

async function must(method: string, path: string, token?: string, body?: unknown): Promise<any> {
  const result = await raw(method, path, token, body);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${method} ${path} -> ${result.status}: ${JSON.stringify(result.data)}`);
  }
  return result.data;
}

function txHashFor(seed: string, fill: string): string {
  const hexSeed = seed.replace(/[^a-fA-F0-9]/g, '');
  return `0x${(hexSeed + fill.repeat(64)).slice(0, 64)}`;
}

function codeList(decision: ReturnType<typeof validateMcpPolicy>): string[] {
  return decision.errors.map(error => error.code);
}

function assertNoRawMaterial(value: unknown, sentinels: string[]): void {
  const text = JSON.stringify(value);
  for (const sentinel of sentinels) {
    assert(!text.includes(sentinel), `rendered raw sentinel ${sentinel}`);
  }
  assert(!text.includes('X-PAYMENT raw-'), 'rendered raw payment header material');
  assert(!text.includes('raw-signature-'), 'rendered raw signature material');
  assert(!text.includes('raw-prxvt-note-'), 'rendered raw PRXVT note material');
}

async function createAgent(handlerApi: ApiClient): Promise<string> {
  try {
    const agent = await handlerApi.post('/agents', {
      name: `McpRailsBot-${Date.now()}`,
      description: 'Mock handler agent for Base MCP rails tests.',
      capabilities: ['mcp-rails', 'testing'],
      models: ['mock'],
      metadataURI: `ipfs://QmMcpRails${Date.now()}`,
      agentWallet: WALLET_BOB.address,
      availability: '24/7',
      responseTime: '< 1 minute',
      paymentPrivacyMode: 'px402-preferred',
      px402Supported: true,
    });
    return agent.id;
  } catch (e: any) {
    if (!String(e.message).includes('409')) throw e;
    const agents = await handlerApi.get('/handler/agents');
    assert(agents[0]?.id, 'handler should have an existing agent');
    await handlerApi.put(`/agents/${agents[0].id}`, {
      paymentPrivacyMode: 'px402-preferred',
      px402Supported: true,
    });
    return agents[0].id;
  }
}

async function createStartedJob(
  clientApi: ApiClient,
  handlerApi: ApiClient,
  agentId: string,
  overrides: Record<string, unknown> = {},
) {
  const job = await clientApi.post('/jobs', {
    title: `Base MCP Rails Test ${Date.now()}`,
    description: 'Created by the Base MCP rails focused test suite.',
    category: 'CODE_DEVELOPMENT',
    deliverables: ['MCP rails evidence'],
    budgetAmount: 50,
    budgetToken: 'USDC',
    reviewPeriod: 604800,
    ...overrides,
  });
  await handlerApi.post(`/jobs/${job.id}/bid`, {
    agentId,
    amount: Number(overrides.budgetAmount || 50),
    estimatedDuration: '1 day',
    message: 'Base MCP rails test bid',
  });
  await clientApi.post(`/jobs/${job.id}/accept`, { agentId });
  return job;
}

async function withMockX402Server(fn: (url: string) => Promise<void>): Promise<void> {
  const server = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers['x-payment'], undefined);
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

async function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━ Base MCP Rails Tests ━━━${RESET}\n`);

  const aliceAuth = await authenticateWallet(WALLET_ALICE);
  const bobAuth = await authenticateWallet(WALLET_BOB);
  const aliceApi = new ApiClient(aliceAuth.token);
  const bobApi = new ApiClient(bobAuth.token);
  const bobAgentId = await createAgent(bobApi);

  logHeader('Default Settlement');

  await test('default job creation remains offchain on Base Sepolia', async () => {
    const job = await aliceApi.post('/jobs', {
      title: 'Default Offchain MCP Guard',
      description: 'Job omits settlementRail to verify default product path.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['default rail check'],
      budgetAmount: 25,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
    });
    assert.equal(job.settlementRail, 'offchain');
    assert.equal(job.network, 'base-sepolia');
    assert.equal(job.chainId, 84532);
  });

  logHeader('MCP Policy');

  await test('MCP policy fails closed for mainnet and wrong chainId', () => {
    const mainnet = validateMcpPolicy({
      tool: { name: 'base_sendTransaction', category: 'write' },
      execute: true,
      call: {
        kind: 'send',
        network: 'base',
        chainId: 8453,
        to: '0x0000000000000000000000000000000000000001',
        amountUsd: '0.01',
        tokenSymbol: 'USDC',
      },
    });
    assert.equal(mainnet.allowed, false);
    assert(codeList(mainnet).includes('MCP_NETWORK_NOT_ALLOWLISTED'));

    const wrongChain = validateMcpPolicy({
      tool: { name: 'base_sendTransaction', category: 'write' },
      execute: true,
      call: {
        kind: 'send',
        network: 'base-sepolia',
        chainId: 8453,
        to: '0x0000000000000000000000000000000000000001',
        amountUsd: '0.01',
        tokenSymbol: 'USDC',
      },
    });
    assert.equal(wrongChain.allowed, false);
    assert(codeList(wrongChain).includes('MCP_CHAIN_MISMATCH'));
  });

  await test('MCP policy rejects raw payment headers and signature-like inputs', () => {
    const rawPayment = validateMcpPolicy({
      tool: { name: 'base_readBalance', category: 'read' },
      call: { kind: 'read', endpoint: 'http://127.0.0.1/mcp' },
      paymentHeader: 'X-PAYMENT raw-payment-header-should-not-persist',
    });
    assert.equal(rawPayment.allowed, false);
    assert(codeList(rawPayment).includes('MCP_RAW_SECRET_OR_CALLDATA'));

    const rawSignature = validateMcpPolicy({
      tool: { name: 'base_readBalance', category: 'read' },
      call: { kind: 'read', endpoint: 'http://127.0.0.1/mcp' },
      payload: { signature: 'raw-signature-should-not-persist' },
    });
    assert.equal(rawSignature.allowed, false);
    assert(codeList(rawSignature).includes('MCP_RAW_SECRET_OR_CALLDATA'));
  });

  await test('MCP policy blocks disabled write execution and signing tools', () => {
    const disabledWrite = validateMcpPolicy({
      tool: { name: 'base_sendTransaction', category: 'write' },
      execute: true,
      call: {
        kind: 'send',
        network: 'base-sepolia',
        chainId: 84532,
        to: '0x0000000000000000000000000000000000000001',
        amountUsd: '0.01',
        tokenSymbol: 'USDC',
      },
    });
    assert.equal(disabledWrite.allowed, false);
    assert(codeList(disabledWrite).includes('MCP_EXECUTION_DISABLED'));

    const signer = validateMcpPolicy({
      tool: { name: 'wallet_signTypedData', category: 'write' },
      call: { kind: 'sign' },
    });
    assert.equal(signer.allowed, false);
    assert(codeList(signer).includes('MCP_DANGEROUS_TOOL'));
  });

  logHeader('Provider Routes');

  let preparedRequestId = '';

  await test('MCP provider status and catalog routes expose Base Sepolia metadata and warnings', async () => {
    const status = await must('GET', '/mcp/providers');
    const provider = status.providers[0];
    assert.equal(provider.providerId, 'base-mcp');
    assert.equal(provider.activeChain.network, 'base-sepolia');
    assert.equal(provider.activeChain.chainId, 84532);
    assert.equal(provider.activeChain.nativeGasToken, 'ETH');
    assert.equal(provider.policy.automaticPaymentHeaders, 'disabled');
    assert(Array.isArray(provider.warnings), 'provider should include warnings');
    assert(provider.warnings.some((warning: string) => warning.includes('Base Sepolia')), 'warnings should mention Base Sepolia only');

    const catalog = await must('GET', '/mcp/base/tools');
    assert.equal(catalog.providerId, 'base-mcp');
    assert.equal(catalog.activeChain.network, 'base-sepolia');
    assert.equal(catalog.activeChain.chainId, 84532);
    assert.equal(catalog.redaction, 'schemas-hashed-payment-material-omitted');
  });

  await test('MCP prepare/status/receipt routes persist redacted summaries only', async () => {
    const preparedResponse = await must('POST', '/mcp/base/requests/prepare', aliceAuth.token, {
      toolName: 'base.read_balance',
      action: 'read',
      network: 'base-sepolia',
      chainId: 84532,
      params: { address: WALLET_ALICE.address },
      metadata: { purpose: 'focused-test' },
    });
    const prepared = preparedResponse.request;
    preparedRequestId = prepared.requestId;
    assert.equal(prepared.allowed, true);

    const statusResponse = await must('GET', `/mcp/base/requests/${preparedRequestId}/status`, aliceAuth.token);
    const status = statusResponse.request;
    assert.equal(status.requestId, preparedRequestId);
    assert(['PREPARED', 'RECORDED', 'POLLING'].includes(status.state));

    const rawSentinel = `raw-payment-header-${preparedRequestId}`;
    const rejected = await raw('POST', `/mcp/base/requests/${preparedRequestId}/receipt`, aliceAuth.token, {
      status: 'CONFIRMED',
      metadata: { rawPaymentHeader: rawSentinel },
    });
    assert.equal(rejected.status, 400);

    const receiptResponse = await must('POST', `/mcp/base/requests/${preparedRequestId}/receipt`, aliceAuth.token, {
      status: 'CONFIRMED',
      txHash: txHashFor(preparedRequestId, 'a'),
      receiptHash: txHashFor(preparedRequestId, 'b'),
      redactedReference: `mcp-receipt:${preparedRequestId}`,
      message: 'confirmed by focused test fixture',
      metadata: { providerStatus: 'confirmed' },
    });
    const receipt = receiptResponse.request.receipt;
    assert.equal(receipt.status, 'CONFIRMED');
    assertNoRawMaterial(receipt, [rawSentinel]);

    const mcpReceipt = await (prisma as any).mcpReceipt.findFirst({ where: { requestId: preparedRequestId } });
    assert(mcpReceipt, 'MCP receipt reference should be persisted');
    assertNoRawMaterial(mcpReceipt, [rawSentinel]);
  });

  logHeader('PaymentLedger Gate');

  await test('confirmed Base Sepolia MCP receipt creates PaymentLedger but does not bypass approval gate', async () => {
    const escrowAddress = '0x0000000000000000000000000000000000008453';
    const paidJob = await aliceApi.post('/jobs', {
      title: 'Base MCP Ledger Gate',
      description: 'Paid-chain job for Base MCP receipt ledger gating.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['MCP rails evidence'],
      budgetAmount: 70,
      budgetToken: 'USDC',
      settlementRail: 'standard',
      network: 'base-sepolia',
      chainId: 84532,
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      reviewPeriod: 604800,
    });
    await aliceApi.put(`/jobs/${paidJob.id}`, { escrowAddress });
    await bobApi.post(`/jobs/${paidJob.id}/bid`, {
      agentId: bobAgentId,
      amount: 70,
      estimatedDuration: '1 day',
      message: 'Base MCP ledger gate bid',
    });
    await seedIndexedEscrowFunded({ ...paidJob, escrowAddress });
    await aliceApi.post(`/jobs/${paidJob.id}/accept`, { agentId: bobAgentId });
    await seedIndexedEscrowStarted({ ...paidJob, escrowAddress }, bobAgentId);
    await seedIndexedEscrowDelivered({ ...paidJob, escrowAddress }, 'ipfs://QmBaseMcpLedgerGate');

    await bobApi.post(`/jobs/${paidJob.id}/submit`, {
      deliverableHash: 'ipfs://QmBaseMcpLedgerGate',
      notes: 'MCP receipt is still subject to AAE approval.',
    });

    const blocked = await raw('POST', `/jobs/${paidJob.id}/approve`, aliceAuth.token);
    assert.equal(blocked.status, 409);

    const txHash = txHashFor(paidJob.id, 'c');
    const receiptHash = hashForFixture(paidJob.id, 'd');
    const rawSentinel = `raw-payment-header-${paidJob.id}`;
    const ledger = await recordBaseMcpSendReceipt(paidJob.id, {
      status: 'confirmed',
      jobId: paidJob.id,
      rail: 'standard',
      chainId: 84532,
      network: 'base-sepolia',
      tokenSymbol: 'USDC',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      amountAtomic: '70000000',
      txHash,
      receiptHash,
      to: escrowAddress,
      endpoint: 'https://mcp.base.org/send',
      verificationProof: baseSepoliaFundingProof({
        jobId: paidJob.id,
        txHash,
        receiptHash,
        escrowAddress,
        amountAtomic: '70000000',
        tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
        condition: 'release',
      }),
      rawPaymentHeader: rawSentinel,
      signature: `raw-signature-${paidJob.id}`,
    }, {
      walletAddress: WALLET_ALICE.address,
    });
    assert.equal(ledger.status, 'SETTLED');
    assert.equal(ledger.rail, 'standard');
    assert.equal(ledger.network, 'base-sepolia');
    assert.equal(ledger.chainId, 84532);
    assert.equal(ledger.receipt, 'redacted-base-mcp-send-receipt');
    assertNoRawMaterial(ledger, [rawSentinel]);

    const stillPending = await aliceApi.get(`/jobs/${paidJob.id}`);
    assert.equal(stillPending.status, 'PENDING_REVIEW');

    await seedIndexedEscrowReleased({ ...paidJob, escrowAddress }, { txHash, index: 5 });
    const completed = await must('POST', `/jobs/${paidJob.id}/approve`, aliceAuth.token, { ledgerId: ledger.id });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.settlementStatus, 'SETTLED');
  });

  logHeader('px402 Boundary');

  await test('px402 dry-run with jobId creates a job-linked dry-run PaymentLedger entry', async () => {
    const job = await createStartedJob(aliceApi, bobApi, bobAgentId);
    await withMockX402Server(async url => {
      const response = await must('POST', '/px402/dry-run', aliceAuth.token, {
        jobId: job.id,
        url,
        method: 'GET',
      });

      assert.equal(response.jobId, job.id);
      assert.equal(response.quote.railCandidate, 'px402');
      assert.equal(response.quote.rawPaymentHeaderStored, false);
      assert.equal(response.executeDisabled, true);

      const ledger = await prisma.paymentLedger.findUnique({ where: { id: response.ledgerId } });
      assert(ledger, 'px402 dry-run ledger entry should exist');
      assert.equal(ledger.jobId, job.id);
      assert.equal(ledger.rail, 'px402-dry-run');
      assert.equal(ledger.status, 'QUOTED');
      assert.equal(ledger.redactedReferenceType, 'base-mcp-x402-dry-run-receipt');
      assertNoRawMaterial(ledger, ['Payment-Required', 'X-PAYMENT']);

      const detail = await aliceApi.get(`/jobs/${job.id}`);
      const linked = detail.paymentLedger?.find((entry: any) => entry.id === response.ledgerId);
      assert(linked, 'job detail should include linked ledger quote evidence');
      assert.equal(linked.rail, 'px402-dry-run');
      assert.equal(linked.redactedReferenceType, 'base-mcp-x402-dry-run-receipt');

      const preparedResponse = await must('POST', '/mcp/base/requests/prepare', aliceAuth.token, {
        toolName: 'base.x402.quote.dry_run',
        action: 'x402',
        category: 'x402',
        jobId: job.id,
        network: 'base-sepolia',
        chainId: 84532,
        x402Reference: response.quote.redactedReceiptReference,
        metadata: {
          amountUsd: '0.01',
          tokenSymbol: 'USDC',
          summary: 'redacted px402 dry-run quote record',
        },
      });
      const prepared = preparedResponse.request;
      assert.equal(prepared.allowed, false);
      assert.equal(prepared.state, 'BLOCKED');
      assertNoRawMaterial(prepared, ['Payment-Required', 'X-PAYMENT']);

      const positiveReceipt = await raw('POST', `/mcp/base/requests/${prepared.requestId}/receipt`, aliceAuth.token, {
        status: 'CONFIRMED',
        txHash: txHashFor(prepared.requestId, 'd'),
        receiptHash: txHashFor(prepared.requestId, 'e'),
        redactedReference: `mcp-x402-receipt:${prepared.requestId}`,
        metadata: { quoteReference: response.quote.redactedReceiptReference },
      });
      assert.equal(positiveReceipt.status, 409);
    });
  });

  await test('px402 dry-run with jobId rejects non-client non-handler callers before probing', async () => {
    const job = await aliceApi.post('/jobs', {
      title: 'Unauthorized px402 Job Link',
      description: 'Job used to ensure unrelated callers cannot attach px402 evidence.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['authorization check'],
      budgetAmount: 20,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
    });
    const blocked = await raw('POST', '/px402/dry-run', bobAuth.token, {
      jobId: job.id,
      url: 'http://127.0.0.1/probe',
      method: 'GET',
    });
    assert.equal(blocked.status, 403);
  });

  await test('px402/Base MCP dry-live boundary keeps raw headers out and never pays retry', async () => {
    let requests = 0;
    const server = await new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
      const http = require('http');
      const instance = http.createServer((req: any, res: any) => {
        requests++;
        assert.equal(req.headers.authorization, undefined);
        assert.equal(req.headers['x-payment'], undefined);
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
      instance.listen(0, '127.0.0.1', () => {
        const address = instance.address();
        assert(address && typeof address === 'object');
        resolve({
          url: `http://127.0.0.1:${address.port}/probe`,
          close: () => new Promise<void>(done => instance.close(() => done())),
        });
      });
    });

    try {
      const result = await runPx402DryRun({
        url: server.url,
        policy: {
          mode: 'dry-run',
          allowedNetworks: ['base-sepolia'],
          maxProbeUsd: '0.25',
          allowPlainX402Fallback: false,
          endpointAllowlist: [new URL(server.url).origin],
        },
      });
      assert.equal(requests, 1);
      assert.equal(result.plan.lifecycle.pilot.enabled, false);
      assert.equal(result.plan.lifecycle.approval.rawPaymentHeaderStored, false);
      assert.equal(result.plan.lifecycle.approval.automaticPaymentHeaders, false);
      assert.equal(result.plan.lifecycle.approval.paidRetries, false);
      assert.equal(result.plan.redactedReceipt.rawPaymentHeaderStored, false);
      assert(result.plan.requiredApprovals.some(item => item.includes('test-wallet approval')));
      assertNoRawMaterial(result, ['Payment-Required', 'X-PAYMENT']);
    } finally {
      await server.close();
    }
  });

  logHeader('x402 Buyer and Seller Readiness');

  await test('x402 seller resource returns payment requirements only when explicitly enabled', async () => {
    const disabled = await raw('GET', '/px402/x402/seller/resources/agent-resource');
    assert.equal(disabled.status, 503);

    await withEnv({
      AAE_ENABLE_X402_SELLER: 'true',
      X402_ALLOWED_NETWORKS: 'eip155:84532',
      X402_MAX_PAYMENT_USD: '0.25',
      X402_SELLER_PAY_TO: '0x1111111111111111111111111111111111111111',
      X402_SELLER_PRICE_USD: '0.01',
      X402_SELLER_NETWORK: 'eip155:84532',
      X402_SELLER_RESOURCE_IDS: 'agent-resource',
    }, async () => {
      const requirement = buildX402SellerRequirement('agent-resource');
      assert.equal(requirement.network, 'eip155:84532');
      assert.equal(requirement.chainId, 84532);
      assert.equal(requirement.currency, 'USDC');
      assert.equal(requirement.maxAmountRequired, '10000');
      assert.equal(requirement.rawPaymentHeaderStored, false);
      assertNoRawMaterial(requirement, ['X-PAYMENT', 'PAYMENT-SIGNATURE']);
    });
  });

  await test('Monad mainnet x402 seller requirement is blocked unless Monad paid rails and caps are explicit', async () => {
    await withEnv({
      AAE_ENABLE_X402_SELLER: 'true',
      AAE_ENABLE_MONAD_MAINNET_PAID_RAILS: 'false',
      X402_ALLOWED_NETWORKS: 'eip155:143',
      X402_MAX_PAYMENT_USD: '0.25',
      X402_SELLER_PAY_TO: '0x1111111111111111111111111111111111111111',
      X402_SELLER_PRICE_USD: '0.01',
      X402_SELLER_NETWORK: 'eip155:143',
      X402_SELLER_RESOURCE_IDS: 'agent-resource',
    }, async () => {
      assert.throws(() => buildX402SellerRequirement('agent-resource'), /AAE_ENABLE_MONAD_MAINNET_PAID_RAILS/);
    });

    await withEnv({
      AAE_ENABLE_X402_SELLER: 'true',
      AAE_ENABLE_MONAD_MAINNET_PAID_RAILS: 'true',
      X402_ALLOWED_NETWORKS: 'eip155:143',
      X402_MAX_PAYMENT_USD: '0.25',
      X402_SELLER_PAY_TO: '0x1111111111111111111111111111111111111111',
      X402_SELLER_PRICE_USD: '0.01',
      X402_SELLER_NETWORK: 'eip155:143',
      X402_SELLER_RESOURCE_IDS: 'agent-resource',
    }, async () => {
      const requirement = buildX402SellerRequirement('agent-resource');
      assert.equal(requirement.network, 'eip155:143');
      assert.equal(requirement.chainId, 143);
      assert.equal(requirement.currency, 'USDC');
      assert.equal(requirement.rawPaymentHeaderStored, false);
      assertNoRawMaterial(requirement, ['X-PAYMENT', 'PAYMENT-SIGNATURE']);
    });
  });

  await test('x402 seller protected resource requires settled facilitator-backed ledger evidence', async () => {
    await withEnv({
      AAE_ENABLE_X402_SELLER: 'true',
      X402_ALLOWED_NETWORKS: 'eip155:84532',
      X402_MAX_PAYMENT_USD: '0.25',
      X402_SELLER_PAY_TO: '0x1111111111111111111111111111111111111111',
      X402_SELLER_PRICE_USD: '0.01',
      X402_SELLER_NETWORK: 'eip155:84532',
      X402_SELLER_RESOURCE_IDS: 'agent-resource',
    }, async () => {
      const missing = await raw('GET', '/px402/x402/seller/resources/agent-resource/access');
      assert.equal(missing.status, 503, 'server env remains disabled by default for route-level access');

      const ledger = await prisma.paymentLedger.create({
        data: {
          receipt: 'redacted-x402-settlement',
          rail: 'x402',
          mode: 'settlement',
          amount: '0.01',
          token: 'USDC',
          tokenSymbol: 'USDC',
          txHash: txHashFor('seller-access', 'a'),
          receiptHash: txHashFor('seller-access', 'b'),
          chainId: 84532,
          network: 'base-sepolia',
          status: 'SETTLED',
          redactedReference: 'x402:eip155:84532:selleraccess',
          redactedReferenceHash: txHashFor('seller-access', 'c'),
          redactedReferenceType: 'coinbase-cdp:x402-facilitator',
          settledAt: new Date(),
        },
      });
      const access = await authorizeX402SellerResourceAccess('agent-resource', ledger.id);
      assert.equal(access.status, 'AUTHORIZED');
      assert.equal(access.ledgerId, ledger.id);
      assert.equal(access.network, 'base-sepolia');
      assertNoRawMaterial(access, ['X-PAYMENT', 'PAYMENT-SIGNATURE']);
    });
  });

  await test('x402 buyer intent is approval-gated, capped, redacted, and execution-disabled', async () => {
    const disabled = await raw('POST', '/px402/x402/buyer/intents', aliceAuth.token, {
      endpoint: 'http://127.0.0.1/probe',
      method: 'GET',
      approved: false,
    });
    assert.equal(disabled.status, 503);

    await withMockX402Server(async url => {
      await withEnv({
        AAE_ENABLE_X402_BUYER: 'true',
        X402_ALLOWED_NETWORKS: 'eip155:84532',
        X402_MAX_PAYMENT_USD: '0.25',
        X402_ENDPOINT_ALLOWLIST: new URL(url).origin,
        X402_MAX_RETRY_COUNT: '1',
      }, async () => {
        const quote = await prepareX402BuyerIntent({
          endpoint: url,
          method: 'GET',
          approved: false,
          walletAddress: WALLET_ALICE.address,
        });
        assert.equal(quote.state, 'APPROVAL_REQUIRED');
        assert.equal(quote.executeDisabled, true);
        assert.equal(quote.retryLimit, 1);
        assert.equal(quote.requirements.chainId, 84532);
        assertNoRawMaterial(quote, ['Payment-Required', 'X-PAYMENT']);

        const approved = await prepareX402BuyerIntent({
          endpoint: url,
          method: 'GET',
          approved: true,
          walletAddress: WALLET_ALICE.address,
        });
        assert.equal(approved.state, 'APPROVED_EXECUTION_DISABLED');
        const ledger = await prisma.paymentLedger.findUnique({ where: { id: approved.ledgerId } });
        assert(ledger, 'buyer intent ledger should be persisted');
        assert.equal(ledger?.rail, 'x402');
        assert.equal(ledger?.mode, 'buyer-intent');
        assert.equal(ledger?.status, 'APPROVED');
        assert.equal(ledger?.redactedReferenceType, 'x402-buyer-intent');
        assertNoRawMaterial(ledger, ['Payment-Required', 'X-PAYMENT']);

        assert.throws(() => executeApprovedX402BuyerPayment(), /operator-approved wallet signer path/);
      });
    });
  });

  console.log(`\n${BOLD}━━━ Results ━━━${RESET}`);
  console.log(`  ${GREEN}${passed} passed${RESET}`);
  if (failed > 0) console.log(`  ${RED}${failed} failed${RESET}`);
  console.log(`  ${passed + failed} total\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  logError(`Base MCP rails test suite crashed: ${e.message}`);
  console.error(e);
  process.exit(1);
});
