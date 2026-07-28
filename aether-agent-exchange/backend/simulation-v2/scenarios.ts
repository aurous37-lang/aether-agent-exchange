/**
 * Scenario presets for Simulation V2.
 * Each preset configures actor counts, market dynamics, and success criteria
 * to stress-test different aspects of the AAE platform.
 */

import type { ScenarioConfig, JobCategory } from './actors';
import type { TickPreset } from './config';

// ---------------------------------------------------------------------------
// ScenarioPreset — extends ScenarioConfig with metadata & tuning knobs
// ---------------------------------------------------------------------------

export interface SuccessCriteriaRanges {
  completionRate: [number, number];       // expected min-max completion %
  avgDisputeRate: [number, number];       // expected min-max dispute %
  avgRating: [number, number];            // expected min-max average rating
}

export interface ScenarioPreset extends ScenarioConfig {
  description: string;
  tickPreset: TickPreset;
  demandMultiplier: number;               // scales job post frequency
  disputeMultiplier: number;              // scales dispute propensity
  authPressure: number;                   // 0-1, simulates concurrent auth load
  latencyModifier: number;               // multiplier on simulated response times
  successCriteriaRanges: SuccessCriteriaRanges;
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const even = (): Partial<Record<JobCategory, number>> => ({
  CODE_DEVELOPMENT: 0.4, CONTENT_WRITING: 0.4, DATA_ANALYSIS: 0.4,
  DESIGN_CREATIVE: 0.4, RESEARCH: 0.4, BLOCKCHAIN_WEB3: 0.4,
  AUTOMATION: 0.4, TESTING_QA: 0.4, MICRO_TASKS: 0.4,
});

const baselineMarket: ScenarioPreset = {
  name: 'baseline-market',
  description: 'Balanced defaults. Even category distribution, normal dispute rates. Good for regression testing.',
  tickPreset: 'standard',
  clientCount: 5,
  handlerCount: 3,
  arbiterCount: 2,
  agentsPerHandler: [1, 3],
  jobPostFrequency: 3,
  budgetRange: [20, 500],
  categoryWeights: even(),
  demandMultiplier: 1.0,
  disputeMultiplier: 1.0,
  authPressure: 0.2,
  latencyModifier: 1.0,
  successCriteriaRanges: {
    completionRate: [0.6, 0.9],
    avgDisputeRate: [0.02, 0.15],
    avgRating: [3.5, 4.8],
  },
};

const hotCategorySurge: ScenarioPreset = {
  name: 'hot-category-surge',
  description: 'CODE_DEVELOPMENT gets 70% weight. High demand multiplier. Tests competition pressure on a single category.',
  tickPreset: 'standard',
  clientCount: 8,
  handlerCount: 4,
  arbiterCount: 2,
  agentsPerHandler: [2, 4],
  jobPostFrequency: 6,
  budgetRange: [30, 600],
  categoryWeights: {
    CODE_DEVELOPMENT: 0.7, CONTENT_WRITING: 0.05, DATA_ANALYSIS: 0.05,
    DESIGN_CREATIVE: 0.03, RESEARCH: 0.05, BLOCKCHAIN_WEB3: 0.05,
    AUTOMATION: 0.03, TESTING_QA: 0.02, MICRO_TASKS: 0.02,
  },
  demandMultiplier: 2.0,
  disputeMultiplier: 1.0,
  authPressure: 0.3,
  latencyModifier: 1.0,
  successCriteriaRanges: {
    completionRate: [0.5, 0.85],
    avgDisputeRate: [0.03, 0.2],
    avgRating: [3.2, 4.6],
  },
};

const lowLiquidityMarket: ScenarioPreset = {
  name: 'low-liquidity-market',
  description: 'Minimal supply: 1 handler with 1 agent. Low demand. Tests stale job behavior and empty-market edge cases.',
  tickPreset: 'long',
  clientCount: 3,
  handlerCount: 1,
  arbiterCount: 1,
  agentsPerHandler: [1, 1],
  jobPostFrequency: 1,
  budgetRange: [10, 200],
  categoryWeights: even(),
  demandMultiplier: 0.3,
  disputeMultiplier: 1.0,
  authPressure: 0.05,
  latencyModifier: 1.2,
  successCriteriaRanges: {
    completionRate: [0.2, 0.6],
    avgDisputeRate: [0.0, 0.1],
    avgRating: [3.0, 5.0],
  },
};

const reputationDrivenMarket: ScenarioPreset = {
  name: 'reputation-driven-market',
  description: 'Wide agent quality range (0.2-1.0). Clients have high quality sensitivity. Tests whether high-rep agents win over time.',
  tickPreset: 'long',
  clientCount: 8,
  handlerCount: 5,
  arbiterCount: 2,
  agentsPerHandler: [2, 4],
  jobPostFrequency: 5,
  budgetRange: [30, 500],
  categoryWeights: even(),
  demandMultiplier: 1.2,
  disputeMultiplier: 1.0,
  authPressure: 0.2,
  latencyModifier: 1.0,
  successCriteriaRanges: {
    completionRate: [0.5, 0.9],
    avgDisputeRate: [0.05, 0.25],
    avgRating: [3.0, 4.9],
  },
};

const delayFailureMarket: ScenarioPreset = {
  name: 'delay-failure-market',
  description: 'Agents have high failure probability (0.3-0.5) and slow delivery. High dispute multiplier. Tests dispute and resolution paths.',
  tickPreset: 'standard',
  clientCount: 5,
  handlerCount: 3,
  arbiterCount: 3,
  agentsPerHandler: [1, 3],
  jobPostFrequency: 3,
  budgetRange: [20, 400],
  categoryWeights: even(),
  demandMultiplier: 1.0,
  disputeMultiplier: 3.0,
  authPressure: 0.2,
  latencyModifier: 2.0,
  successCriteriaRanges: {
    completionRate: [0.2, 0.5],
    avgDisputeRate: [0.3, 0.7],
    avgRating: [1.5, 3.5],
  },
};

const adversarialMarket: ScenarioPreset = {
  name: 'adversarial-market',
  description: 'Agents with self-deal probability 0.3, disputatious clients (propensity 0.7), high auth pressure. Tests security guards.',
  tickPreset: 'standard',
  clientCount: 6,
  handlerCount: 4,
  arbiterCount: 3,
  agentsPerHandler: [1, 3],
  jobPostFrequency: 4,
  budgetRange: [50, 500],
  categoryWeights: even(),
  demandMultiplier: 1.5,
  disputeMultiplier: 2.5,
  authPressure: 0.8,
  latencyModifier: 1.5,
  successCriteriaRanges: {
    completionRate: [0.3, 0.6],
    avgDisputeRate: [0.3, 0.7],
    avgRating: [2.0, 3.5],
  },
};

const burstyAgentTraffic: ScenarioPreset = {
  name: 'bursty-agent-traffic',
  description: '10 handlers with 3-5 agents each (30-50 agents). Short tick cycle, high auth pressure. Tests rate limiting under concurrency.',
  tickPreset: 'short',
  clientCount: 6,
  handlerCount: 10,
  arbiterCount: 2,
  agentsPerHandler: [3, 5],
  jobPostFrequency: 8,
  budgetRange: [15, 300],
  categoryWeights: even(),
  demandMultiplier: 1.5,
  disputeMultiplier: 1.0,
  authPressure: 0.9,
  latencyModifier: 0.5,
  successCriteriaRanges: {
    completionRate: [0.4, 0.8],
    avgDisputeRate: [0.02, 0.15],
    avgRating: [3.0, 4.5],
  },
};

const premiumMarketplace: ScenarioPreset = {
  name: 'premium-marketplace',
  description: 'High budgets ($200-$2000), low dispute rates, all agents quality > 0.7. Tests high-value transaction flows.',
  tickPreset: 'standard',
  clientCount: 4,
  handlerCount: 3,
  arbiterCount: 1,
  agentsPerHandler: [1, 2],
  jobPostFrequency: 2,
  budgetRange: [200, 2000],
  categoryWeights: {
    CODE_DEVELOPMENT: 0.35, DATA_ANALYSIS: 0.25, BLOCKCHAIN_WEB3: 0.2,
    RESEARCH: 0.1, AUTOMATION: 0.1,
  },
  demandMultiplier: 0.8,
  disputeMultiplier: 0.3,
  authPressure: 0.15,
  latencyModifier: 1.0,
  successCriteriaRanges: {
    completionRate: [0.8, 0.98],
    avgDisputeRate: [0.0, 0.05],
    avgRating: [4.0, 5.0],
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SCENARIOS: ReadonlyMap<string, ScenarioPreset> = new Map<string, ScenarioPreset>([
  [baselineMarket.name, baselineMarket],
  [hotCategorySurge.name, hotCategorySurge],
  [lowLiquidityMarket.name, lowLiquidityMarket],
  [reputationDrivenMarket.name, reputationDrivenMarket],
  [delayFailureMarket.name, delayFailureMarket],
  [adversarialMarket.name, adversarialMarket],
  [burstyAgentTraffic.name, burstyAgentTraffic],
  [premiumMarketplace.name, premiumMarketplace],
]);

/**
 * Look up a scenario preset by name.
 * Throws if the name is not recognized.
 */
export function getScenario(name: string): ScenarioPreset {
  const preset = SCENARIOS.get(name);
  if (!preset) {
    const known = [...SCENARIOS.keys()].join(', ');
    throw new Error(`Unknown scenario "${name}". Available: ${known}`);
  }
  return preset;
}
