#!/usr/bin/env npx tsx

import assert from 'assert';
import {
  caip2ForNetwork,
  getChainById,
  getChainByKey,
  normalizeChainKey,
} from '../src/config/chains';
import { validateSettlementConfig } from '../src/routes/jobs';
import { getStablecoinProviderCapabilities } from '../src/services/stablecoinProviders';
import { createJobSchema } from '../src/utils/validation';

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

const baseNativeRobinhoodJob = {
  network: 'robinhood',
  chainId: 4663,
  settlementRail: 'standard',
  budgetAmount: 0.0001,
  budgetToken: 'ETH',
  escrowContractVersion: 'native-eth',
};

async function main() {
  console.log('\nRobinhood Chain config and validation tests\n');

  await test('chain registry resolves Robinhood mainnet and testnet metadata', () => {
    const mainnet = getChainByKey('robinhood');
    assert(mainnet, 'Robinhood mainnet config should exist');
    assert.equal(mainnet.chainId, 4663);
    assert.equal(mainnet.caip2Network, 'eip155:4663');
    assert.deepEqual(mainnet.supportedTokens, ['ETH']);
    assert.deepEqual(mainnet.settlementRails, ['standard']);
    assert.equal(mainnet.nativeCurrency.symbol, 'ETH');
    assert.equal(mainnet.explorerUrl, 'https://robinhoodchain.blockscout.com');
    assert.equal(mainnet.paidRailsEnabledEnvFlag, 'AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS');

    const testnet = getChainById(46630);
    assert(testnet, 'Robinhood testnet config should resolve by chain ID');
    assert.equal(testnet.key, 'robinhood-testnet');
    assert.equal(testnet.caip2Network, 'eip155:46630');
    assert.equal(testnet.nativeCurrency.symbol, 'ETH');
    assert.equal(testnet.testnet, true);
  });

  await test('normalization and CAIP-2 mapping include Robinhood aliases', () => {
    assert.equal(normalizeChainKey('robinhood-mainnet'), 'robinhood');
    assert.equal(normalizeChainKey('robinhood_chain'), 'robinhood');
    assert.equal(normalizeChainKey('robinhood-chain-testnet'), 'robinhood-testnet');
    assert.equal(caip2ForNetwork('robinhood'), 'eip155:4663');
    assert.equal(caip2ForNetwork('robinhood-testnet'), 'eip155:46630');
  });

  await test('create job schema accepts Robinhood native ETH direct wallet shape', () => {
    const parsed = createJobSchema.parse({
      title: 'Robinhood native ETH escrow',
      description: 'Post a Robinhood Chain native ETH direct wallet escrow job.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: ['native escrow funded'],
      budgetAmount: 0.0001,
      budgetToken: 'ETH',
      settlementRail: 'standard',
      network: 'robinhood',
      chainId: 4663,
      escrowContractVersion: 'native-eth',
    });
    assert.equal(parsed.network, 'robinhood');
    assert.equal(parsed.chainId, 4663);
  });

  await test('Robinhood mainnet paid direct wallet rail is guarded by explicit flag', () => withEnv({
    AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS: 'false',
  }, () => {
    const error = validateSettlementConfig(baseNativeRobinhoodJob);
    assert(error, 'mainnet paid rail should be rejected by default');
    assert(error!.includes('AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS=true'));
  }));

  await test('Robinhood native ETH direct wallet validation passes when mainnet gate is explicit', () => withEnv({
    AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS: 'true',
    AAE_ROBINHOOD_NATIVE_ETH_ESCROW_FACTORY_ADDRESS: '0x0000000000000000000000000000000000000002',
  }, () => {
    assert.equal(validateSettlementConfig(baseNativeRobinhoodJob), null);
  }));

  await test('Robinhood validation rejects mismatched chain ID', () => withEnv({
    AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS: 'true',
  }, () => {
    assert.match(validateSettlementConfig({ ...baseNativeRobinhoodJob, chainId: 8453 }) || '', /does not match robinhood/);
  }));

  await test('Robinhood validation rejects unsupported ERC20 or stablecoin tokens', () => withEnv({
    AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS: 'true',
    AAE_ROBINHOOD_USDC_TOKEN_ADDRESS: '0x0000000000000000000000000000000000000001',
  }, () => {
    assert.match(validateSettlementConfig({
      ...baseNativeRobinhoodJob,
      budgetToken: 'USDC',
      escrowContractVersion: 'legacy',
      tokenAddress: '0x0000000000000000000000000000000000000001',
    }) || '', /Token USDC is not supported/);
  }));

  await test('Robinhood validation rejects native ETH tokenAddress and ERC20 escrow metadata', () => withEnv({
    AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS: 'true',
  }, () => {
    assert.match(validateSettlementConfig({
      ...baseNativeRobinhoodJob,
      tokenAddress: '0x0000000000000000000000000000000000000001',
    }) || '', /must not include tokenAddress/);
    assert.match(validateSettlementConfig({
      ...baseNativeRobinhoodJob,
      escrowContractVersion: 'legacy',
    }) || '', /requires escrowContractVersion native-eth/);
  }));

  await test('Robinhood validation rejects x402, px402, and ERC-8183 rails', () => withEnv({
    AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS: 'true',
  }, () => {
    assert.match(validateSettlementConfig({ ...baseNativeRobinhoodJob, settlementRail: 'x402' }) || '', /not supported on robinhood/);
    assert.match(validateSettlementConfig({ ...baseNativeRobinhoodJob, settlementRail: 'px402' }) || '', /not supported on robinhood/);
    assert.match(validateSettlementConfig({ ...baseNativeRobinhoodJob, settlementRail: 'erc8183', escrowContractVersion: 'erc8183' }) || '', /not supported on robinhood/);
  }));

  await test('Robinhood testnet native ETH direct wallet validation is not mainnet-gated', () => {
    withEnv({
      AAE_ROBINHOOD_TESTNET_NATIVE_ETH_ESCROW_FACTORY_ADDRESS: '0x0000000000000000000000000000000000000002',
    }, () => {
      assert.equal(validateSettlementConfig({
        ...baseNativeRobinhoodJob,
        network: 'robinhood-testnet',
        chainId: 46630,
      }), null);
    });
  });

  await test('Robinhood native ETH validation rejects missing native factory config', () => withEnv({
    AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS: 'true',
    AAE_ROBINHOOD_NATIVE_ETH_ESCROW_FACTORY_ADDRESS: undefined,
    ROBINHOOD_NATIVE_ETH_ESCROW_FACTORY_ADDRESS: undefined,
    NATIVE_ETH_ESCROW_FACTORY_ADDRESS: undefined,
  }, () => {
    assert.match(validateSettlementConfig(baseNativeRobinhoodJob) || '', /native ETH direct wallet settlement is not configured on robinhood/i);
  }));

  await test('Robinhood direct wallet capability stays disabled until mainnet paid-rail gate is explicit', () => withEnv({
    AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS: undefined,
    AAE_ROBINHOOD_NATIVE_ETH_ESCROW_FACTORY_ADDRESS: '0x0000000000000000000000000000000000000002',
  }, () => {
    const chain = getChainByKey('robinhood');
    assert(chain, 'Robinhood chain config should exist');
    const direct = getStablecoinProviderCapabilities(undefined, chain).find(provider => provider.providerId === 'direct-wallet');
    assert(direct, 'direct-wallet provider should be present');
    assert.deepEqual(direct!.tokenSymbols, ['ETH']);
    assert.equal(direct!.enabled, false);
    assert(direct!.reasons.some(reason => reason.includes('AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS=false')));
  }));

  await test('direct wallet capability advertises only native ETH for Robinhood', () => withEnv({
    AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS: 'true',
    AAE_ROBINHOOD_NATIVE_ETH_ESCROW_FACTORY_ADDRESS: '0x0000000000000000000000000000000000000002',
    AAE_ROBINHOOD_ESCROW_FACTORY_ADDRESS: '0x0000000000000000000000000000000000000003',
    AAE_ROBINHOOD_USDC_TOKEN_ADDRESS: '0x0000000000000000000000000000000000000001',
  }, () => {
    const chain = getChainByKey('robinhood');
    assert(chain, 'Robinhood chain config should exist');
    const direct = getStablecoinProviderCapabilities(undefined, chain).find(provider => provider.providerId === 'direct-wallet');
    assert(direct, 'direct-wallet provider should be present');
    assert.deepEqual(direct!.tokenSymbols, ['ETH']);
    assert.equal(direct!.enabled, true);
  }));

  await test('Robinhood stablecoin providers cannot be enabled by broad x402 env', () => withEnv({
    AAE_ENABLE_X402_SELLER: 'true',
    AAE_ENABLE_X402_MAINNET: 'true',
    AAE_ENABLE_MAINNET_STABLECOIN_ACCEPTANCE: 'true',
    X402_ALLOWED_NETWORKS: 'eip155:4663',
    STABLECOIN_ACCEPTANCE_ALLOWED_NETWORKS: 'eip155:4663',
    STABLECOIN_ACCEPTANCE_ALLOWED_TOKENS: 'USDC',
    X402_MAX_PAYMENT_USD: '25',
    STABLECOIN_ACCEPTANCE_MAX_USD: '25',
  }, () => {
    const chain = getChainByKey('robinhood');
    assert(chain, 'Robinhood chain config should exist');
    const x402 = getStablecoinProviderCapabilities(undefined, chain).find(provider => provider.providerId === 'x402');
    assert(x402, 'x402 provider should be present');
    assert.equal(x402!.enabled, false);
    assert.deepEqual(x402!.tokenSymbols, []);
    assert(x402!.reasons.some(reason => reason.includes('x402 settlement rail is not supported on robinhood')));
  }));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
