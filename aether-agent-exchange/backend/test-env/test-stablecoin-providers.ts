#!/usr/bin/env npx tsx

import assert from 'assert';
import prisma from '../src/lib/prisma';
import {
  assertStablecoinProviderCanQuote,
  assertStablecoinReceiptReferenceAvailable,
  generatePaymentRequirement,
  normalizeStablecoinReceiptEvidence,
} from '../src/services/stablecoinProviders';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  OK ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`    ${err.message}`);
  }
}

function withEnv<T>(values: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function main() {
  console.log('\nstablecoin provider boundary tests\n');

  await test('unsupported provider fails closed', () => {
    assert.throws(() => generatePaymentRequirement({
      providerId: 'unknown-provider',
      network: 'base-sepolia',
      tokenSymbol: 'USDC',
      amountUsd: '0.01',
      resource: '/jobs/test',
    }), /Unsupported stablecoin provider/);
  });

  await test('disabled provider fails closed', () => withEnv({
    AAE_ENABLE_X402_SELLER: 'false',
    AAE_ENABLE_X402_BUYER: 'false',
    STABLECOIN_ACCEPTANCE_ALLOWED_NETWORKS: 'eip155:84532',
    STABLECOIN_ACCEPTANCE_ALLOWED_TOKENS: 'USDC',
    STABLECOIN_ACCEPTANCE_MAX_USD: '1',
  }, () => {
    assert.throws(() => assertStablecoinProviderCanQuote({
      providerId: 'x402',
      network: 'base-sepolia',
      tokenSymbol: 'USDC',
      amountUsd: '0.01',
      resource: '/jobs/test',
    }), /not enabled/);
  }));

  await test('missing cap and allowlist fail closed', () => withEnv({
    AAE_ENABLE_X402_SELLER: 'true',
    STABLECOIN_ACCEPTANCE_ALLOWED_NETWORKS: '',
    STABLECOIN_ACCEPTANCE_ALLOWED_TOKENS: 'USDC',
    STABLECOIN_ACCEPTANCE_MAX_USD: '0',
  }, () => {
    assert.throws(() => assertStablecoinProviderCanQuote({
      providerId: 'x402',
      network: 'base-sepolia',
      tokenSymbol: 'USDC',
      amountUsd: '0.01',
      resource: '/jobs/test',
    }), /not enabled/);
  }));

  await test('USDC-only validation rejects other tokens', () => withEnv({
    AAE_ENABLE_X402_SELLER: 'true',
    STABLECOIN_ACCEPTANCE_ALLOWED_NETWORKS: 'eip155:84532',
    STABLECOIN_ACCEPTANCE_ALLOWED_TOKENS: 'USDC',
    STABLECOIN_ACCEPTANCE_MAX_USD: '1',
  }, () => {
    assert.throws(() => assertStablecoinProviderCanQuote({
      providerId: 'x402',
      network: 'base-sepolia',
      tokenSymbol: 'ETH',
      amountUsd: '0.01',
      resource: '/jobs/test',
    }), /USDC-only/);
    assert.throws(() => normalizeStablecoinReceiptEvidence({
      providerId: 'x402',
      rail: 'x402',
      network: 'base-sepolia',
      tokenSymbol: 'MON',
      amount: '0.01',
      status: 'SETTLED',
    }), /USDC-only/);
  }));

  await test('mainnet is disabled by default', () => withEnv({
    AAE_ENABLE_X402_SELLER: 'true',
    AAE_ENABLE_MAINNET_STABLECOIN_ACCEPTANCE: 'false',
    STABLECOIN_ACCEPTANCE_ALLOWED_NETWORKS: 'eip155:8453',
    STABLECOIN_ACCEPTANCE_ALLOWED_TOKENS: 'USDC',
    STABLECOIN_ACCEPTANCE_MAX_USD: '1',
  }, () => {
    assert.throws(() => assertStablecoinProviderCanQuote({
      providerId: 'x402',
      network: 'base',
      tokenSymbol: 'USDC',
      amountUsd: '0.01',
      resource: '/jobs/test',
    }), /mainnet stablecoin acceptance is disabled/);
  }));

  await test('raw secret and payment header material is rejected', () => {
    assert.throws(() => normalizeStablecoinReceiptEvidence({
      providerId: 'x402',
      rail: 'x402',
      network: 'base-sepolia',
      tokenSymbol: 'USDC',
      amount: '0.01',
      status: 'SETTLED',
      payload: { 'X-PAYMENT': 'raw-payment-header' },
    }), /Raw payment/);

    assert.throws(() => normalizeStablecoinReceiptEvidence({
      providerId: 'visa-tap',
      rail: 'visa-agentic-stablecoin',
      network: 'base-sepolia',
      tokenSymbol: 'USDC',
      amount: '0.01',
      status: 'SETTLED',
      payload: { cardCredentials: '4111111111111111' },
    }), /Raw payment/);
  });

  await test('duplicate receipt references are rejected', async () => {
    const receiptHash = '0x' + '9'.repeat(64);
    await prisma.paymentLedger.deleteMany({ where: { receiptHash } });
    await prisma.paymentLedger.create({
      data: {
        receipt: 'redacted-test-receipt',
        rail: 'x402',
        mode: 'settlement',
        amount: '0.01',
        token: 'USDC',
        tokenSymbol: 'USDC',
        receiptHash,
        chainId: 84532,
        network: 'base-sepolia',
        status: 'SETTLED',
      },
    });
    await assert.rejects(() => assertStablecoinReceiptReferenceAvailable(receiptHash), /already recorded/);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
