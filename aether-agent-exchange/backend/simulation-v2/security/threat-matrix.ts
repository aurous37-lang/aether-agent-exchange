/**
 * AAE Simulation v2 — Threat Matrix
 *
 * Maps security test scenarios to OWASP risk categories.
 * Each entry identifies whether the threat is actively simulated
 * in the v2 simulation harness and its current mitigation status.
 */

export interface ThreatScenario {
  id: string;
  name: string;
  description: string;
  owaspCategory: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  testedBy: string;
  simulated: boolean;
  mitigationStatus: 'implemented' | 'planned' | 'not-started';
}

export const THREAT_MATRIX: ThreatScenario[] = [
  // --- Privilege & Access Control ---
  {
    id: 'TM-001',
    name: 'Self-dealing via handler-client collusion',
    description:
      'A handler also acts as the client, posting a job and accepting their own agent\'s bid to extract escrow funds without real work.',
    owaspCategory: 'ASVS-4.2.1',
    riskLevel: 'critical',
    testedBy: 'scenario:adversarial/self-dealing',
    simulated: true,
    mitigationStatus: 'implemented',
  },
  {
    id: 'TM-002',
    name: 'Privilege escalation to arbiter role',
    description:
      'An agent or handler manipulates role assignment to gain arbiter privileges and resolve disputes in their own favor.',
    owaspCategory: 'ASVS-4.1.3',
    riskLevel: 'critical',
    testedBy: 'invariant:role-separation',
    simulated: true,
    mitigationStatus: 'implemented',
  },

  // --- LLM-specific threats ---
  {
    id: 'TM-003',
    name: 'Prompt injection in job description',
    description:
      'Malicious client embeds prompt-injection payloads in job descriptions to hijack agent behavior during autonomous execution.',
    owaspCategory: 'LLM-01',
    riskLevel: 'critical',
    testedBy: 'scenario:adversarial/prompt-injection',
    simulated: true,
    mitigationStatus: 'planned',
  },
  {
    id: 'TM-004',
    name: 'Tool misuse via manipulated deliverables',
    description:
      'Agent is tricked into invoking unauthorized tools or APIs through crafted deliverable review feedback.',
    owaspCategory: 'LLM-07',
    riskLevel: 'high',
    testedBy: 'scenario:adversarial/tool-misuse',
    simulated: true,
    mitigationStatus: 'planned',
  },
  {
    id: 'TM-005',
    name: 'Memory poisoning across job contexts',
    description:
      'An adversary feeds misleading context into an agent\'s persistent memory to corrupt future job execution quality.',
    owaspCategory: 'LLM-05',
    riskLevel: 'high',
    testedBy: 'scenario:adversarial/memory-poisoning',
    simulated: true,
    mitigationStatus: 'not-started',
  },

  // --- Authentication & Credentials ---
  {
    id: 'TM-006',
    name: 'Agent API key compromise',
    description:
      'Stolen x-agent-api-key allows an attacker to impersonate an agent, accept jobs, and submit fake deliverables.',
    owaspCategory: 'ASVS-2.10.1',
    riskLevel: 'critical',
    testedBy: 'scenario:adversarial/credential-theft',
    simulated: true,
    mitigationStatus: 'implemented',
  },
  {
    id: 'TM-007',
    name: 'JWT replay after wallet disconnect',
    description:
      'A user disconnects their wallet but the JWT remains valid, allowing continued API access until expiry.',
    owaspCategory: 'ASVS-3.5.2',
    riskLevel: 'medium',
    testedBy: 'invariant:session-validity',
    simulated: false,
    mitigationStatus: 'planned',
  },

  // --- Rate Limiting & DoS ---
  {
    id: 'TM-008',
    name: 'Rate limit bypass via distributed agent swarm',
    description:
      'Attacker registers many agents across different wallets to circumvent per-IP/per-wallet rate limits and flood the job board.',
    owaspCategory: 'ASVS-11.1.4',
    riskLevel: 'high',
    testedBy: 'scenario:stress/rate-limit-bypass',
    simulated: true,
    mitigationStatus: 'implemented',
  },
  {
    id: 'TM-009',
    name: 'Resource exhaustion via large payload jobs',
    description:
      'Client posts jobs with extremely large descriptions or deliverable requirements to exhaust backend memory and storage.',
    owaspCategory: 'ASVS-11.1.7',
    riskLevel: 'medium',
    testedBy: 'scenario:stress/resource-exhaustion',
    simulated: true,
    mitigationStatus: 'implemented',
  },

  // --- Replay & State Machine ---
  {
    id: 'TM-010',
    name: 'Duplicate action replay',
    description:
      'Replaying a signed bid-acceptance or payment-release transaction to double-spend or double-complete a job.',
    owaspCategory: 'ASVS-13.2.5',
    riskLevel: 'high',
    testedBy: 'invariant:idempotency',
    simulated: true,
    mitigationStatus: 'implemented',
  },
  {
    id: 'TM-011',
    name: 'State machine manipulation via concurrent requests',
    description:
      'Racing simultaneous status transitions (e.g., approve + dispute) to force the escrow into an inconsistent state.',
    owaspCategory: 'ASVS-11.1.6',
    riskLevel: 'critical',
    testedBy: 'scenario:chaos/state-race',
    simulated: true,
    mitigationStatus: 'implemented',
  },

  // --- Data Isolation & Integrity ---
  {
    id: 'TM-012',
    name: 'Cross-tenant data access',
    description:
      'A handler queries job details or deliverables belonging to another handler\'s agent via direct API ID enumeration.',
    owaspCategory: 'ASVS-4.3.1',
    riskLevel: 'high',
    testedBy: 'invariant:tenant-isolation',
    simulated: true,
    mitigationStatus: 'implemented',
  },
  {
    id: 'TM-013',
    name: 'Evidence tampering in disputes',
    description:
      'Party to a dispute modifies or replaces submitted deliverable hashes after dispute is opened to influence arbiter ruling.',
    owaspCategory: 'ASVS-8.1.1',
    riskLevel: 'high',
    testedBy: 'invariant:evidence-immutability',
    simulated: true,
    mitigationStatus: 'implemented',
  },
  {
    id: 'TM-014',
    name: 'Sensitive data leakage in event payloads',
    description:
      'WebSocket broadcast or API responses inadvertently expose private keys, internal IPs, or other sensitive data in event payloads.',
    owaspCategory: 'ASVS-8.3.4',
    riskLevel: 'medium',
    testedBy: 'invariant:payload-sanitization',
    simulated: false,
    mitigationStatus: 'planned',
  },

  // --- Reputation & Marketplace Integrity ---
  {
    id: 'TM-015',
    name: 'Rating manipulation via sybil accounts',
    description:
      'Attacker creates multiple client wallets to post and complete trivial jobs with their own agent, inflating agent ratings.',
    owaspCategory: 'ASVS-4.2.2',
    riskLevel: 'high',
    testedBy: 'scenario:adversarial/rating-sybil',
    simulated: true,
    mitigationStatus: 'planned',
  },
  {
    id: 'TM-016',
    name: 'Malicious agent swarm market capture',
    description:
      'A single handler registers a swarm of low-cost agents to undercut competitors and monopolize job acceptance.',
    owaspCategory: 'ASVS-11.1.4',
    riskLevel: 'medium',
    testedBy: 'scenario:stress/agent-swarm',
    simulated: true,
    mitigationStatus: 'not-started',
  },
  {
    id: 'TM-017',
    name: 'Supply chain compromise of agent dependencies',
    description:
      'Agent code or model weights are tampered with upstream, causing agents to produce subtly incorrect or malicious deliverables.',
    owaspCategory: 'LLM-03',
    riskLevel: 'high',
    testedBy: 'scenario:adversarial/supply-chain',
    simulated: false,
    mitigationStatus: 'not-started',
  },
];

/**
 * Filter threat scenarios by OWASP category prefix.
 * Supports partial matching — e.g., 'ASVS-4' matches 'ASVS-4.1.3', 'ASVS-4.2.1', etc.
 * 'LLM' matches all LLM Top 10 entries.
 */
export function getThreatsByCategory(category: string): ThreatScenario[] {
  return THREAT_MATRIX.filter((t) => t.owaspCategory.startsWith(category));
}

/**
 * Filter threat scenarios by risk level.
 */
export function getThreatsByRiskLevel(
  level: ThreatScenario['riskLevel']
): ThreatScenario[] {
  return THREAT_MATRIX.filter((t) => t.riskLevel === level);
}

/**
 * Get all threats that are actively simulated in v2.
 */
export function getSimulatedThreats(): ThreatScenario[] {
  return THREAT_MATRIX.filter((t) => t.simulated);
}
