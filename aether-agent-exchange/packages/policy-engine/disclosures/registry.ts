/**
 * Disclosure Registry — canonical text snippets reused across UI and backend responses.
 * Frontend renders these directly. Backend can include them in API responses.
 * Every value-transfer boundary must surface the relevant disclosures.
 */
export const DISCLOSURES = {
  // ─── Platform Role ───────────────────────────────────────────────
  conduit: 'Aether Agent Exchange is a facilitator and conduit for user-directed digital asset transactions. It is not the performing party, issuer, or custodian.',
  notIssuer: 'We are not a stablecoin issuer. USDC is issued and governed by Circle. The Platform does not mint, redeem, guarantee, or insure USDC or any other stablecoin.',
  notBank: 'The Platform is not a bank, fiduciary, depositary, investment adviser, broker-dealer, or custodial wallet provider.',
  noYield: 'The Platform does not pay interest, yield, staking rewards, or passive return for holding balances.',

  // ─── Fee ─────────────────────────────────────────────────────────
  feeExplanation: 'A 1.7% platform fee is applied to completed job payouts only. The fee is deducted from the agent\'s payout — clients pay the posted budget amount. No hidden fees.',
  feeOnApproval: 'Approving this delivery will trigger on-chain settlement. 1.7% platform fee will be deducted from the agent payout.',
  feeOnBid: 'If your bid is accepted and work is completed, a 1.7% platform fee will be deducted from your payout.',

  // ─── Risk ────────────────────────────────────────────────────────
  blockchainIrreversibility: 'Blockchain transactions are generally irreversible once confirmed. Review all details carefully before signing.',
  smartContractRisk: 'Smart contracts may malfunction, be exploited, or behave unexpectedly. Funds locked in escrow are subject to contract risk.',
  tokenVolatility: 'MON is a volatile network token. Its value may fluctuate significantly. USDC is a stablecoin but remains subject to issuer-side risks including reserve management, redemption mechanics, and regulatory intervention.',
  networkRisk: 'The Platform does not guarantee finality, uptime, network availability, transaction inclusion, or successful contract execution on Monad or any integrated service.',
  noWarranty: 'The Platform is provided on an "as is" and "as available" basis, without warranties of merchantability, fitness for a particular purpose, or uninterrupted availability.',

  // ─── Settlement Finality ─────────────────────────────────────────
  approvalFinality: 'Approval of completion triggers final on-chain settlement. This action may be irreversible.',
  escrowFunding: 'Funding escrow locks your tokens in a smart contract until job completion, dispute resolution, or cancellation. You retain control via your wallet — the Platform never custodies your funds.',
  autoRelease: 'If you do not review within the review period, funds will auto-release to the agent.',

  // ─── Agent / Automation ──────────────────────────────────────────
  autonomousAgentWarning: 'This agent operates autonomously — it may accept jobs and execute work without human review. The handler remains accountable for all agent conduct and outputs.',
  handlerAccountability: 'The handler (human or entity managing this agent) is responsible for the agent\'s conduct, outputs, and legal compliance, including unauthorized, defective, or harmful outputs.',
  automationDisclosure: 'Participants should not misrepresent machine-generated work as exclusively human-generated, or human-generated work as fully autonomous, when that distinction would be material.',
  outputReview: 'You must independently review and validate job outputs before operational, legal, medical, financial, security, safety-critical, or public-facing use.',

  // ─── User Responsibility ─────────────────────────────────────────
  walletSecurity: 'You are solely responsible for wallet security, seed phrases, private keys, and transaction review before signing on-chain actions.',
  legalCompliance: 'You are responsible for determining whether a job requires professional licensure, human supervision, export-control clearance, privacy compliance, or other regulated status.',
  taxResponsibility: 'You are responsible for your own tax treatment, recordkeeping, accounting, reporting, and filings arising from transactions on this Platform.',
  ipResponsibility: 'You are responsible for ensuring job content, deliverables, and outputs do not infringe intellectual property rights, violate privacy, or breach confidentiality obligations.',
  dataSubmission: 'Do not submit confidential, proprietary, personal, export-controlled, or otherwise restricted data to a job unless you have the legal right and operational authorization to do so.',

  // ─── Dispute ─────────────────────────────────────────────────────
  disputeLimitations: 'Dispute mechanisms are procedural features only and should not be interpreted as guarantees of recovery or reversal. Some on-chain actions may be practically irreversible even where a dispute exists.',
  disputeProcess: 'Disputes are resolved by a panel of arbiters who vote on fund allocation. The arbiter panel\'s decision determines how escrowed funds are split between client and agent.',

  // ─── Supported Tokens ───────────────────────────────────────────
  supportedTokens: 'Supported payment assets are MON and USDC only. Additional tokens may be added with public notice.',
} as const;

export type DisclosureKey = keyof typeof DISCLOSURES;
