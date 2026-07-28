export type ChainKey =
  | 'base'
  | 'base-sepolia'
  | 'ethereum'
  | 'ethereum-sepolia'
  | 'monad'
  | 'monad-testnet'
  | 'robinhood'
  | 'robinhood-testnet';

export interface ChainConfig {
  key: ChainKey;
  name: string;
  chainId: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrl: string | null;
  rpcEnvVar: string;
  rpcFallbackUrls?: string[];
  explorerUrl: string;
  explorerEnvVar: string;
  caip2Network: `eip155:${number}`;
  receiptIndexerEnvFlag: string;
  paidRailsEnabledEnvFlag?: string;
  contractEnvPrefix: string;
  confirmationDepth: number;
  reorgDepth: number;
  testnet: boolean;
  supportedTokens: string[];
  settlementRails: string[];
}

export const CHAIN_KEYS = ['base', 'base-sepolia', 'ethereum', 'ethereum-sepolia', 'monad', 'monad-testnet', 'robinhood', 'robinhood-testnet'] as const;
export const PRODUCTION_CHAIN_KEYS = ['base', 'ethereum', 'monad', 'robinhood'] as const;

export const BASE_MAINNET: ChainConfig = {
  key: 'base',
  name: 'Base',
  chainId: 8453,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: process.env.BASE_RPC_URL || null,
  rpcEnvVar: 'BASE_RPC_URL',
  rpcFallbackUrls: rpcFallbackUrls('BASE', ['https://mainnet.base.org']),
  explorerUrl: process.env.BASE_EXPLORER_URL || 'https://basescan.org',
  explorerEnvVar: 'BASE_EXPLORER_URL',
  caip2Network: 'eip155:8453',
  receiptIndexerEnvFlag: 'AAE_ENABLE_BASE_MAINNET_RECEIPT_INDEXER',
  contractEnvPrefix: 'BASE',
  confirmationDepth: Number(process.env.BASE_CONFIRMATION_DEPTH || '12'),
  reorgDepth: Number(process.env.BASE_REORG_DEPTH || '64'),
  testnet: false,
  supportedTokens: ['USDC', 'ETH'],
  settlementRails: ['standard', 'erc8183', 'x402', 'px402'],
};

export const BASE_SEPOLIA: ChainConfig = {
  key: 'base-sepolia',
  name: 'Base Sepolia',
  chainId: 84532,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || null,
  rpcEnvVar: 'BASE_SEPOLIA_RPC_URL',
  rpcFallbackUrls: rpcFallbackUrls('BASE_SEPOLIA', ['https://sepolia.base.org']),
  explorerUrl: process.env.BASE_SEPOLIA_EXPLORER_URL || 'https://sepolia.basescan.org',
  explorerEnvVar: 'BASE_SEPOLIA_EXPLORER_URL',
  caip2Network: 'eip155:84532',
  receiptIndexerEnvFlag: 'AAE_ENABLE_BASE_SEPOLIA_RECEIPT_INDEXER',
  contractEnvPrefix: 'BASE_SEPOLIA',
  confirmationDepth: Number(process.env.BASE_SEPOLIA_CONFIRMATION_DEPTH || '3'),
  reorgDepth: Number(process.env.BASE_SEPOLIA_REORG_DEPTH || '32'),
  testnet: true,
  supportedTokens: ['USDC', 'ETH'],
  settlementRails: ['standard', 'erc8183', 'x402', 'px402', 'px402-dry-run'],
};

export const ETHEREUM_MAINNET: ChainConfig = {
  key: 'ethereum',
  name: 'Ethereum',
  chainId: 1,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: process.env.ETHEREUM_RPC_URL || null,
  rpcEnvVar: 'ETHEREUM_RPC_URL',
  explorerUrl: process.env.ETHEREUM_EXPLORER_URL || 'https://etherscan.io',
  explorerEnvVar: 'ETHEREUM_EXPLORER_URL',
  caip2Network: 'eip155:1',
  receiptIndexerEnvFlag: 'AAE_ENABLE_ETHEREUM_MAINNET_RECEIPT_INDEXER',
  paidRailsEnabledEnvFlag: 'AAE_ENABLE_ETHEREUM_MAINNET_PAID_RAILS',
  contractEnvPrefix: 'ETHEREUM',
  confirmationDepth: Number(process.env.ETHEREUM_CONFIRMATION_DEPTH || '15'),
  reorgDepth: Number(process.env.ETHEREUM_REORG_DEPTH || '128'),
  testnet: false,
  supportedTokens: ['USDC', 'ETH'],
  settlementRails: ['standard', 'erc8183'],
};

export const ETHEREUM_SEPOLIA: ChainConfig = {
  key: 'ethereum-sepolia',
  name: 'Ethereum Sepolia',
  chainId: 11155111,
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL || null,
  rpcEnvVar: 'ETHEREUM_SEPOLIA_RPC_URL',
  explorerUrl: process.env.ETHEREUM_SEPOLIA_EXPLORER_URL || 'https://sepolia.etherscan.io',
  explorerEnvVar: 'ETHEREUM_SEPOLIA_EXPLORER_URL',
  caip2Network: 'eip155:11155111',
  receiptIndexerEnvFlag: 'AAE_ENABLE_ETHEREUM_SEPOLIA_RECEIPT_INDEXER',
  contractEnvPrefix: 'ETHEREUM_SEPOLIA',
  confirmationDepth: Number(process.env.ETHEREUM_SEPOLIA_CONFIRMATION_DEPTH || '3'),
  reorgDepth: Number(process.env.ETHEREUM_SEPOLIA_REORG_DEPTH || '32'),
  testnet: true,
  supportedTokens: ['USDC', 'ETH'],
  settlementRails: ['standard', 'erc8183'],
};

export const ROBINHOOD_MAINNET: ChainConfig = {
  key: 'robinhood',
  name: 'Robinhood Chain',
  chainId: 4663,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: process.env.ROBINHOOD_RPC_URL || process.env.ROBINHOOD_MAINNET_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com/',
  rpcEnvVar: 'ROBINHOOD_RPC_URL',
  rpcFallbackUrls: rpcFallbackUrls('ROBINHOOD', ['https://rpc.mainnet.chain.robinhood.com/']),
  explorerUrl: process.env.ROBINHOOD_EXPLORER_URL || process.env.ROBINHOOD_MAINNET_EXPLORER_URL || 'https://robinhoodchain.blockscout.com',
  explorerEnvVar: 'ROBINHOOD_EXPLORER_URL',
  caip2Network: 'eip155:4663',
  receiptIndexerEnvFlag: 'AAE_ENABLE_ROBINHOOD_MAINNET_RECEIPT_INDEXER',
  paidRailsEnabledEnvFlag: 'AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS',
  contractEnvPrefix: 'ROBINHOOD',
  confirmationDepth: Number(process.env.ROBINHOOD_CONFIRMATION_DEPTH || process.env.ROBINHOOD_MAINNET_CONFIRMATION_DEPTH || '12'),
  reorgDepth: Number(process.env.ROBINHOOD_REORG_DEPTH || process.env.ROBINHOOD_MAINNET_REORG_DEPTH || '64'),
  testnet: false,
  supportedTokens: ['ETH'],
  settlementRails: ['standard'],
};

export const ROBINHOOD_TESTNET: ChainConfig = {
  key: 'robinhood-testnet',
  name: 'Robinhood Chain Testnet',
  chainId: 46630,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: process.env.ROBINHOOD_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com/',
  rpcEnvVar: 'ROBINHOOD_TESTNET_RPC_URL',
  rpcFallbackUrls: rpcFallbackUrls('ROBINHOOD_TESTNET', ['https://rpc.testnet.chain.robinhood.com/']),
  explorerUrl: process.env.ROBINHOOD_TESTNET_EXPLORER_URL || 'https://explorer.testnet.chain.robinhood.com',
  explorerEnvVar: 'ROBINHOOD_TESTNET_EXPLORER_URL',
  caip2Network: 'eip155:46630',
  receiptIndexerEnvFlag: 'AAE_ENABLE_ROBINHOOD_TESTNET_RECEIPT_INDEXER',
  contractEnvPrefix: 'ROBINHOOD_TESTNET',
  confirmationDepth: Number(process.env.ROBINHOOD_TESTNET_CONFIRMATION_DEPTH || '3'),
  reorgDepth: Number(process.env.ROBINHOOD_TESTNET_REORG_DEPTH || '32'),
  testnet: true,
  supportedTokens: ['ETH'],
  settlementRails: ['standard'],
};

export const MONAD_TESTNET: ChainConfig = {
  key: 'monad-testnet',
  name: 'Monad Testnet',
  chainId: 10143,
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrl: process.env.MONAD_TESTNET_RPC_URL || process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
  rpcEnvVar: 'MONAD_TESTNET_RPC_URL',
  explorerUrl: process.env.MONAD_TESTNET_EXPLORER_URL || process.env.MONAD_EXPLORER_URL || 'https://testnet.monadexplorer.com',
  explorerEnvVar: 'MONAD_TESTNET_EXPLORER_URL',
  caip2Network: 'eip155:10143',
  receiptIndexerEnvFlag: 'AAE_ENABLE_MONAD_TESTNET_RECEIPT_INDEXER',
  contractEnvPrefix: 'MONAD_TESTNET',
  confirmationDepth: Number(process.env.MONAD_TESTNET_CONFIRMATION_DEPTH || '3'),
  reorgDepth: Number(process.env.MONAD_TESTNET_REORG_DEPTH || '32'),
  testnet: true,
  supportedTokens: ['USDC', 'MON'],
  settlementRails: ['standard'],
};

function rpcFallbackUrls(prefix: string, defaults: string[] = []): string[] {
  return [
    process.env[`AAE_${prefix}_RPC_FALLBACK_URLS`],
    process.env[`${prefix}_RPC_FALLBACK_URLS`],
    process.env[`AAE_${prefix}_RPC_FALLBACK_URL`],
    process.env[`${prefix}_RPC_FALLBACK_URL`],
    ...defaults,
  ].flatMap(value => (value || '').split(','))
    .map(value => value.trim())
    .filter(Boolean);
}

export const MONAD_MAINNET: ChainConfig = {
  key: 'monad',
  name: 'Monad',
  chainId: 143,
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrl: process.env.MONAD_MAINNET_RPC_URL || null,
  rpcEnvVar: 'MONAD_MAINNET_RPC_URL',
  explorerUrl: process.env.MONAD_MAINNET_EXPLORER_URL || 'https://monadexplorer.com',
  explorerEnvVar: 'MONAD_MAINNET_EXPLORER_URL',
  caip2Network: 'eip155:143',
  receiptIndexerEnvFlag: 'AAE_ENABLE_MONAD_MAINNET_RECEIPT_INDEXER',
  paidRailsEnabledEnvFlag: 'AAE_ENABLE_MONAD_MAINNET_PAID_RAILS',
  contractEnvPrefix: 'MONAD',
  confirmationDepth: Number(process.env.MONAD_CONFIRMATION_DEPTH || '12'),
  reorgDepth: Number(process.env.MONAD_REORG_DEPTH || '64'),
  testnet: false,
  supportedTokens: ['MON'],
  settlementRails: ['standard', 'x402', 'px402'],
};

export const CHAINS = {
  [BASE_MAINNET.key]: BASE_MAINNET,
  [BASE_SEPOLIA.key]: BASE_SEPOLIA,
  [ETHEREUM_MAINNET.key]: ETHEREUM_MAINNET,
  [ETHEREUM_SEPOLIA.key]: ETHEREUM_SEPOLIA,
  [MONAD_MAINNET.key]: MONAD_MAINNET,
  [MONAD_TESTNET.key]: MONAD_TESTNET,
  [ROBINHOOD_MAINNET.key]: ROBINHOOD_MAINNET,
  [ROBINHOOD_TESTNET.key]: ROBINHOOD_TESTNET,
} as const;

export function getActiveChain(): ChainConfig {
  const key = (process.env.AAE_ACTIVE_CHAIN || process.env.ACTIVE_CHAIN || process.env.SETTLEMENT_NETWORK || 'base') as keyof typeof CHAINS;
  return CHAINS[key] || BASE_MAINNET;
}

export function normalizeChainKey(value?: string | null): ChainKey | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/_/g, '-').toLowerCase();
  if (normalized === 'base-mainnet' || normalized === 'basemainnet') return 'base';
  if (normalized === 'basesepolia') return 'base-sepolia';
  if (normalized === 'ethereum-mainnet' || normalized === 'eth-mainnet' || normalized === 'eth' || normalized === 'mainnet') return 'ethereum';
  if (normalized === 'ethereumsepolia' || normalized === 'eth-sepolia' || normalized === 'sepolia') return 'ethereum-sepolia';
  if (normalized === 'monad-mainnet' || normalized === 'monadmainnet') return 'monad';
  if (normalized === 'monadtestnet') return 'monad-testnet';
  if (normalized === 'robinhood-mainnet' || normalized === 'robinhoodchain' || normalized === 'robinhood-chain') return 'robinhood';
  if (normalized === 'robinhoodtestnet' || normalized === 'robinhood-chain-testnet' || normalized === 'robinhoodchaintestnet') return 'robinhood-testnet';
  return (CHAIN_KEYS as readonly string[]).includes(normalized) ? normalized as ChainKey : undefined;
}

export function getChainByKey(key?: string | null): ChainConfig | undefined {
  const normalized = normalizeChainKey(key);
  return normalized ? CHAINS[normalized] : undefined;
}

export function getChainById(chainId: number): ChainConfig | undefined {
  return Object.values(CHAINS).find((chain) => chain.chainId === chainId);
}

export function getChainByNetworkOrId(network?: string | null, chainId?: number | null): ChainConfig | undefined {
  const byNetwork = getChainByKey(network);
  const byId = chainId ? getChainById(chainId) : undefined;
  if (byNetwork && byId && byNetwork.chainId !== byId.chainId) return undefined;
  return byNetwork || byId;
}

export function rpcUrlsForChain(chain: ChainConfig): string[] {
  return Array.from(new Set([
    chain.rpcUrl,
    ...(chain.rpcFallbackUrls || []),
  ].map(value => value?.trim()).filter(Boolean) as string[]));
}

export function caip2ForNetwork(network: string): string | undefined {
  const chain = getChainByKey(network);
  if (chain) return chain.caip2Network;
  const normalized = network.replace(/_/g, '-').toLowerCase();
  return /^eip155:\d+$/.test(normalized) ? normalized : undefined;
}

export function networkForCaip2(caip2: string): string {
  const chain = Object.values(CHAINS).find((item) => item.caip2Network === caip2);
  return chain?.key || caip2;
}

export function chainEnvValue(chain: ChainConfig, name: string, fallback?: string): string | undefined {
  const active = getActiveChain().key === chain.key;
  return process.env[`AAE_${chain.contractEnvPrefix}_${name}`]
    || process.env[`${chain.contractEnvPrefix}_${name}`]
    || (active ? process.env[fallback || name] : undefined);
}

export function publicContractAddressesForChain(chainKey: string) {
  const chain = getChainByKey(chainKey);
  if (!chain) {
    return {
      escrowFactory: null,
      nativeEscrowFactory: null,
      erc8183Factory: null,
      agentRegistry: null,
      feeCollector: null,
    };
  }
  const value = (name: string, fallback?: string) => chainEnvValue(chain, name, fallback) || null;
  return {
    escrowFactory: value('ESCROW_FACTORY_ADDRESS'),
    nativeEscrowFactory: value('NATIVE_ETH_ESCROW_FACTORY_ADDRESS'),
    erc8183Factory: value('ERC8183_FACTORY_ADDRESS'),
    agentRegistry: value('AGENT_REGISTRY_ADDRESS'),
    feeCollector: value('FEE_COLLECTOR_ADDRESS'),
  };
}
