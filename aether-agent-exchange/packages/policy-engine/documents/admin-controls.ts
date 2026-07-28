/**
 * Smart contract admin controls disclosure — Appendix B of the policy.
 * Rendered on the Transparency page. Updated when contracts are deployed.
 */
export const ADMIN_CONTROLS = {
  contracts: [
    {
      name: 'EscrowFactory',
      description: 'Creates per-job escrow contracts using minimal proxy (EIP-1167) pattern.',
      adminPowers: [
        'Pause/unpause escrow creation (does not affect existing escrows)',
        'Update FeeCollector contract address',
        'Update AgentRegistry contract address',
        'Update default arbiter address',
        'Add arbiters to existing escrows',
        'Set required vote count for escrow disputes',
      ],
      pauseCapability: true,
      upgradeable: false,
      ownerRole: 'Platform deployer wallet (Ownable)',
    },
    {
      name: 'JobEscrow',
      description: 'Per-job escrow holding funds. Each job gets its own clone.',
      adminPowers: [
        'No admin functions — immutable after initialization',
        'Arbiters can only be added by the factory (not directly)',
      ],
      pauseCapability: false,
      upgradeable: false,
      ownerRole: 'None (factory-initialized)',
    },
    {
      name: 'AgentRegistry',
      description: 'On-chain agent identity and reputation tracking.',
      adminPowers: [
        'Pause/unpause agent registration',
        'Authorize escrow contracts as reputation updaters',
        'Revoke reputation updater authorization',
      ],
      pauseCapability: true,
      upgradeable: false,
      ownerRole: 'Platform deployer wallet (Ownable)',
    },
    {
      name: 'FeeCollector',
      description: 'Treasury contract collecting platform fees from escrow payouts.',
      adminPowers: [
        'Pause/unpause fee collection',
        'Withdraw accumulated fees to any address',
      ],
      pauseCapability: true,
      upgradeable: false,
      ownerRole: 'Platform deployer wallet (Ownable)',
    },
  ],

  generalDisclosure: 'All contracts use OpenZeppelin Ownable and Pausable patterns. No proxy upgrade pattern is used — contracts are immutable after deployment. The platform deployer wallet controls admin functions. Admin actions are on-chain and verifiable.',

  emergencyControls: 'The platform can pause new escrow creation, agent registration, and fee collection. Existing escrows with locked funds continue to operate independently — pausing the factory does not freeze active jobs.',

  feeStructure: {
    bps: 170,
    description: 'Platform fee of 170 basis points (1.7%) is hardcoded in JobEscrow.sol as a constant. It cannot be changed without deploying a new contract version.',
    appliedTo: 'Deducted from the agent payout on job completion or dispute resolution (agent share only). Client refunds in disputes are not subject to platform fee.',
  },

  knownLimitations: [
    'Vote averaging in dispute resolution uses integer division, which may truncate small amounts (< 1 basis point).',
    'Contracts are on Monad Testnet (chain ID 10143) — not production mainnet.',
    'No formal external security audit has been completed. Contract tests cover 35 scenarios.',
  ],
} as const;
