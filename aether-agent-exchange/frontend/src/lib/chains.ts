import { defineChain } from 'viem';

export type ChainKey =
  | 'base'
  | 'base-sepolia'
  | 'ethereum'
  | 'ethereum-sepolia'
  | 'monad'
  | 'monad-testnet'
  | 'robinhood'
  | 'robinhood-testnet';

export const base = defineChain({
  id: 8453,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_BASE_RPC_URL || '/api/rpc/base'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: import.meta.env.VITE_BASE_EXPLORER_URL || 'https://basescan.org' },
  },
  testnet: false,
});

export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: import.meta.env.VITE_BASE_SEPOLIA_EXPLORER_URL || 'https://sepolia.basescan.org' },
  },
  testnet: true,
});

export const ethereum = defineChain({
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ETHEREUM_RPC_URL || '/api/rpc/ethereum'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: import.meta.env.VITE_ETHEREUM_EXPLORER_URL || 'https://etherscan.io' },
  },
  testnet: false,
});

export const ethereumSepolia = defineChain({
  id: 11155111,
  name: 'Ethereum Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ETHEREUM_SEPOLIA_RPC_URL || '/api/rpc/ethereum-sepolia'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: import.meta.env.VITE_ETHEREUM_SEPOLIA_EXPLORER_URL || 'https://sepolia.etherscan.io' },
  },
  testnet: true,
});

export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ROBINHOOD_RPC_URL || import.meta.env.VITE_ROBINHOOD_MAINNET_RPC_URL || '/api/rpc/robinhood'] },
  },
  blockExplorers: {
    default: { name: 'Robinhood Chain Blockscout', url: import.meta.env.VITE_ROBINHOOD_EXPLORER_URL || import.meta.env.VITE_ROBINHOOD_MAINNET_EXPLORER_URL || 'https://robinhoodchain.blockscout.com' },
  },
  testnet: false,
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ROBINHOOD_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com/'] },
  },
  blockExplorers: {
    default: { name: 'Robinhood Chain Testnet Explorer', url: import.meta.env.VITE_ROBINHOOD_TESTNET_EXPLORER_URL || 'https://explorer.testnet.chain.robinhood.com' },
  },
  testnet: true,
});

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_MONAD_TESTNET_RPC_URL || import.meta.env.VITE_MONAD_RPC_URL || 'https://testnet.monad.xyz/v1'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: import.meta.env.VITE_MONAD_TESTNET_EXPLORER_URL || import.meta.env.VITE_MONAD_EXPLORER_URL || 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
});

export const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_MONAD_MAINNET_RPC_URL || '/api/rpc/monad'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: import.meta.env.VITE_MONAD_MAINNET_EXPLORER_URL || 'https://monadexplorer.com' },
  },
  testnet: false,
});

export const supportedChains = [base, baseSepolia, ethereum, ethereumSepolia, monad, monadTestnet, robinhood, robinhoodTestnet] as const;

export const chainsByKey = {
  base,
  'base-sepolia': baseSepolia,
  ethereum,
  'ethereum-sepolia': ethereumSepolia,
  monad,
  'monad-testnet': monadTestnet,
  robinhood,
  'robinhood-testnet': robinhoodTestnet,
} as const;

function activeChainFromEnv() {
  const selectedKey = import.meta.env.VITE_ACTIVE_CHAIN as ChainKey | undefined;
  if (selectedKey && selectedKey in chainsByKey) {
    return chainsByKey[selectedKey];
  }

  const selectedId = Number(import.meta.env.VITE_ACTIVE_CHAIN_ID || base.id);
  return supportedChains.find((chain) => chain.id === selectedId) || base;
}

export const activeChain = activeChainFromEnv();

export function getSupportedPaymentTokenSymbols(nativeTokenSymbol: string = activeChain.nativeCurrency.symbol, chainKey?: ChainKey): string[] {
  const selectedKey = chainKey || (Object.entries(chainsByKey).find(([, chain]) => chain.id === activeChain.id)?.[0] as ChainKey | undefined);
  if (selectedKey === 'robinhood' || selectedKey === 'robinhood-testnet') {
    return [nativeTokenSymbol];
  }
  return Array.from(new Set(['USDC', nativeTokenSymbol]));
}

export function formatTokenList(tokens: string[]): string {
  if (tokens.length <= 1) return tokens[0] || '';
  if (tokens.length === 2) return `${tokens[0]} and ${tokens[1]}`;
  return `${tokens.slice(0, -1).join(', ')}, and ${tokens[tokens.length - 1]}`;
}

export const supportedPaymentTokenSymbols = getSupportedPaymentTokenSymbols();
export const supportedPaymentTokensLabel = formatTokenList(supportedPaymentTokenSymbols);
export const volatilePaymentTokenSymbols = supportedPaymentTokenSymbols.filter(token => token !== 'USDC');
export const volatilePaymentTokensLabel = formatTokenList(volatilePaymentTokenSymbols);

export function getExplorerAddressUrl(address: string): string {
  return `${activeChain.blockExplorers.default.url}/address/${address}`;
}
