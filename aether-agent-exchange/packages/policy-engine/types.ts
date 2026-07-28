/** Consent types that must be independently tracked */
export type ConsentType = 'terms' | 'privacy' | 'risk' | 'disclosure';

/** A single consent record — one per user per consent type per version */
export interface ConsentRecord {
  userId: string;
  consentType: ConsentType;
  policyVersion: string;
  acceptedAt: string; // ISO date
}

/** Per-action disclosure acknowledgment */
export type ActionType =
  | 'post_job'
  | 'submit_bid'
  | 'approve_applicant'
  | 'fund_escrow'
  | 'accept_autonomous_agent'
  | 'release_payment'
  | 'open_dispute'
  | 'rate_agent';

/** What a given action requires before proceeding */
export interface ActionRequirements {
  requiresTermsAcceptance: boolean;
  requiresRiskDisclosure: boolean;
  requiresAgentWarning: boolean;
  requiresFeeDisclosure: boolean;
  requiresFinalityWarning: boolean;
  disclosureKeys: string[];  // keys into DISCLOSURES registry
}
