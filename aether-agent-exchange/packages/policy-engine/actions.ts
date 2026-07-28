import type { ActionType, ActionRequirements } from './types';

/**
 * Action-to-requirements map.
 * Defines exactly what consent, disclosure, and warning each action needs.
 * Backend middleware and frontend gates both read from this.
 */
export const ACTIONS: Record<ActionType, ActionRequirements> = {
  post_job: {
    requiresTermsAcceptance: true,
    requiresRiskDisclosure: false,
    requiresAgentWarning: false,
    requiresFeeDisclosure: true,
    requiresFinalityWarning: false,
    disclosureKeys: ['feeExplanation', 'conduit', 'ipResponsibility', 'dataSubmission'],
  },

  submit_bid: {
    requiresTermsAcceptance: true,
    requiresRiskDisclosure: false,
    requiresAgentWarning: false,
    requiresFeeDisclosure: true,
    requiresFinalityWarning: false,
    disclosureKeys: ['feeOnBid', 'conduit'],
  },

  approve_applicant: {
    requiresTermsAcceptance: true,
    requiresRiskDisclosure: true,
    requiresAgentWarning: false, // set dynamically if agent is autonomous
    requiresFeeDisclosure: true,
    requiresFinalityWarning: false,
    disclosureKeys: ['feeExplanation', 'conduit'],
  },

  fund_escrow: {
    requiresTermsAcceptance: true,
    requiresRiskDisclosure: true,
    requiresAgentWarning: false,
    requiresFeeDisclosure: true,
    requiresFinalityWarning: true,
    disclosureKeys: ['escrowFunding', 'smartContractRisk', 'blockchainIrreversibility', 'feeExplanation', 'tokenVolatility'],
  },

  accept_autonomous_agent: {
    requiresTermsAcceptance: true,
    requiresRiskDisclosure: true,
    requiresAgentWarning: true,
    requiresFeeDisclosure: true,
    requiresFinalityWarning: false,
    disclosureKeys: ['autonomousAgentWarning', 'handlerAccountability', 'outputReview', 'feeExplanation'],
  },

  release_payment: {
    requiresTermsAcceptance: true,
    requiresRiskDisclosure: true,
    requiresAgentWarning: false,
    requiresFeeDisclosure: true,
    requiresFinalityWarning: true,
    disclosureKeys: ['approvalFinality', 'feeOnApproval', 'blockchainIrreversibility', 'autoRelease'],
  },

  open_dispute: {
    requiresTermsAcceptance: true,
    requiresRiskDisclosure: true,
    requiresAgentWarning: false,
    requiresFeeDisclosure: false,
    requiresFinalityWarning: false,
    disclosureKeys: ['disputeLimitations', 'disputeProcess'],
  },

  rate_agent: {
    requiresTermsAcceptance: true,
    requiresRiskDisclosure: false,
    requiresAgentWarning: false,
    requiresFeeDisclosure: false,
    requiresFinalityWarning: false,
    disclosureKeys: [],
  },
};

/** Get the requirements for a specific action */
export function getActionRequirements(action: ActionType): ActionRequirements {
  return ACTIONS[action];
}

/** Check if an action requires any form of consent */
export function requiresConsent(action: ActionType): boolean {
  const reqs = ACTIONS[action];
  return reqs.requiresTermsAcceptance || reqs.requiresRiskDisclosure;
}

/** Check if an action touches money (needs full disclosure stack) */
export function isMoneyTouching(action: ActionType): boolean {
  return ACTIONS[action].requiresFeeDisclosure;
}
