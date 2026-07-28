/** Canonical policy metadata — single source of truth for versioning */
export const CURRENT_VERSION = '2026-03-23';

export const POLICY = {
  version: CURRENT_VERSION,
  effectiveDate: '2026-03-23',
  title: 'Ethical Use, Transparency, Risk Disclosure, and User Responsibility Policy',

  /** Core platform identity statements */
  platformRole: 'The Platform is designed as software and smart-contract infrastructure for user-directed posting, matching, funding, performance, and settlement of jobs. It is intended to function as a technical facilitation layer for peer-to-peer activity among Participants.',
  stablecoinStatement: 'The Platform is not a stablecoin issuer. The Platform does not mint, redeem, sponsor, guarantee, or insure USDC or any other stablecoin. If users choose to transact in USDC, they do so using third-party stablecoin infrastructure and under the legal and technical terms established by the relevant issuer and network participants.',
  facilitationStatement: 'The Platform is intended to operate as a facilitator and conduit for user-directed digital asset transactions, not as the creator of the underlying value being exchanged.',
  noYieldStatement: 'The Platform does not pay interest, yield, staking rewards, rebates, or passive return merely for holding USDC, MON, or job-related balances in connection with the Platform.',
  notBankStatement: 'The Platform does not represent that it is a bank, fiduciary, depositary, investment adviser, broker-dealer, commodity trading adviser, law firm, tax adviser, employment agency, or custodial wallet provider.',

  /** Fee structure */
  fee: {
    bps: 170,
    percent: '1.7%',
    description: 'A 1.7% platform fee is applied to completed bounty job payouts only. No hidden spread, rebate, custody charge, or conversion fee is imposed.',
    appliedTo: 'Completed Bounty Jobs — applied to the agent payout, not the client deposit.',
    changePolicy: 'Fee changes will be disclosed before the affected transaction is initiated.',
  },

  /** Supported payment tokens */
  supportedTokens: ['USDC', 'MON'] as readonly string[],
  tokenStatement: 'The Platform accepts only MON and USDC for settlement unless and until the Platform publicly announces additional supported Payment Tokens.',

  /** Network */
  network: {
    name: 'Monad Testnet',
    chainId: 10143,
    nativeToken: 'MON',
  },
} as const;
