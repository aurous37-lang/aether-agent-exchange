/**
 * Modular, pure decision functions for Simulation V2 actors.
 * Every function is deterministic given the same RNG state.
 *
 * Policy overrides: set AAE_SIM_POLICY_OVERRIDES_PATH to a JSON file, or add
 * policy_overrides.json beside this module. Missing or invalid files fall back
 * to hardcoded defaults.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { SeededRng } from './seeded-rng';
import type {
  ClientProfile,
  HandlerProfile,
  AgentProfile,
  ArbiterProfile,
  ActorState,
  JobCategory,
  JOB_CATEGORIES,
} from './actors';

// ── Policy overrides ──────────────────────────────────────────────────────
const REPO_LOCAL_POLICY_OVERRIDES_PATH = resolve(__dirname, 'policy_overrides.json');

function loadPolicyOverrides(): Record<string, unknown> {
  const overridePath = process.env.AAE_SIM_POLICY_OVERRIDES_PATH?.trim()
    || (existsSync(REPO_LOCAL_POLICY_OVERRIDES_PATH) ? REPO_LOCAL_POLICY_OVERRIDES_PATH : undefined);

  if (!overridePath) return {};

  try {
    const parsed = JSON.parse(readFileSync(resolve(overridePath), 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

const _policyOverrides: Record<string, unknown> = loadPolicyOverrides();

// Current scenario — set by the engine at run start so P() can apply scenario overrides
let _currentScenario: string = 'baseline-market';

export function setCurrentScenario(name: string): void {
  _currentScenario = name;
}

/**
 * Read a policy value, checking scenario-specific overrides first,
 * then global overrides, then the hardcoded default.
 */
export function P<T>(key: string, defaultVal: T): T {
  // Check scenario-specific override first
  const allScenarioOverrides = _policyOverrides['SCENARIO_OVERRIDES'];
  const scenarioOverrides = allScenarioOverrides
    && typeof allScenarioOverrides === 'object'
    && !Array.isArray(allScenarioOverrides)
    ? (allScenarioOverrides as Record<string, Record<string, unknown>>)[_currentScenario]
    : undefined;
  if (
    scenarioOverrides
    && typeof scenarioOverrides === 'object'
    && !Array.isArray(scenarioOverrides)
    && key in scenarioOverrides
  ) {
    return scenarioOverrides[key] as T;
  }
  // Fall back to global override
  if (key in _policyOverrides) return _policyOverrides[key] as T;
  return defaultVal;
}

// Shared lightweight types for policy functions

export interface JobSpec {
  title: string;
  description: string;
  category: JobCategory;
  budgetAmount: number;
  budgetToken: 'USDC' | 'MON';
  deliverables: string[];
}

export interface JobView {
  id: string;
  category: JobCategory;
  budgetAmount: number;
  budgetToken: string;
  status: string;
  bidsCount: number;
  postedAtTick: number;
  clientId: string;
}

export interface BidView {
  id: string;
  agentId: string;
  handlerId: string;
  amount: number;
  message?: string;
  agentQuality: number;
  agentReliability: number;
}

export interface DeliverableView {
  hash: string;
  notes?: string;
  submittedAtTick: number;
  expectedCompletionTick: number;
  actualQuality: number;          // 0-1 computed by engine
}

export interface DisputeView {
  id: string;
  jobId: string;
  reason: string;
  agentId: string;
  handlerId: string;
  clientId: string;
  evidence: EvidenceView[];
  lateByTicks: number;            // 0 if on time
  qualityDelta: number;           // expected - actual, positive = shortfall
}

export interface EvidenceView {
  submittedBy: string;
  contentHash: string;
  description: string;
}

export interface SimState {
  tick: number;
  openJobs: JobView[];
  activeJobs: JobView[];
}

const JOB_TITLES: Record<string, string[]> = {
  CODE_DEVELOPMENT: ['Build REST API', 'Smart contract audit', 'Refactor module'],
  CONTENT_WRITING: ['Write blog post', 'Technical whitepaper', 'Newsletter draft'],
  DATA_ANALYSIS: ['Dashboard from CSV', 'Sentiment analysis', 'Anomaly detection'],
  DESIGN_CREATIVE: ['Landing page mockup', 'Logo redesign', 'Brand style guide'],
  RESEARCH: ['Competitor analysis', 'Literature review', 'Market sizing report'],
  BLOCKCHAIN_WEB3: ['ERC-20 token deploy', 'On-chain analytics', 'Wallet connector'],
  AUTOMATION: ['CI/CD pipeline setup', 'Scraping bot', 'Email automation'],
  TESTING_QA: ['E2E test suite', 'Pen-test report', 'Load testing harness'],
  MICRO_TASKS: ['Label 500 images', 'Transcribe audio clips', 'Data entry batch'],
};

const DELIVERABLES = ['Source code', 'Documentation', 'Test results', 'Report', 'Design files', 'Data export'];

// 1. shouldPostJob

export function shouldPostJob(
  client: ClientProfile,
  clientState: ActorState,
  state: SimState,
  rng: SeededRng,
): { post: boolean; job?: JobSpec } {
  if (clientState.activeJobIds.length >= client.maxActiveJobs) return { post: false };

  const loadFactor = 1 - clientState.activeJobIds.length / client.maxActiveJobs;
  const baseProbability = P('JOB_POST_BASE_PROBABILITY', 0.08);
  const repeatBonus = P('JOB_POST_REPEAT_BONUS', 0.02);
  const prob = baseProbability * client.repeatPostLikelihood * loadFactor + (clientState.completedJobs > 0 ? repeatBonus : 0);
  if (!rng.chance(prob)) return { post: false };

  const category = rng.pick(client.categoryPreferences);
  const title = rng.pick(JOB_TITLES[category] ?? ['General task']);
  const [lo, hi] = client.budgetRange;
  const budgetAmount = Math.round(rng.randomFloat(lo, hi));
  const deliverables = rng.shuffle(DELIVERABLES).slice(0, rng.randomInt(1, 3));

  return {
    post: true,
    job: {
      title: `${title} #${state.tick}`,
      description: `Auto-generated ${category.toLowerCase().replace(/_/g, ' ')} task at tick ${state.tick}.`,
      category,
      budgetAmount,
      budgetToken: rng.chance(0.7) ? 'USDC' : 'MON',
      deliverables,
    },
  };
}

// 2. shouldBid

export function shouldBid(
  agent: AgentProfile,
  handler: HandlerProfile,
  job: JobView,
  handlerState: ActorState,
  rng: SeededRng,
  agentState?: ActorState,
): { bid: boolean; amount?: number; message?: string } {
  if (handlerState.activeJobIds.length >= handler.workloadSheddingThreshold) return { bid: false };

  const skillFloor = P('SKILL_FLOOR_FOR_BIDDING', 0.20);
  const skillFloorRejRate = P('SKILL_FLOOR_REJECTION_RATE', 0.90);
  const compPenPerBid = P('COMPETITION_PENALTY_PER_BID', 0.10);
  const compPenCap = P('COMPETITION_PENALTY_CAP', 0.40);
  const newcomerBidBoost = P('NEWCOMER_BID_BOOST', 0.10);
  const newcomerThreshold = P('NEWCOMER_VISIBILITY_THRESHOLD', 3);

  const skill = agent.categorySkillMap[job.category] ?? 0.1;
  if (skill < skillFloor && !rng.chance(1 - skillFloorRejRate)) return { bid: false };

  const riskThreshold = handler.reputationProtection * 50;
  if (job.budgetAmount < riskThreshold && rng.chance(handler.reputationProtection)) return { bid: false };

  // Use agent's own completed jobs for equity/newcomer calculations
  const agentCompleted = agentState?.completedJobs ?? handlerState.completedJobs ?? 0;
  const specMatch = handler.specializationBias.includes(job.category as JobCategory) ? 0.2 : 0;
  const competitionPenalty = Math.min(job.bidsCount * compPenPerBid, compPenCap);
  // Newcomer boost for agents with few completed jobs
  const newcomerBoost = agentCompleted < newcomerThreshold ? newcomerBidBoost : 0;
  // Equity: penalize high-volume agents to spread work more evenly (reduces HHI)
  const equityPenalty = P('EQUITY_COMPLETED_JOBS_PENALTY', 0.0);
  const jobsPenalty = agentCompleted * equityPenalty;
  if (!rng.chance(Math.min(1, 0.4 + skill * 0.3 + specMatch - competitionPenalty + newcomerBoost - jobsPenalty))) return { bid: false };

  const amount = calculateBidPrice(agent, handler, job, rng);
  const messages = [
    `Agent ${agent.name} can deliver high-quality results.`,
    `Experienced in ${job.category.toLowerCase().replace(/_/g, ' ')}.`,
    `Ready to start immediately.`,
    `Competitive rate for proven reliability.`,
  ];

  return { bid: true, amount, message: rng.pick(messages) };
}

// 3. calculateBidPrice

export function calculateBidPrice(
  agent: AgentProfile,
  handler: HandlerProfile,
  job: JobView,
  rng: SeededRng,
): number {
  const aggressRange = P('BID_AGGRESSION_RANGE', [0.70, 1.10]) as [number, number];
  const qualityPremMax = P('BID_QUALITY_PREMIUM_MAX', 0.15);
  const priceNoiseRange = P('BID_PRICE_NOISE_RANGE', [0.92, 1.08]) as [number, number];

  const aggressFactor = aggressRange[0] + handler.bidAggressiveness * (aggressRange[1] - aggressRange[0]);
  const qualityPremium = 1 + agent.qualityScore * qualityPremMax;
  const noise = rng.randomFloat(priceNoiseRange[0], priceNoiseRange[1]);
  return Math.round(Math.max(1, job.budgetAmount * aggressFactor * qualityPremium * noise));
}

// 4. shouldAcceptBid
// NOTE: In AAE the HANDLER calls accept. Here the CLIENT selects from bids,
// then the handler whose bid is selected performs the accept call.

export function shouldAcceptBid(
  client: ClientProfile,
  job: JobView,
  bids: BidView[],
  clientState: ActorState,
  state: SimState,
  rng: SeededRng,
): { accept: boolean; bidId?: string } {
  if (bids.length === 0) return { accept: false };

  // Wait a bit for more bids early on (patience)
  const ticksSincePost = state.tick - job.postedAtTick;
  const minBidWait = P('MIN_BID_WAIT_TICKS', 5);
  const minBidsForEarly = P('MIN_BIDS_FOR_EARLY_ACCEPT', 3);
  const earlyAcceptWaitProb = P('EARLY_ACCEPT_WAIT_PROBABILITY', 0.60);
  const minWait = Math.min(minBidWait, client.patienceWindow * 0.1);
  if (ticksSincePost < minWait && bids.length < minBidsForEarly && rng.chance(earlyAcceptWaitProb)) {
    return { accept: false };
  }

  // If nearing patience window, accept the best available
  const urgency = Math.min(1, ticksSincePost / client.patienceWindow);

  // Probability to act this tick
  if (!rng.chance(0.3 + urgency * 0.5)) {
    return { accept: false };
  }

  // Score each bid using policy weights
  const wPrice = P('BID_WEIGHT_PRICE', 0.30);
  const wQuality = P('BID_WEIGHT_QUALITY', 0.30);
  const wReliability = P('BID_WEIGHT_RELIABILITY', 0.20);
  const wTrust = P('BID_WEIGHT_TRUST', 0.20);
  const bidNoise = P('BID_SCORE_NOISE', 0.05);
  const priceBudgetMul = P('PRICE_SCORE_BUDGET_MULTIPLIER', 1.30);
  const trustSuccessW = P('TRUST_SUCCESS_WEIGHT', 0.60);
  const trustInterW = P('TRUST_INTERACTION_WEIGHT', 0.40);
  const newAgentTrust = P('NEW_AGENT_INITIAL_TRUST', 0.50);

  const scored = bids.map(bid => {
    const trustRec = client.trustMemory.get(bid.agentId);
    const trustScore = trustRec
      ? (trustRec.avgSatisfaction * trustSuccessW + (trustRec.successes / (trustRec.successes + trustRec.disputes + 1)) * trustInterW)
      : newAgentTrust;

    const priceScore = 1 - (bid.amount / (job.budgetAmount * priceBudgetMul));
    const qualityScore = bid.agentQuality * client.qualitySensitivity;
    const reliabilityScore = bid.agentReliability * (1 - client.disputePropensity);

    const total = priceScore * wPrice + qualityScore * wQuality + reliabilityScore * wReliability + trustScore * wTrust;
    return { bid, score: total + rng.randomFloat(-bidNoise, bidNoise) };
  });

  scored.sort((a, b) => b.score - a.score);
  return { accept: true, bidId: scored[0].bid.id };
}

// 5. estimateDeliveryTime

export function estimateDeliveryTime(
  agent: AgentProfile,
  handler: HandlerProfile,
  job: JobView,
  handlerState: ActorState,
  rng: SeededRng,
): number {
  // Base time from category complexity (10-60 ticks)
  const categoryComplexity = P('CATEGORY_COMPLEXITY', {
    MICRO_TASKS: 10, CONTENT_WRITING: 20, DATA_ANALYSIS: 25,
    TESTING_QA: 25, AUTOMATION: 30, RESEARCH: 35,
    CODE_DEVELOPMENT: 40, DESIGN_CREATIVE: 35, BLOCKCHAIN_WEB3: 50,
  }) as Record<string, number>;
  const baseTime = categoryComplexity[job.category] ?? 30;

  // Speed factor: faster agent = less time
  const speedRange = P('DELIVERY_SPEED_FACTOR_RANGE', [0.60, 1.40]) as [number, number];
  const speedFactor = speedRange[1] - agent.speedScore * (speedRange[1] - speedRange[0]);

  // Workload penalty
  const loadPenPerJob = P('DELIVERY_LOAD_PENALTY_PER_JOB', 0.10);
  const loadPenalty = 1 + handlerState.activeJobIds.length * loadPenPerJob;

  // Reliability: unreliable agents are less predictable
  const relNoise = P('DELIVERY_RELIABILITY_NOISE', 0.40);
  const reliabilityNoise = rng.randomFloat(
    1 - (1 - agent.reliabilityScore) * relNoise * 0.75,
    1 + (1 - agent.reliabilityScore) * relNoise * 1.25,
  );

  const minTicks = P('DELIVERY_MIN_TICKS', 3);
  const ticks = Math.round(baseTime * speedFactor * loadPenalty * reliabilityNoise);
  return Math.max(minTicks, ticks);
}

// 6. shouldApproveOrDispute

export function shouldApproveOrDispute(
  client: ClientProfile,
  job: JobView,
  deliverable: DeliverableView,
  state: SimState,
  rng: SeededRng,
): 'approve' | 'dispute' | 'wait' {
  // How late was the delivery?
  const lateness = Math.max(0, deliverable.submittedAtTick - deliverable.expectedCompletionTick);
  const latenessFactor = Math.min(1, lateness / 50); // normalized

  // Quality gap: 0 = met expectations, positive = fell short
  const qualityGap = Math.max(0, client.qualitySensitivity - deliverable.actualQuality);

  // Compound dissatisfaction using policy weights
  const dissatQualW = P('DISSATISFACTION_WEIGHT_QUALITY', 0.60);
  const dissatLateW = P('DISSATISFACTION_WEIGHT_LATENESS', 0.30);
  const dissatNoise = P('DISSATISFACTION_NOISE', 0.10);

  const dissatisfaction =
    qualityGap * dissatQualW +
    latenessFactor * client.speedSensitivity * dissatLateW +
    rng.randomFloat(0, dissatNoise);

  // Dispute threshold modulated by client's dispute propensity
  const baseThreshold = P('DISPUTE_BASE_THRESHOLD', 0.50);
  const propensityFactor = P('DISPUTE_PROPENSITY_FACTOR', 0.25);
  const disputeThreshold = baseThreshold - client.disputePropensity * propensityFactor;

  const disputeProb = P('DISPUTE_PROBABILITY', 0.70);
  const approveProb = P('APPROVE_PROBABILITY', 0.85);

  if (dissatisfaction > disputeThreshold) {
    // May still just wait a tick before filing
    if (rng.chance(1 - disputeProb)) return 'wait';
    return 'dispute';
  }

  // Even happy clients sometimes wait a tick (review delay)
  if (rng.chance(1 - approveProb)) return 'wait';

  return 'approve';
}

// 7. arbiterVote

export function arbiterVote(
  arbiter: ArbiterProfile,
  dispute: DisputeView,
  rng: SeededRng,
): { agentBps: number; reasoning: string } {
  // Evidence completeness: more evidence from agent side helps
  const agentEvidence = dispute.evidence.filter(e => e.submittedBy === dispute.agentId || e.submittedBy === dispute.handlerId).length;
  const clientEvidence = dispute.evidence.filter(e => e.submittedBy === dispute.clientId).length;
  const evidenceBalance = (agentEvidence + 1) / (agentEvidence + clientEvidence + 2); // Laplace smoothed

  // Lateness hurts the agent
  const latePenalty = Math.min(0.3, dispute.lateByTicks / 100);

  // Quality shortfall hurts the agent
  const qualityPenalty = Math.min(0.3, dispute.qualityDelta * 0.5);

  // Policy-driven arbiter weights
  const arbEvidenceW = P('ARBITER_EVIDENCE_WEIGHT', 0.50);
  const arbLateW = P('ARBITER_LATENESS_PENALTY_WEIGHT', 0.25);
  const arbQualW = P('ARBITER_QUALITY_PENALTY_WEIGHT', 0.25);
  const arbStrictFactor = P('ARBITER_STRICTNESS_FACTOR', 0.30);
  const arbConsistNoise = P('ARBITER_CONSISTENCY_NOISE', 0.15);

  // Agent's base share before strictness adjustment
  const baseAgentShare =
    evidenceBalance * arbiter.evidenceWeighting * arbEvidenceW +
    (1 - latePenalty) * arbLateW +
    (1 - qualityPenalty) * arbQualW;

  // Strictness makes the arbiter less forgiving to the agent
  const adjustedShare = baseAgentShare * (1 - arbiter.strictness * arbStrictFactor);

  // Consistency: add less noise for higher consistency
  const noiseRange = (1 - arbiter.consistencyScore) * arbConsistNoise;
  const noise = rng.randomFloat(-noiseRange, noiseRange);

  const finalShare = Math.max(0, Math.min(1, adjustedShare + noise));
  const agentBps = Math.round(finalShare * 10000);

  // Generate reasoning
  const reasons: string[] = [];
  if (dispute.lateByTicks > 0) reasons.push(`delivery was ${dispute.lateByTicks} ticks late`);
  if (dispute.qualityDelta > 0.2) reasons.push('significant quality shortfall noted');
  if (agentEvidence > clientEvidence) reasons.push('agent provided stronger evidence');
  if (clientEvidence > agentEvidence) reasons.push('client provided stronger evidence');
  if (reasons.length === 0) reasons.push('balanced assessment of both parties');

  const reasoning = `Arbiter ${arbiter.name}: ${reasons.join('; ')}. Agent receives ${(finalShare * 100).toFixed(1)}%.`;

  return { agentBps, reasoning };
}

// 8. ratingDecision

export function ratingDecision(
  client: ClientProfile,
  job: JobView,
  outcome: { approved: boolean; lateness: number; actualQuality: number },
  rng: SeededRng,
): { score: number; comment: string } {
  if (!outcome.approved) {
    // Disputed and resolved — generally low rating (policy-tunable)
    const disputeMin = P('RATING_DISPUTE_MIN', 1);
    const disputeMax = P('RATING_DISPUTE_MAX', 2);
    const score = rng.randomInt(disputeMin, disputeMax);
    return { score, comment: 'Job resulted in a dispute. Unsatisfactory outcome.' };
  }

  // Base score from quality (policy-tunable multiplier + offset)
  const qualityMul = P('RATING_QUALITY_MULTIPLIER', 5.0);
  const baseOffset = P('RATING_BASE_OFFSET', 0.0);
  let rawScore = outcome.actualQuality * qualityMul + baseOffset;

  // Lateness penalty (policy-tunable sensitivity)
  const latenessFactor = P('RATING_LATENESS_FACTOR', 1.0);
  const latePenalty = Math.min(1.5, outcome.lateness / 40) * client.speedSensitivity * latenessFactor;
  rawScore -= latePenalty;

  // Trust bonus: prior good experiences nudge the rating up
  // (not passed explicitly here — use a small random bonus as proxy)
  rawScore += rng.randomFloat(-0.3, 0.3);

  const score = Math.max(1, Math.min(5, Math.round(rawScore)));

  const comments: Record<number, string> = {
    1: 'Did not meet requirements.', 2: 'Below expectations.',
    3: 'Adequate, met minimum criteria.', 4: 'Good work, minor issues.',
    5: 'Excellent, exceeded expectations.',
  };
  const comment = comments[score] ?? 'No comment.';
  return { score, comment };
}
