/**
 * Actor model for Simulation V2.
 * Defines profiles for clients, handlers, agents, and arbiters,
 * plus an ActorRegistry that generates and tracks actor state.
 */

import type { SeededRng } from './seeded-rng';

// ---------------------------------------------------------------------------
// Job categories (mirrors backend validation.ts)
// ---------------------------------------------------------------------------

export const JOB_CATEGORIES = [
  'CODE_DEVELOPMENT', 'CONTENT_WRITING', 'DATA_ANALYSIS',
  'DESIGN_CREATIVE', 'RESEARCH', 'BLOCKCHAIN_WEB3',
  'AUTOMATION', 'TESTING_QA', 'MICRO_TASKS',
] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Scenario config (lightweight — lives here until a dedicated file exists)
// ---------------------------------------------------------------------------

export interface ScenarioConfig {
  name: string;
  clientCount: number;
  handlerCount: number;
  agentsPerHandler: [number, number]; // [min, max]
  arbiterCount: number;
  jobPostFrequency: number;          // avg posts per tick across all clients
  budgetRange: [number, number];
  categoryWeights: Partial<Record<JobCategory, number>>;
}

// ---------------------------------------------------------------------------
// Trust memory
// ---------------------------------------------------------------------------

export interface TrustRecord {
  successes: number;
  disputes: number;
  avgSatisfaction: number;
}

// ---------------------------------------------------------------------------
// Actor profiles
// ---------------------------------------------------------------------------

export interface ClientProfile {
  id: string;
  name: string;
  walletAddress: string;
  budgetRange: [number, number];
  qualitySensitivity: number;        // 0-1
  speedSensitivity: number;          // 0-1
  disputePropensity: number;         // 0-1
  categoryPreferences: JobCategory[];
  trustMemory: Map<string, TrustRecord>;
  repeatPostLikelihood: number;      // 0-1
  patienceWindow: number;            // ticks before job feels stale
  maxActiveJobs: number;
}

export interface HandlerProfile {
  id: string;
  name: string;
  walletAddress: string;
  maxConcurrentJobs: number;
  bidAggressiveness: number;         // 0 = undercut, 1 = premium
  reputationProtection: number;      // 0-1, tendency to avoid risky jobs
  disputeResponseTendency: number;   // 0-1
  specializationBias: JobCategory[];
  workloadSheddingThreshold: number; // stop bidding above this many active jobs
  agents: AgentProfile[];
}

export interface AgentProfile {
  id: string;
  name: string;
  agentDbId: string | null;          // assigned after registration
  qualityScore: number;              // 0-1
  speedScore: number;                // 0-1
  reliabilityScore: number;          // 0-1
  categorySkillMap: Partial<Record<JobCategory, number>>; // 0-1 per category
  failureProbability: number;        // 0-1
  revisionProbability: number;       // 0-1
  selfDealAttemptProbability: number; // 0-1
}

export interface ArbiterProfile {
  id: string;
  name: string;
  walletAddress: string;
  strictness: number;                // 0-1
  evidenceWeighting: number;         // 0-1
  responseDelay: number;             // ticks
  consistencyScore: number;          // 0-1
}

// ---------------------------------------------------------------------------
// Per-actor runtime state
// ---------------------------------------------------------------------------

export interface ActorState {
  activeJobIds: string[];
  totalEarned: number;
  totalSpent: number;
  completedJobs: number;
  failedJobs: number;
  isAuthenticated: boolean;
  authToken: string | null;
  dbUserId: string | null;
  lastActionTick: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomWallet(rng: SeededRng): string {
  let hex = '0x';
  for (let i = 0; i < 40; i++) {
    hex += rng.randomInt(0, 15).toString(16);
  }
  return hex;
}

function pickN<T>(rng: SeededRng, arr: readonly T[], min: number, max: number): T[] {
  const count = rng.randomInt(min, Math.min(max, arr.length));
  return rng.shuffle(arr).slice(0, count);
}

function weightedCategories(rng: SeededRng, weights: Partial<Record<JobCategory, number>>): JobCategory[] {
  const cats: JobCategory[] = [];
  for (const cat of JOB_CATEGORIES) {
    const w = weights[cat] ?? 0.3;
    if (rng.chance(w)) cats.push(cat);
  }
  return cats.length > 0 ? cats : [rng.pick(JOB_CATEGORIES)];
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createClient(rng: SeededRng, index: number, scenario: ScenarioConfig): ClientProfile {
  const prefs = weightedCategories(rng, scenario.categoryWeights);
  const [lo, hi] = scenario.budgetRange;
  const budgetLo = rng.randomFloat(lo, lo + (hi - lo) * 0.4);
  const budgetHi = rng.randomFloat(budgetLo * 1.2, hi);

  return {
    id: `client-${index}`,
    name: `Client_${index}`,
    walletAddress: randomWallet(rng),
    budgetRange: [Math.round(budgetLo), Math.round(budgetHi)],
    qualitySensitivity: rng.randomFloat(0.3, 1),
    speedSensitivity: rng.randomFloat(0.1, 0.9),
    disputePropensity: rng.randomFloat(0.02, 0.35),
    categoryPreferences: prefs,
    trustMemory: new Map(),
    repeatPostLikelihood: rng.randomFloat(0.3, 0.9),
    patienceWindow: rng.randomInt(30, 200),
    maxActiveJobs: rng.randomInt(1, 5),
  };
}

export function createAgent(rng: SeededRng, handlerIndex: number, agentIndex: number, scenario: ScenarioConfig): AgentProfile {
  const skillMap: Partial<Record<JobCategory, number>> = {};
  const specialties = pickN(rng, JOB_CATEGORIES, 2, 5);
  for (const cat of JOB_CATEGORIES) {
    skillMap[cat] = specialties.includes(cat)
      ? rng.randomFloat(0.6, 1)
      : rng.randomFloat(0.05, 0.4);
  }

  return {
    id: `agent-${handlerIndex}-${agentIndex}`,
    name: `Agent_${handlerIndex}_${agentIndex}`,
    agentDbId: null,
    qualityScore: rng.randomFloat(0.3, 1),
    speedScore: rng.randomFloat(0.3, 1),
    reliabilityScore: rng.randomFloat(0.5, 1),
    categorySkillMap: skillMap,
    failureProbability: rng.randomFloat(0, 0.15),
    revisionProbability: rng.randomFloat(0.05, 0.3),
    selfDealAttemptProbability: rng.randomFloat(0, 0.05),
  };
}

export function createHandler(rng: SeededRng, index: number, scenario: ScenarioConfig): HandlerProfile {
  const [minAgents, maxAgents] = scenario.agentsPerHandler;
  const agentCount = rng.randomInt(minAgents, maxAgents);
  const agents: AgentProfile[] = [];
  for (let a = 0; a < agentCount; a++) {
    agents.push(createAgent(rng, index, a, scenario));
  }

  return {
    id: `handler-${index}`,
    name: `Handler_${index}`,
    walletAddress: randomWallet(rng),
    maxConcurrentJobs: rng.randomInt(2, 8),
    bidAggressiveness: rng.randomFloat(0.2, 0.9),
    reputationProtection: rng.randomFloat(0.3, 0.9),
    disputeResponseTendency: rng.randomFloat(0.4, 1),
    specializationBias: weightedCategories(rng, scenario.categoryWeights),
    workloadSheddingThreshold: rng.randomInt(3, 10),
    agents,
  };
}

export function createArbiter(rng: SeededRng, index: number): ArbiterProfile {
  return {
    id: `arbiter-${index}`,
    name: `Arbiter_${index}`,
    walletAddress: randomWallet(rng),
    strictness: rng.randomFloat(0.3, 0.9),
    evidenceWeighting: rng.randomFloat(0.4, 1),
    responseDelay: rng.randomInt(1, 10),
    consistencyScore: rng.randomFloat(0.6, 1),
  };
}

// ---------------------------------------------------------------------------
// ActorRegistry
// ---------------------------------------------------------------------------

export class ActorRegistry {
  clients: ClientProfile[] = [];
  handlers: HandlerProfile[] = [];
  arbiters: ArbiterProfile[] = [];

  private state = new Map<string, ActorState>();

  /** Generate all actors from scenario parameters. */
  generateActors(rng: SeededRng, config: ScenarioConfig): void {
    this.clients = [];
    this.handlers = [];
    this.arbiters = [];
    this.state.clear();

    for (let i = 0; i < config.clientCount; i++) {
      const c = createClient(rng, i, config);
      this.clients.push(c);
      this.state.set(c.id, newActorState());
    }

    for (let i = 0; i < config.handlerCount; i++) {
      const h = createHandler(rng, i, config);
      this.handlers.push(h);
      this.state.set(h.id, newActorState());
      for (const a of h.agents) {
        this.state.set(a.id, newActorState());
      }
    }

    for (let i = 0; i < config.arbiterCount; i++) {
      const a = createArbiter(rng, i);
      this.arbiters.push(a);
      this.state.set(a.id, newActorState());
    }
  }

  /** All agents across all handlers. */
  get allAgents(): AgentProfile[] {
    return this.handlers.flatMap(h => h.agents);
  }

  getState(actorId: string): ActorState {
    const s = this.state.get(actorId);
    if (!s) throw new Error(`No state for actor ${actorId}`);
    return s;
  }

  /** Agents not at capacity and whose handler is below shedding threshold. */
  getAvailableAgents(): { agent: AgentProfile; handler: HandlerProfile }[] {
    const results: { agent: AgentProfile; handler: HandlerProfile }[] = [];
    for (const h of this.handlers) {
      const hState = this.getState(h.id);
      if (hState.activeJobIds.length >= h.workloadSheddingThreshold) continue;
      for (const a of h.agents) {
        const aState = this.getState(a.id);
        if (aState.activeJobIds.length < h.maxConcurrentJobs) {
          results.push({ agent: a, handler: h });
        }
      }
    }
    return results;
  }

  /** Clients who haven't hit their active-job cap and whose post cooldown has elapsed. */
  getClientsReadyToPost(tick: number): ClientProfile[] {
    return this.clients.filter(c => {
      const s = this.getState(c.id);
      return s.activeJobIds.length < c.maxActiveJobs && s.lastActionTick < tick;
    });
  }

  /** Update a client's trust memory for a given agent after job outcome. */
  updateTrustMemory(
    clientId: string,
    agentId: string,
    outcome: { success: boolean; satisfaction: number },
  ): void {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;

    const existing = client.trustMemory.get(agentId) ?? { successes: 0, disputes: 0, avgSatisfaction: 0 };
    const total = existing.successes + existing.disputes;

    if (outcome.success) {
      existing.successes++;
    } else {
      existing.disputes++;
    }
    existing.avgSatisfaction = (existing.avgSatisfaction * total + outcome.satisfaction) / (total + 1);
    client.trustMemory.set(agentId, existing);
  }

  /** Mark a job as active for an actor. */
  assignJob(actorId: string, jobId: string): void {
    const s = this.getState(actorId);
    if (!s.activeJobIds.includes(jobId)) s.activeJobIds.push(jobId);
  }

  /** Remove a job from an actor's active list. */
  releaseJob(actorId: string, jobId: string): void {
    const s = this.getState(actorId);
    s.activeJobIds = s.activeJobIds.filter(j => j !== jobId);
  }

  /** Record auth credentials after wallet-based login. */
  setAuth(actorId: string, token: string, dbUserId: string): void {
    const s = this.getState(actorId);
    s.isAuthenticated = true;
    s.authToken = token;
    s.dbUserId = dbUserId;
  }

  /** Mark the tick of last meaningful action (for cooldown logic). */
  touch(actorId: string, tick: number): void {
    this.getState(actorId).lastActionTick = tick;
  }

  /** Summary counts for output-schema ActorSummary. */
  summary() {
    const allAgents = this.allAgents;
    return {
      totalClients: this.clients.length,
      totalHandlers: this.handlers.length,
      totalAgents: allAgents.length,
      totalArbiters: this.arbiters.length,
      activeClients: this.clients.filter(c => this.getState(c.id).activeJobIds.length > 0).length,
      activeHandlers: this.handlers.filter(h => this.getState(h.id).activeJobIds.length > 0).length,
      activeAgents: allAgents.filter(a => this.getState(a.id).activeJobIds.length > 0).length,
    };
  }
}

function newActorState(): ActorState {
  return {
    activeJobIds: [],
    totalEarned: 0,
    totalSpent: 0,
    completedJobs: 0,
    failedJobs: 0,
    isAuthenticated: false,
    authToken: null,
    dbUserId: null,
    lastActionTick: -1,
  };
}
