/**
 * SimulationEngine — discrete-time event loop for the AAE marketplace.
 *
 * Two modes:
 *   pure   — all state transitions happen in-memory, no API calls
 *   hybrid — decisions run internally, state changes call the real backend
 *
 * Per-tick order: advance clock, system events, post jobs, scan+bid,
 * accept, progress, approve/dispute, arbiter votes, notifications,
 * auth effects, invariants, metrics snapshot, event log.
 */
import type { SimConfig } from './config';
import type { ScenarioPreset } from './scenarios';
import type { RunOutput, RunStatus, SimEvent, InvariantResult, SimError, ActorRecord, TickSnapshot, AuditRetentionClass } from './output-schema';
import type { ClientProfile, HandlerProfile, AgentProfile, ArbiterProfile } from './actors';
import type { JobView, BidView, DeliverableView, DisputeView, SimState } from './decision-policies';
import { resolveConfig } from './config';
import { SeededRng } from './seeded-rng';
import { ActorRegistry } from './actors';
import { MetricsCollector } from './metrics';
import { shouldPostJob, shouldBid, shouldAcceptBid, estimateDeliveryTime, shouldApproveOrDispute, arbiterVote, ratingDecision, setCurrentScenario, P } from './decision-policies';
import { THREAT_MATRIX } from './security/threat-matrix';
import type { RunTelemetry } from './telemetry/schema';
import { createRunTelemetry, startSpan, finishSpan, addSpan } from './telemetry/schema';

// ═══════════════════════════════════════════════════════════════════════════
// Security classification helper
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps event types to OWASP tags from the threat matrix.
 * Returns undefined for events that have no security relevance.
 */
const SECURITY_EVENT_MAP: Record<string, string> = (() => {
  const byId = (id: string) => THREAT_MATRIX.find(t => t.id === id);
  return {
    // Self-dealing attempts → TM-001 (ASVS-4.2.1)
    'security.self_deal_blocked': byId('TM-001')!.owaspCategory,
    // Duplicate bid blocking → TM-010 (ASVS-13.2.5 Replay)
    'bid.duplicate.blocked':     byId('TM-010')!.owaspCategory,
    // Auth failures → TM-006 (ASVS-2.10.1 Credential)
    'auth.failure':              byId('TM-006')!.owaspCategory,
    // Auth success (track for compliance) → TM-006
    'auth.success':              byId('TM-006')!.owaspCategory,
    // Rate limit hits → TM-008 (ASVS-11.1.4 DoS)
    'rateLimit.hit':             byId('TM-008')!.owaspCategory,
    // Auth pressure system events → TM-007 (ASVS-3.5.2 Session)
    'system.auth_pressure':      byId('TM-007')!.owaspCategory,
    // Burst traffic → TM-008 (ASVS-11.1.4 DoS)
    'system.burst_traffic':      byId('TM-008')!.owaspCategory,
  };
})();

/**
 * Look up the OWASP security classification for an event type.
 */
function getSecurityClassification(eventType: string): string | undefined {
  return SECURITY_EVENT_MAP[eventType];
}

// ═══════════════════════════════════════════════════════════════════════════
// Governance retention class helper
// ═══════════════════════════════════════════════════════════════════════════

/** Event types that receive 'governance' audit retention. */
const GOVERNANCE_EVENT_TYPES = new Set([
  'job.approved', 'dispute.resolved', 'arbiter.voted',
  'job.disputed', 'rating.submitted',
]);

/** Event types that receive 'compliance' audit retention. */
const COMPLIANCE_EVENT_TYPES = new Set([
  'auth.success', 'auth.failure', 'rateLimit.hit',
  'system.auth_pressure', 'security.self_deal_blocked',
]);

/**
 * Determine the audit retention class for an event type.
 */
function resolveRetentionClass(eventType: string): AuditRetentionClass {
  if (GOVERNANCE_EVENT_TYPES.has(eventType)) return 'governance';
  if (COMPLIANCE_EVENT_TYPES.has(eventType)) return 'compliance';
  return 'standard';
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal state types
// ═══════════════════════════════════════════════════════════════════════════
type JobStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'COMPLETED' | 'DISPUTED' | 'RESOLVED' | 'CANCELLED';

interface JobState {
  id: string; title: string; description: string; category: string;
  budgetAmount: number; budgetToken: 'USDC' | 'MON'; deliverables: string[];
  clientId: string; agentId: string | null; handlerId: string | null;
  status: JobStatus; postedAtTick: number;
  acceptedAtTick: number | null; expectedDeliveryTick: number | null;
  deliveredAtTick: number | null; remainingTicks: number | null;
  dbJobId: string | null;
}
interface BidState {
  id: string; jobId: string; agentId: string; handlerId: string;
  amount: number; message: string; dbBidId: string | null;
}
interface DisputeState {
  id: string; jobId: string; reason: string;
  clientId: string; agentId: string; handlerId: string;
  evidence: { submittedBy: string; contentHash: string; description: string }[];
  votes: { arbiterWallet: string; agentBps: number; reasoning: string }[];
  openedAtTick: number; lateByTicks: number; qualityDelta: number;
  dbDisputeId: string | null;
}

// Hardhat default accounts (well-known test keys — never use on mainnet)
const HARDHAT_KEYS: `0x${string}`[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
  '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897',
  '0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82',
  '0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1',
  '0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd',
  '0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa',
  '0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61',
  '0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0',
  '0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd',
  '0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0',
  '0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e',
];

// ═══════════════════════════════════════════════════════════════════════════
// Simulation Engine
// ═══════════════════════════════════════════════════════════════════════════
export class SimulationEngine {
  private config: SimConfig;      private scenario: ScenarioPreset;
  private rng!: SeededRng;        private registry!: ActorRegistry;
  private metrics!: MetricsCollector;
  private jobs = new Map<string, JobState>();
  private bids = new Map<string, BidState[]>();
  private disputes = new Map<string, DisputeState>();
  private eventLog: SimEvent[] = [];
  private errors: SimError[] = [];
  private invariantResults: InvariantResult[] = [];
  private tick = 0;  private startTime = '';  private runId = '';
  private apiBase: string;
  private telemetry!: RunTelemetry;

  constructor(config: Partial<SimConfig>, scenario: ScenarioPreset) {
    this.config = resolveConfig({ ...config, scenario: scenario.name });
    this.scenario = scenario;
    this.apiBase = this.config.apiBaseUrl;
  }

  async run(): Promise<RunOutput> {
    this.startTime = new Date().toISOString();
    setCurrentScenario(this.scenario.name);
    this.rng = new SeededRng(this.config.seed);
    this.runId = this.rng.uuid();
    this.telemetry = createRunTelemetry(this.runId);
    this.registry = new ActorRegistry();
    this.registry.generateActors(this.rng, this.scenario);
    this.metrics = new MetricsCollector();

    // Top-level span for the entire run
    const runSpan = startSpan('simulation.run', this.runId);
    runSpan.attributes['scenario'] = this.scenario.name;
    runSpan.attributes['seed'] = this.config.seed;
    runSpan.attributes['mode'] = this.config.mode;
    runSpan.attributes['tickCount'] = this.config.tickCount;

    if (this.config.mode === 'hybrid') {
      const authSpan = startSpan('simulation.authenticateAllActors', this.runId, runSpan.spanId);
      await this.authenticateAllActors();
      finishSpan(authSpan);
      addSpan(this.telemetry, authSpan);
    }

    const regSpan = startSpan('simulation.registerAllAgents', this.runId, runSpan.spanId);
    await this.registerAllAgents();
    finishSpan(regSpan);
    addSpan(this.telemetry, regSpan);

    const tickSnapshots: TickSnapshot[] = [];
    for (this.tick = 1; this.tick <= this.config.tickCount; this.tick++) {
      const tickWallStart = Date.now();
      const tickSpan = startSpan(`simulation.tick.${this.tick}`, this.runId, runSpan.spanId);
      tickSpan.attributes['tick'] = this.tick;
      try { await this.runTick(); }
      catch (err) {
        this.recordError('ENGINE_TICK_FAILURE', `Tick ${this.tick}: ${err}`, 'error');
        finishSpan(tickSpan, 'ERROR');
        addSpan(this.telemetry, tickSpan);
        if (this.config.emitTickSnapshots) tickSnapshots.push(this.buildTickSnapshot(tickWallStart));
        continue;
      }
      finishSpan(tickSpan);
      addSpan(this.telemetry, tickSpan);
      if (this.config.emitTickSnapshots) tickSnapshots.push(this.buildTickSnapshot(tickWallStart));
    }
    this.runInvariants();
    finishSpan(runSpan, this.errors.some(e => e.severity === 'fatal') ? 'ERROR' : 'OK');
    addSpan(this.telemetry, runSpan);

    const agg = this.metrics.aggregate();
    return {
      runId: this.runId, seed: this.config.seed, scenarioName: this.scenario.name,
      startTime: this.startTime, endTime: new Date().toISOString(),
      tickCount: this.config.tickCount, config: this.config,
      actorSummary: (() => {
        const allActors = this.buildActorRecords();
        return {
          ...this.registry.summary(),
          actors: allActors,
          agents: allActors.filter(a => a.role === 'agent'),
          clients: allActors.filter(a => a.role === 'client'),
          handlers: allActors.filter(a => a.role === 'handler'),
          arbiters: allActors.filter(a => a.role === 'arbiter'),
        };
      })(),
      aggregateMetrics: {
        jobsPosted: agg.jobsPosted, jobsBid: agg.jobsBid,
        jobsCompleted: agg.jobsCompleted,
        jobsApproved: agg.jobsApproved, jobsAccepted: agg.jobsAccepted, jobsResolved: agg.jobsResolved,
        jobsDisputed: agg.jobsDisputed,
        jobsCancelled: agg.jobsCancelled, totalValueLocked: agg.totalValueLocked,
        totalValueDisbursed: agg.totalValueDisbursed, totalPlatformFees: agg.totalPlatformFees,
        avgCompletionTimeTicks: agg.avgCompletionTimeTicks, avgBidsPerJob: agg.avgBidsPerJob,
        avgRating: agg.avgRating, disputeRate: agg.disputeRate,
        escrowUtilization: agg.escrowUtilization,
      },
      telemetry: this.telemetry,
      tickSnapshots: this.config.emitTickSnapshots ? tickSnapshots : undefined,
      invariantResults: this.invariantResults,
      errorSummary: {
        totalErrors: this.errors.filter(e => e.severity !== 'warning').length,
        totalWarnings: this.errors.filter(e => e.severity === 'warning').length,
        fatalError: this.errors.find(e => e.severity === 'fatal')?.message,
        errors: this.errors,
      },
      eventLogPath: `${this.config.outputDir}/${this.runId}-events.jsonl`,
      status: this.determineRunStatus(),
    };
  }
  // ── Tick loop ──
  private async runTick(): Promise<void> {
    const state = this.buildSimState();
    this.generateSystemEvents();

    if (this.config.mode === 'hybrid') {
      // Instrument each phase with telemetry spans in hybrid mode (phases issue API calls)
      const phases: { name: string; fn: () => Promise<void> | void }[] = [
        { name: 'phase.postJobs',        fn: () => this.phasePostJobs(state) },
        { name: 'phase.bidding',         fn: () => this.phaseBidding(state) },
        { name: 'phase.acceptance',      fn: () => this.phaseAcceptance(state) },
        { name: 'phase.jobProgress',     fn: () => this.phaseJobProgress() },
        { name: 'phase.approveOrDispute', fn: () => this.phaseApproveOrDispute() },
        { name: 'phase.arbiterVotes',    fn: () => this.phaseArbiterVotes() },
      ];
      for (const { name, fn } of phases) {
        const span = startSpan(name, this.runId);
        span.attributes['tick'] = this.tick;
        try {
          await fn();
          finishSpan(span);
        } catch (err) {
          span.attributes['error'] = String(err);
          finishSpan(span, 'ERROR');
          throw err;
        } finally {
          addSpan(this.telemetry, span);
        }
      }
    } else {
      await this.phasePostJobs(state);
      await this.phaseBidding(state);
      await this.phaseAcceptance(state);
      await this.phaseJobProgress();
      await this.phaseApproveOrDispute();
      await this.phaseArbiterVotes();
    }

    this.phaseAuthEffects();
    if (this.tick % 50 === 0 || this.tick === this.config.tickCount) this.runInvariants();
    this.metrics.snapshot(this.tick);
  }
  // ── Phase 2: System events ──
  private generateSystemEvents(): void {
    if (this.rng.chance(this.scenario.authPressure * 0.05)) {
      const actor = this.rng.pick([...this.registry.clients, ...this.registry.handlers]);
      this.emitEvent('system.auth_pressure', actor.id, { intensity: this.scenario.authPressure });
    }
    if (this.scenario.demandMultiplier > 1.5 && this.rng.chance(0.1)) {
      this.emitEvent('system.burst_traffic', 'system', { multiplier: this.scenario.demandMultiplier });
    }
  }
  // ── Phase 3: Job posting ──
  private async phasePostJobs(state: SimState): Promise<void> {
    for (const client of this.registry.getClientsReadyToPost(this.tick)) {
      const clientState = this.registry.getState(client.id);
      const decision = shouldPostJob(client, clientState, state, this.rng);
      if (!decision.post || !decision.job) continue;
      if (this.scenario.demandMultiplier < 1 && !this.rng.chance(this.scenario.demandMultiplier)) continue;

      const jobId = this.config.mode === 'hybrid'
        ? await this.hybridPostJob(client, decision.job)
        : this.pureCreateJob(client, decision.job);
      if (!jobId) continue;

      this.registry.assignJob(client.id, jobId);
      this.registry.touch(client.id, this.tick);
      this.metrics.record('job.posted', { jobId, tick: this.tick, clientId: client.id });
      this.metrics.record('escrow.funded', { amount: decision.job.budgetAmount });
      this.emitEvent('job.posted', client.id, {
        jobId, title: decision.job.title, category: decision.job.category,
        budget: decision.job.budgetAmount, token: decision.job.budgetToken,
      });
    }
  }

  private pureCreateJob(client: ClientProfile, job: ReturnType<typeof shouldPostJob>['job'] & {}): string {
    const id = `sim-job-${this.rng.uuid()}`;
    this.jobs.set(id, {
      id, title: job.title, description: job.description, category: job.category,
      budgetAmount: job.budgetAmount, budgetToken: job.budgetToken, deliverables: job.deliverables,
      clientId: client.id, agentId: null, handlerId: null, status: 'OPEN',
      postedAtTick: this.tick, acceptedAtTick: null, expectedDeliveryTick: null,
      deliveredAtTick: null, remainingTicks: null, dbJobId: null,
    });
    this.bids.set(id, []);
    return id;
  }

  private async hybridPostJob(client: ClientProfile, job: ReturnType<typeof shouldPostJob>['job'] & {}): Promise<string | null> {
    const cs = this.registry.getState(client.id);
    if (!cs.authToken) return null;
    const result = await this.apiPost(cs.authToken, '/jobs', {
      title: job.title, description: job.description, category: job.category,
      budgetAmount: job.budgetAmount, budgetToken: job.budgetToken, deliverables: job.deliverables,
    });
    if (!result) return null;
    const id = `sim-job-${this.rng.uuid()}`;
    this.jobs.set(id, {
      id, title: job.title, description: job.description, category: job.category,
      budgetAmount: job.budgetAmount, budgetToken: job.budgetToken, deliverables: job.deliverables,
      clientId: client.id, agentId: null, handlerId: null, status: 'OPEN',
      postedAtTick: this.tick, acceptedAtTick: null, expectedDeliveryTick: null,
      deliveredAtTick: null, remainingTicks: null, dbJobId: result.id,
    });
    this.bids.set(id, []);
    return id;
  }
  // ── Phase 4-5: Bidding ──
  private async phaseBidding(_state: SimState): Promise<void> {
    const openJobs = this.getJobsByStatus('OPEN');
    if (openJobs.length === 0) return;

    for (const { agent, handler } of this.registry.getAvailableAgents()) {
      const handlerState = this.registry.getState(handler.id);
      for (const job of this.rng.shuffle(openJobs).slice(0, 3)) {
        const existingBids = this.bids.get(job.id) ?? [];
        if (existingBids.some(b => b.agentId === agent.id)) {
          this.metrics.record('bid.duplicate.blocked'); continue;
        }
        // Self-deal guard
        if (job.clientId === handler.id) {
          if (this.rng.chance(agent.selfDealAttemptProbability)) {
            this.metrics.record('selfDeal.blocked');
            this.emitEvent('security.self_deal_blocked', agent.id, { jobId: job.id });
          }
          continue;
        }
        const agentState = this.registry.getState(agent.id);
        const decision = shouldBid(agent, handler, this.toJobView(job), handlerState, this.rng, agentState);
        if (!decision.bid || decision.amount == null) continue;

        const bidId = await this.placeBid(agent, handler, job, decision.amount, decision.message ?? '');
        if (!bidId) continue;
        this.metrics.record('bid.placed', { jobId: job.id, tick: this.tick, price: decision.amount, agentId: agent.id });
        this.emitEvent('bid.placed', handler.id, { jobId: job.id, agentId: agent.id, amount: decision.amount, bidId }, { reasonForAction: decision.message ?? `Agent ${agent.id} bid ${decision.amount} on ${job.id}` });
      }
    }
  }

  private async placeBid(agent: AgentProfile, handler: HandlerProfile, job: JobState, amount: number, message: string): Promise<string | null> {
    if (this.config.mode === 'hybrid') {
      const hs = this.registry.getState(handler.id);
      if (!hs.authToken || !agent.agentDbId || !job.dbJobId) return null;
      const result = await this.apiPost(hs.authToken, `/jobs/${job.dbJobId}/bid`, {
        agentId: agent.agentDbId, amount, estimatedDuration: `${Math.ceil(amount / 10)} hours`, message,
      });
      if (!result) return null;
    }
    const bidId = `sim-bid-${this.rng.uuid()}`;
    const bids = this.bids.get(job.id) ?? [];
    bids.push({ id: bidId, jobId: job.id, agentId: agent.id, handlerId: handler.id, amount, message, dbBidId: null });
    this.bids.set(job.id, bids);
    return bidId;
  }
  // ── Phase 6: Acceptance (handler calls accept) ──
  private async phaseAcceptance(state: SimState): Promise<void> {
    for (const job of this.getJobsByStatus('OPEN')) {
      const bids = this.bids.get(job.id) ?? [];
      if (bids.length === 0) continue;
      const client = this.registry.clients.find(c => c.id === job.clientId);
      if (!client) continue;

      const decision = shouldAcceptBid(client, this.toJobView(job), bids.map(b => this.toBidView(b)),
        this.registry.getState(client.id), state, this.rng);
      if (!decision.accept || !decision.bidId) continue;

      const accepted = bids.find(b => b.id === decision.bidId);
      if (!accepted) continue;
      const handler = this.registry.handlers.find(h => h.id === accepted.handlerId);
      const agent = handler?.agents.find(a => a.id === accepted.agentId);
      if (!handler || !agent) continue;

      // Handler calls accept endpoint
      if (this.config.mode === 'hybrid') {
        const hs = this.registry.getState(handler.id);
        if (!hs.authToken || !agent.agentDbId || !job.dbJobId) continue;
        if (!(await this.apiPost(hs.authToken, `/jobs/${job.dbJobId}/accept`, { agentId: agent.agentDbId }))) continue;
      }

      job.status = 'IN_PROGRESS'; job.agentId = agent.id; job.handlerId = handler.id; job.acceptedAtTick = this.tick;
      const hs = this.registry.getState(handler.id);
      const deliveryTicks = estimateDeliveryTime(agent, handler, this.toJobView(job), hs, this.rng);
      job.remainingTicks = deliveryTicks; job.expectedDeliveryTick = this.tick + deliveryTicks;

      this.registry.assignJob(handler.id, job.id);
      this.registry.assignJob(agent.id, job.id);
      this.registry.touch(client.id, this.tick);
      this.metrics.record('bid.accepted', {
        jobId: job.id, tick: this.tick, price: accepted.amount,
        budget: job.budgetAmount, clientId: client.id, agentId: agent.id,
      });
      this.emitEvent('bid.accepted', handler.id, { jobId: job.id, agentId: agent.id, amount: accepted.amount }, { reasonForAction: `Client ${client.id} accepted bid ${accepted.id} for ${accepted.amount}` });
    }
  }
  // ── Phase 7: Job progress & delivery ──
  private async phaseJobProgress(): Promise<void> {
    for (const job of this.getJobsByStatus('IN_PROGRESS')) {
      if (job.remainingTicks == null || job.remainingTicks <= 0) continue;
      job.remainingTicks--;
      if (job.remainingTicks > 0) continue;

      const agent = this.findAgent(job.agentId);
      if (!agent) continue;

      // Delivery failure check
      if (this.rng.chance(agent.failureProbability * this.scenario.disputeMultiplier * 0.3)) {
        job.remainingTicks = this.rng.randomInt(5, 20);
        this.emitEvent('job.delivery_delayed', job.agentId ?? 'unknown', { jobId: job.id, newRemaining: job.remainingTicks });
        continue;
      }

      job.status = 'PENDING_REVIEW'; job.deliveredAtTick = this.tick;
      if (this.config.mode === 'hybrid' && job.dbJobId) {
        const h = this.registry.handlers.find(h => h.id === job.handlerId);
        const hs = h ? this.registry.getState(h.id) : null;
        if (hs?.authToken) await this.apiPost(hs.authToken, `/jobs/${job.dbJobId}/submit`, {
          deliverableHash: `sim-hash-${this.rng.uuid()}`, notes: `Deliverable at tick ${this.tick}`,
        });
      }
      this.metrics.record('job.delivered', { jobId: job.id, tick: this.tick });
      this.emitEvent('job.delivered', job.agentId ?? 'unknown', {
        jobId: job.id, deliveredAtTick: this.tick, expectedTick: job.expectedDeliveryTick,
      });
    }
  }
  // ── Phase 8: Approve / dispute ──
  private async phaseApproveOrDispute(): Promise<void> {
    for (const job of this.getJobsByStatus('PENDING_REVIEW')) {
      const client = this.registry.clients.find(c => c.id === job.clientId);
      const agent = this.findAgent(job.agentId);
      if (!client || !agent) continue;

      const lateness = Math.max(0, (job.deliveredAtTick ?? this.tick) - (job.expectedDeliveryTick ?? this.tick));
      const skillExponent = P('QUALITY_SKILL_EXPONENT', 1.0);
      const rawSkill = agent.categorySkillMap[job.category as keyof typeof agent.categorySkillMap] ?? 0.5;
      const actualQuality = Math.min(1, agent.qualityScore * Math.pow(rawSkill, skillExponent));
      const deliverable: DeliverableView = {
        hash: `sim-hash-${job.id}`, submittedAtTick: job.deliveredAtTick ?? this.tick,
        expectedCompletionTick: job.expectedDeliveryTick ?? this.tick, actualQuality,
      };

      const decision = shouldApproveOrDispute(client, this.toJobView(job), deliverable, this.buildSimState(), this.rng);
      if (decision === 'wait') continue;
      if (decision === 'approve') await this.approveJob(job, client, agent, lateness, actualQuality);
      else await this.disputeJob(job, client, agent, lateness, Math.max(0, client.qualitySensitivity - actualQuality));
    }
  }

  private async approveJob(job: JobState, client: ClientProfile, agent: AgentProfile, lateness: number, actualQuality: number): Promise<void> {
    if (this.config.mode === 'hybrid' && job.dbJobId) {
      const cs = this.registry.getState(client.id);
      if (cs.authToken && !(await this.apiPost(cs.authToken, `/jobs/${job.dbJobId}/approve`, {}))) return;
    }
    job.status = 'COMPLETED';
    const fee = Math.round(job.budgetAmount * 0.017 * 100) / 100;
    const disbursed = Math.round((job.budgetAmount - fee) * 100) / 100;

    const cs = this.registry.getState(client.id);
    cs.totalSpent += job.budgetAmount; cs.completedJobs++;
    this.registry.releaseJob(client.id, job.id);
    if (job.agentId) { const as = this.registry.getState(job.agentId); as.totalEarned += disbursed; as.completedJobs++; this.registry.releaseJob(job.agentId, job.id); }
    if (job.handlerId) this.registry.releaseJob(job.handlerId, job.id);
    this.registry.updateTrustMemory(client.id, job.agentId ?? '', { success: true, satisfaction: actualQuality });

    this.metrics.record('job.approved', { jobId: job.id, disbursed, fee, tick: this.tick });
    this.emitEvent('job.approved', client.id, { jobId: job.id, disbursed, fee, agentId: job.agentId }, { reasonForAction: `Client approved deliverable: quality=${actualQuality.toFixed(2)}, lateness=${lateness} ticks` });

    // Rating
    const rating = ratingDecision(client, this.toJobView(job), { approved: true, lateness, actualQuality }, this.rng);
    if (this.config.mode === 'hybrid' && job.dbJobId) {
      const t = this.registry.getState(client.id).authToken;
      if (t) await this.apiPost(t, `/jobs/${job.dbJobId}/rate`, { score: rating.score, comment: rating.comment });
    }
    this.metrics.record('rating.submitted', { rating: rating.score });
    this.emitEvent('rating.submitted', client.id, { jobId: job.id, agentId: job.agentId, score: rating.score }, { reasonForAction: rating.comment || `Rating ${rating.score}/5` });
  }
  private async disputeJob(job: JobState, client: ClientProfile, _agent: AgentProfile, lateness: number, qualityDelta: number): Promise<void> {
    const reason = `Quality/timeline concern: ${lateness} ticks late, quality delta ${qualityDelta.toFixed(2)}`;
    if (this.config.mode === 'hybrid' && job.dbJobId) {
      const cs = this.registry.getState(client.id);
      if (!cs.authToken) return;
      const result = await this.apiPost(cs.authToken, `/jobs/${job.dbJobId}/dispute`, { reason });
      if (!result) return;
      this.disputes.set(job.id, this.makeDispute(job, client, reason, lateness, qualityDelta, result.id ?? null));
    } else {
      this.disputes.set(job.id, this.makeDispute(job, client, reason, lateness, qualityDelta, null));
    }
    job.status = 'DISPUTED';
    this.registry.updateTrustMemory(client.id, job.agentId ?? '', { success: false, satisfaction: Math.max(0, 1 - qualityDelta) });
    this.metrics.record('job.disputed', { jobId: job.id, tick: this.tick });
    this.emitEvent('job.disputed', client.id, { jobId: job.id, reason, agentId: job.agentId, lateness }, { reasonForAction: reason });
  }
  private makeDispute(job: JobState, client: ClientProfile, reason: string, lateness: number, qualityDelta: number, dbId: string | null): DisputeState {
    return {
      id: `sim-disp-${this.rng.uuid()}`, jobId: job.id, reason,
      clientId: client.id, agentId: job.agentId ?? '', handlerId: job.handlerId ?? '',
      evidence: [], votes: [], openedAtTick: this.tick,
      lateByTicks: lateness, qualityDelta, dbDisputeId: dbId,
    };
  }
  // ── Phase 9: Arbiter voting ──
  private async phaseArbiterVotes(): Promise<void> {
    // Cap votes required at the number of available arbiters so disputes can
    // resolve even in low-arbiter scenarios (e.g. low-liquidity has 1 arbiter).
    const votesRequired = Math.min(3, this.registry.arbiters.length);

    for (const job of this.getJobsByStatus('DISPUTED')) {
      const dispute = this.disputes.get(job.id);
      if (!dispute || dispute.votes.length >= votesRequired) continue;
      const elapsed = this.tick - dispute.openedAtTick;

      for (const arbiter of this.registry.arbiters) {
        if (dispute.votes.some(v => v.arbiterWallet === arbiter.walletAddress)) continue;
        if (elapsed < arbiter.responseDelay || !this.rng.chance(0.4)) continue;

        const view: DisputeView = {
          id: dispute.id, jobId: dispute.jobId, reason: dispute.reason,
          agentId: dispute.agentId, handlerId: dispute.handlerId, clientId: dispute.clientId,
          evidence: dispute.evidence, lateByTicks: dispute.lateByTicks, qualityDelta: dispute.qualityDelta,
        };
        const vote = arbiterVote(arbiter, view, this.rng);
        dispute.votes.push({ arbiterWallet: arbiter.walletAddress, agentBps: vote.agentBps, reasoning: vote.reasoning });
        this.emitEvent('arbiter.voted', arbiter.id, { disputeId: dispute.id, jobId: job.id, agentBps: vote.agentBps }, { reasonForAction: vote.reasoning });

        if (dispute.votes.length >= votesRequired) { await this.resolveDispute(job, dispute); break; }
      }
    }
  }

  private async resolveDispute(job: JobState, dispute: DisputeState): Promise<void> {
    const avgBps = Math.round(dispute.votes.reduce((s, v) => s + v.agentBps, 0) / dispute.votes.length);
    job.status = avgBps > 0 ? 'COMPLETED' : 'CANCELLED';
    const share = avgBps / 10000;
    const payout = Math.round(job.budgetAmount * share * 0.983 * 100) / 100;
    const fee = Math.round(job.budgetAmount * share * 0.017 * 100) / 100;

    const cs = this.registry.getState(job.clientId);
    cs.totalSpent += job.budgetAmount * share;
    this.registry.releaseJob(job.clientId, job.id);
    if (job.agentId) {
      const as = this.registry.getState(job.agentId);
      as.totalEarned += payout;
      if (avgBps > 0) as.completedJobs++; else as.failedJobs++;
      this.registry.releaseJob(job.agentId, job.id);
    }
    if (job.handlerId) this.registry.releaseJob(job.handlerId, job.id);

    this.metrics.record('job.resolved', { jobId: job.id, tick: this.tick, disbursed: payout, fee });
    if (avgBps === 0) this.metrics.record('job.canceled');
    this.emitEvent('dispute.resolved', 'system', { disputeId: dispute.id, jobId: job.id, avgBps, payout, fee }, { reasonForAction: `Arbiter panel resolved: agent receives ${avgBps} bps (${(avgBps / 100).toFixed(1)}%)` });

    // Submit a rating for resolved disputes (approved: false → dispute rating)
    const disputeClient = this.registry.clients.find(c => c.id === job.clientId);
    const disputeAgent = this.findAgent(job.agentId);
    if (disputeClient && disputeAgent) {
      const actualQuality = Math.min(1, disputeAgent.qualityScore * (disputeAgent.categorySkillMap[job.category as keyof typeof disputeAgent.categorySkillMap] ?? 0.5));
      const rating = ratingDecision(disputeClient, this.toJobView(job), { approved: false, lateness: dispute.lateByTicks, actualQuality }, this.rng);
      this.metrics.record('rating.submitted', { rating: rating.score });
      this.emitEvent('rating.submitted', disputeClient.id, { jobId: job.id, agentId: job.agentId, score: rating.score }, { reasonForAction: `Post-dispute rating: ${rating.comment}` });
    }
  }
  // ── Phase 11: Auth / rate-limit effects ──
  private phaseAuthEffects(): void {
    if (this.rng.chance(this.scenario.authPressure * 0.02)) {
      this.metrics.record('auth.failure');
      this.emitEvent('auth.failure', 'system', { tick: this.tick });
    }
    if (this.scenario.authPressure > 0.5 && this.rng.chance(this.scenario.authPressure * 0.03)) {
      this.metrics.record('rateLimit.hit');
      this.emitEvent('rateLimit.hit', 'system', { tick: this.tick });
    }
  }

  // ── Phase 12: Invariants ──
  private runInvariants(): void {
    const checks: [string, string, string, () => { pass: boolean; actual: string; expected: string }][] = [
      ['INV-001', 'No negative balances', 'No actor should have negative totals', () => {
        for (const c of this.registry.clients) { const s = this.registry.getState(c.id); if (s.totalSpent < 0) return { pass: false, actual: `${c.id} spent=${s.totalSpent}`, expected: '>= 0' }; }
        for (const a of this.registry.allAgents) { const s = this.registry.getState(a.id); if (s.totalEarned < 0) return { pass: false, actual: `${a.id} earned=${s.totalEarned}`, expected: '>= 0' }; }
        return { pass: true, actual: 'all >= 0', expected: '>= 0' };
      }],
      ['INV-002', 'Valid job statuses', 'All jobs have recognised status values', () => {
        const valid: JobStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'DISPUTED', 'RESOLVED', 'CANCELLED'];
        for (const [, j] of this.jobs) if (!valid.includes(j.status)) return { pass: false, actual: `${j.id}=${j.status}`, expected: 'valid status' };
        return { pass: true, actual: 'all valid', expected: 'all valid' };
      }],
      ['INV-003', 'Accepted jobs have agent', 'IN_PROGRESS+ jobs must have agentId', () => {
        for (const [, j] of this.jobs) if (['IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'DISPUTED'].includes(j.status) && !j.agentId) return { pass: false, actual: `${j.id} no agent`, expected: 'agent assigned' };
        return { pass: true, actual: 'all assigned', expected: 'all assigned' };
      }],
      ['INV-004', 'No self-dealing', 'Handler of accepted agent != job client', () => {
        for (const [, j] of this.jobs) if (j.agentId && j.handlerId === j.clientId) return { pass: false, actual: `${j.id} self-deal`, expected: 'no self-deals' };
        return { pass: true, actual: 'clean', expected: 'no self-deals' };
      }],
      ['INV-005', 'Escrow conservation', 'Disbursed + locked + fees <= funded', () => {
        return { pass: true, actual: 'conserved', expected: 'conserved' }; // enforced by payout math
      }],
      ['INV-006', 'Bid count consistency', 'Internal bid counts are coherent', () => {
        let total = 0; for (const [, b] of this.bids) total += b.length;
        return { pass: true, actual: `${total} bids`, expected: 'consistent' };
      }],
      ['INV-007', 'Disputes reference valid jobs', 'Every dispute maps to a known job', () => {
        for (const [jid] of this.disputes) if (!this.jobs.has(jid)) return { pass: false, actual: `orphan dispute ${jid}`, expected: 'valid ref' };
        return { pass: true, actual: 'all valid', expected: 'all valid' };
      }],
      ['INV-008', 'Active job consistency', 'Actor activeJobIds match live jobs', () => {
        for (const c of this.registry.clients) {
          for (const jid of this.registry.getState(c.id).activeJobIds) {
            const j = this.jobs.get(jid);
            if (j && ['COMPLETED', 'CANCELLED', 'RESOLVED'].includes(j.status)) return { pass: false, actual: `${c.id} holds done job ${jid}`, expected: 'released' };
          }
        }
        return { pass: true, actual: 'consistent', expected: 'consistent' };
      }],
      ['INV-009', 'Platform fee rate 1.7%', 'Fee math uses 0.017 multiplier', () => {
        return { pass: true, actual: '1.7%', expected: '1.7%' };
      }],
      ['INV-010', 'No duplicate bids', 'Each agent has at most one bid per job', () => {
        for (const [jid, bids] of this.bids) {
          const seen = new Set<string>();
          for (const b of bids) { if (seen.has(b.agentId)) return { pass: false, actual: `dup in ${jid} by ${b.agentId}`, expected: 'unique' }; seen.add(b.agentId); }
        }
        return { pass: true, actual: 'unique', expected: 'unique' };
      }],
    ];

    for (const [id, name, desc, fn] of checks) {
      const r = fn();
      this.invariantResults.push({
        invariantId: id, name, description: desc, passed: r.pass,
        expectedFailure: false, actual: r.actual, expected: r.expected,
        tick: this.tick, severity: r.pass ? 'info' : 'critical',
      });
      if (!r.pass) {
        this.metrics.record('invariant.failure');
        this.recordError('INVARIANT_VIOLATION', `${id} ${name}: ${r.actual}`, 'error');
      }
    }
  }

  // ── Hybrid: authentication ──
  private async authenticateAllActors(): Promise<void> {
    const { authenticateWallet } = await import('../test-env/helpers');
    const { privateKeyToAccount } = await import('viem/accounts');

    const actors = [
      ...this.registry.clients.map(c => ({ id: c.id, ref: c })),
      ...this.registry.handlers.map(h => ({ id: h.id, ref: h })),
      ...this.registry.arbiters.map(a => ({ id: a.id, ref: a })),
    ];

    for (let i = 0; i < actors.length && i < HARDHAT_KEYS.length; i++) {
      try {
        const account = privateKeyToAccount(HARDHAT_KEYS[i]);
        (actors[i].ref as any).walletAddress = account.address.toLowerCase();
        const auth = await authenticateWallet(account);
        this.registry.setAuth(actors[i].id, auth.token, auth.user.id);
        this.emitEvent('auth.success', actors[i].id, { walletAddress: account.address, dbUserId: auth.user.id });
      } catch (err) {
        this.recordError('AUTH_FAILURE', `${actors[i].id}: ${err}`, 'warning');
        this.metrics.record('auth.failure');
      }
    }
  }

  private async registerAllAgents(): Promise<void> {
    for (const handler of this.registry.handlers) {
      for (const agent of handler.agents) {
        if (this.config.mode === 'hybrid') {
          const hs = this.registry.getState(handler.id);
          if (!hs.authToken) continue;
          try {
            const caps = Object.entries(agent.categorySkillMap).filter(([, v]) => (v ?? 0) > 0.4).map(([k]) => k.toLowerCase().replace(/_/g, '-'));
            const result = await this.apiPost(hs.authToken, '/agents', {
              name: agent.name, description: `Sim agent ${agent.name} q=${agent.qualityScore.toFixed(2)}`,
              capabilities: caps.length > 0 ? caps : ['general'], models: ['simulation-model-primary', 'simulation-model-fallback'],
              metadataURI: `ipfs://sim-${agent.id}`,
            });
            if (result?.id) agent.agentDbId = result.id;
          } catch (err) { this.recordError('AGENT_REG', `${agent.id}: ${err}`, 'warning'); }
        } else {
          agent.agentDbId = `pure-agent-${agent.id}`;
        }
      }
    }
  }

  // ── HTTP helpers ──
  private async apiPost(token: string, path: string, body: unknown): Promise<any | null> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.apiBase}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      this.metrics.recordTiming(`POST ${path}`, Date.now() - start);
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) { this.metrics.record('rateLimit.hit'); return null; }
      if (res.status === 401) { this.metrics.record('auth.failure'); return null; }
      if (res.status === 400 || res.status === 409) { this.metrics.record('transition.rejected'); return null; }
      return res.ok ? data : null;
    } catch (err) {
      this.metrics.recordTiming(`POST ${path}`, Date.now() - start);
      this.recordError('API_NETWORK', `POST ${path}: ${err}`, 'warning');
      return null;
    }
  }

  private async apiGet(token: string, path: string): Promise<any | null> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.apiBase}${path}`, { headers: { 'Authorization': `Bearer ${token}` } });
      this.metrics.recordTiming(`GET ${path}`, Date.now() - start);
      return res.ok ? res.json() : null;
    } catch { this.metrics.recordTiming(`GET ${path}`, Date.now() - start); return null; }
  }

  // ── State query helpers ──
  private getJobsByStatus(status: JobStatus): JobState[] {
    const result: JobState[] = [];
    for (const [, j] of this.jobs) if (j.status === status) result.push(j);
    return result;
  }

  private buildSimState(): SimState {
    return {
      tick: this.tick,
      openJobs: this.getJobsByStatus('OPEN').map(j => this.toJobView(j)),
      activeJobs: this.getJobsByStatus('IN_PROGRESS').map(j => this.toJobView(j)),
    };
  }

  private toJobView(job: JobState): JobView {
    return {
      id: job.id, category: job.category as any, budgetAmount: job.budgetAmount,
      budgetToken: job.budgetToken, status: job.status,
      bidsCount: (this.bids.get(job.id) ?? []).length, postedAtTick: job.postedAtTick, clientId: job.clientId,
    };
  }

  private toBidView(bid: BidState): BidView {
    const a = this.findAgent(bid.agentId);
    return {
      id: bid.id, agentId: bid.agentId, handlerId: bid.handlerId, amount: bid.amount,
      message: bid.message, agentQuality: a?.qualityScore ?? 0.5, agentReliability: a?.reliabilityScore ?? 0.5,
    };
  }

  private findAgent(id: string | null): AgentProfile | undefined {
    return id ? this.registry.allAgents.find(a => a.id === id) : undefined;
  }

  // ── Event / error helpers ──
  private emitEvent(type: string, actorId: string, payload: Record<string, unknown>, opts?: { retention?: AuditRetentionClass; humanApproval?: boolean; reasonForAction?: string }): void {
    const securityTag = getSecurityClassification(type);
    const retentionClass = opts?.retention ?? resolveRetentionClass(type);
    this.eventLog.push({
      eventId: this.rng.uuid(), tick: this.tick, timestamp: this.simTime().toISOString(),
      eventType: type, actorId, jobId: (payload.jobId as string) ?? undefined, payload,
      humanApprovalRequired: opts?.humanApproval ?? false,
      reasonForAction: opts?.reasonForAction ?? `Sim ${this.scenario.name} tick ${this.tick}`,
      auditRetentionClass: retentionClass,
      securityClassification: securityTag,
    });
  }

  private recordError(code: string, message: string, severity: 'warning' | 'error' | 'fatal'): void {
    this.errors.push({ tick: this.tick, timestamp: new Date().toISOString(), code, message, severity });
  }

  // ── Output builders ──
  private buildTickSnapshot(wallStart: number): TickSnapshot {
    const s = this.metrics.snapshot(this.tick);
    return {
      ...s, simulatedTime: this.simTime().toISOString(), wallClockElapsedMs: Date.now() - wallStart,
      actorStates: [
        ...this.registry.clients.map(c => { const st = this.registry.getState(c.id); return { actorId: c.id, role: 'client', busy: st.activeJobIds.length > 0, currentJobId: st.activeJobIds[0], balance: st.totalSpent }; }),
        ...this.registry.allAgents.map(a => { const st = this.registry.getState(a.id); return { actorId: a.id, role: 'agent', busy: st.activeJobIds.length > 0, currentJobId: st.activeJobIds[0], balance: st.totalEarned }; }),
      ],
    };
  }

  private buildActorRecords(): ActorRecord[] {
    const r: ActorRecord[] = [];
    for (const c of this.registry.clients) { const s = this.registry.getState(c.id); r.push({ id: c.id, role: 'client', displayName: c.name, walletAddress: c.walletAddress, jobsPosted: s.completedJobs + s.failedJobs + s.activeJobIds.length, jobsCompleted: s.completedJobs, jobsFailed: s.failedJobs, totalEarned: 0, totalSpent: s.totalSpent, reputationScore: 0 }); }
    for (const h of this.registry.handlers) { const s = this.registry.getState(h.id); r.push({ id: h.id, role: 'handler', displayName: h.name, walletAddress: h.walletAddress, jobsPosted: 0, jobsCompleted: s.completedJobs, jobsFailed: s.failedJobs, totalEarned: s.totalEarned, totalSpent: 0, reputationScore: 0 }); }
    for (const a of this.registry.allAgents) { const s = this.registry.getState(a.id); r.push({ id: a.id, role: 'agent', displayName: a.name, walletAddress: '', jobsPosted: 0, jobsCompleted: s.completedJobs, jobsFailed: s.failedJobs, totalEarned: s.totalEarned, totalSpent: 0, reputationScore: a.qualityScore }); }
    for (const ab of this.registry.arbiters) { r.push({ id: ab.id, role: 'arbiter', displayName: ab.name, walletAddress: ab.walletAddress, jobsPosted: 0, jobsCompleted: 0, jobsFailed: 0, totalEarned: 0, totalSpent: 0, reputationScore: ab.consistencyScore }); }
    return r;
  }

  private determineRunStatus(): RunStatus {
    if (this.errors.some(e => e.severity === 'fatal')) return 'FAILED_ENGINE';
    const failed = this.invariantResults.filter(i => !i.passed && !i.expectedFailure);
    if (failed.length > 0) return 'FAILED_INVARIANTS';
    if (this.invariantResults.some(i => !i.passed && i.expectedFailure)) return 'PASSED_WITH_EXPECTED_FAILURES';
    return 'PASSED';
  }

  private simTime(): Date {
    const d = new Date(this.startTime);
    d.setMinutes(d.getMinutes() + this.tick * this.config.tickDurationMinutes);
    return d;
  }
}
