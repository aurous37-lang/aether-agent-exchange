import type { ChainKey } from './chains';

export interface ContractAddresses {
  escrowFactory?: `0x${string}`;
  nativeEscrowFactory?: `0x${string}`;
  erc8183Factory?: `0x${string}`;
  feeCollector?: `0x${string}`;
}

function envAddress(name: string): `0x${string}` | undefined {
  const value = import.meta.env[name];
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? value as `0x${string}`
    : undefined;
}

function envPrefix(chainKey: ChainKey): string {
  return chainKey.replace(/-/g, '_').toUpperCase();
}

function activeEnvFallback(chainKey: ChainKey, name: string): `0x${string}` | undefined {
  return import.meta.env.VITE_ACTIVE_CHAIN === chainKey ? envAddress(name) : undefined;
}

export function getContractsForChain(chainKey: ChainKey): ContractAddresses {
  const prefix = envPrefix(chainKey);
  return {
    escrowFactory: envAddress(`VITE_${prefix}_ESCROW_FACTORY_ADDRESS`) || activeEnvFallback(chainKey, 'VITE_ESCROW_FACTORY_ADDRESS'),
    nativeEscrowFactory: envAddress(`VITE_${prefix}_NATIVE_ETH_ESCROW_FACTORY_ADDRESS`) || activeEnvFallback(chainKey, 'VITE_NATIVE_ETH_ESCROW_FACTORY_ADDRESS'),
    erc8183Factory: envAddress(`VITE_${prefix}_ERC8183_FACTORY_ADDRESS`) || activeEnvFallback(chainKey, 'VITE_ERC8183_FACTORY_ADDRESS'),
    feeCollector: envAddress(`VITE_${prefix}_FEE_COLLECTOR_ADDRESS`) || activeEnvFallback(chainKey, 'VITE_FEE_COLLECTOR_ADDRESS'),
  };
}

export function getPaymentTokenAddressesForChain(chainKey: ChainKey): Partial<Record<string, `0x${string}`>> {
  const prefix = envPrefix(chainKey);
  const activeFallback = import.meta.env.VITE_ACTIVE_CHAIN === chainKey;
  return {
    USDC: envAddress(`VITE_${prefix}_USDC_TOKEN_ADDRESS`) || (activeFallback ? envAddress('VITE_USDC_TOKEN_ADDRESS') : undefined),
    MON: envAddress(`VITE_${prefix}_MON_TOKEN_ADDRESS`) || (activeFallback ? envAddress('VITE_MON_TOKEN_ADDRESS') : undefined),
    ETH: envAddress(`VITE_${prefix}_WETH_TOKEN_ADDRESS`) || (activeFallback ? envAddress('VITE_WETH_TOKEN_ADDRESS') : undefined),
  };
}

// Contract addresses for the default active chain. Prefer getContractsForChain()
// in workflows that let the user choose a network.
export const CONTRACTS = getContractsForChain((import.meta.env.VITE_ACTIVE_CHAIN || 'base') as ChainKey);

export const PAYMENT_TOKEN_ADDRESSES = getPaymentTokenAddressesForChain((import.meta.env.VITE_ACTIVE_CHAIN || 'base') as ChainKey);

export const PAYMENT_TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  MON: 18,
  ETH: 18,
};

// ─── Minimal ABIs ─────────────────────────────────────────────────────
// Only the function signatures the frontend actually calls.
// Extracted from EscrowFactory.sol, JobEscrow.sol, and the ERC-20 standard.

export const ESCROW_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createEscrow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'bytes32' },
      { name: 'client', type: 'address' },
      { name: 'paymentToken', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'reviewPeriod', type: 'uint256' },
    ],
    outputs: [
      { name: 'escrow', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'createEscrow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'bytes32' },
      { name: 'client', type: 'address' },
      { name: 'paymentToken', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'reviewPeriod', type: 'uint256' },
      { name: 'acceptanceDeadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'escrow', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'getEscrow',
    stateMutability: 'view',
    inputs: [
      { name: 'jobId', type: 'bytes32' },
    ],
    outputs: [
      { name: '', type: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'EscrowCreated',
    inputs: [
      { name: 'jobId', type: 'bytes32', indexed: true },
      { name: 'escrow', type: 'address', indexed: false },
      { name: 'client', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const NATIVE_ESCROW_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createEscrow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'bytes32' },
      { name: 'client', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'reviewPeriod', type: 'uint256' },
    ],
    outputs: [
      { name: 'escrow', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'createEscrow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'bytes32' },
      { name: 'client', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'reviewPeriod', type: 'uint256' },
      { name: 'acceptanceDeadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'escrow', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'getEscrow',
    stateMutability: 'view',
    inputs: [
      { name: 'jobId', type: 'bytes32' },
    ],
    outputs: [
      { name: '', type: 'address' },
    ],
  },
] as const;

export const ERC8183_JOB_FACTORY_ABI = [
  {
    type: 'function',
    name: 'submit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'deliverable', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'complete',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'reason', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reject',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'reason', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimRefund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getEscrow',
    stateMutability: 'view',
    inputs: [
      { name: 'jobId', type: 'uint256' },
    ],
    outputs: [
      { name: '', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'paymentToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'address' },
    ],
  },
] as const;

export const JOB_ESCROW_ABI = [
  {
    type: 'function',
    name: 'fund',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'startWork',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_agentId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submitDeliverable',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_deliverableHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'dispute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'state',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'escrowAmount',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'client',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'agentWallet',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'paymentToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'reviewDeadline',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getDetails',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_jobId', type: 'bytes32' },
      { name: '_client', type: 'address' },
      { name: '_paymentToken', type: 'address' },
      { name: '_escrowAmount', type: 'uint256' },
      { name: '_state', type: 'uint8' },
      { name: '_agentId', type: 'bytes32' },
      { name: '_agentWallet', type: 'address' },
      { name: '_deliverableHash', type: 'bytes32' },
      { name: '_reviewDeadline', type: 'uint256' },
    ],
  },
] as const;

export const NATIVE_JOB_ESCROW_ABI = [
  {
    type: 'function',
    name: 'fund',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'startWork',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_agentId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submitDeliverable',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_deliverableHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'dispute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'state',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint8' },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [
      { name: '', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
    ],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },
] as const;

// ─── Escrow state enum (mirrors Solidity) ─────────────────────────────

export const EscrowState = {
  UNFUNDED: 0,
  FUNDED: 1,
  IN_PROGRESS: 2,
  PENDING_REVIEW: 3,
  COMPLETED: 4,
  DISPUTED: 5,
  RESOLVED: 6,
  CANCELLED: 7,
} as const;

export type EscrowStateValue = (typeof EscrowState)[keyof typeof EscrowState];

export const ESCROW_STATE_LABELS: Record<EscrowStateValue, string> = {
  [EscrowState.UNFUNDED]: 'Unfunded',
  [EscrowState.FUNDED]: 'Funded',
  [EscrowState.IN_PROGRESS]: 'In Progress',
  [EscrowState.PENDING_REVIEW]: 'Pending Review',
  [EscrowState.COMPLETED]: 'Completed',
  [EscrowState.DISPUTED]: 'Disputed',
  [EscrowState.RESOLVED]: 'Resolved',
  [EscrowState.CANCELLED]: 'Cancelled',
};
