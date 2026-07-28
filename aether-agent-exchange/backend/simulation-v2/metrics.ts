/**
 * MetricsCollector — gathers throughput, health, reputation, security,
 * and infra telemetry across simulation ticks.
 */
import type { AggregateMetrics, TickSnapshot } from './output-schema';

export class MetricsCollector {
  // Throughput
  private _jobsPosted = 0;
  private _jobsBidOn = 0;
  private _totalBids = 0;
  private _jobsAccepted = 0;
  private _jobsDelivered = 0;
  private _jobsApproved = 0;
  private _jobsDisputed = 0;
  private _jobsResolved = 0;
  private _jobsExpired = 0;
  private _jobsCanceled = 0;

  // Tick-based timing maps (jobId -> tick)
  private _postTick = new Map<string, number>();
  private _firstBidTick = new Map<string, number>();
  private _acceptTick = new Map<string, number>();
  private _deliverTick = new Map<string, number>();
  private _resolveTick = new Map<string, number>();

  // Marketplace health
  private _clientJobs = new Map<string, number>();
  private _matchPairs = new Set<string>();

  // Reputation / economic
  private _ratings: Record<1|2|3|4|5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  private _bidPrices: number[] = [];
  private _acceptedPriceRatios: number[] = [];
  private _premiumWonByHighRep = 0;
  private _totalValueLocked = 0;
  private _totalValueDisbursed = 0;
  private _totalPlatformFees = 0;

  // Security / reliability
  private _authFailures = 0;
  private _rateLimitHits = 0;
  private _rejectedInvalidTransitions = 0;
  private _duplicateBidAttemptsBlocked = 0;
  private _selfDealAttemptsBlocked = 0;
  private _invariantFailures = 0;

  // Infra / telemetry
  private _requestCountByRoute: Record<string, number> = {};
  private _latencies: number[] = [];

  // Per-tick transient counters (reset each snapshot)
  private _tickNewJobs = 0;
  private _tickCompletedJobs = 0;
  private _tickDisputesOpened = 0;
  private _tickEvents = 0;

  record(event: string, data?: any): void {
    this._tickEvents++;
    switch (event) {
      case 'job.posted':
        this._jobsPosted++; this._tickNewJobs++;
        if (data?.jobId && data?.tick != null) this._postTick.set(data.jobId, data.tick);
        if (data?.clientId) this._clientJobs.set(data.clientId, (this._clientJobs.get(data.clientId) ?? 0) + 1);
        break;
      case 'bid.placed':
        this._totalBids++;
        if (data?.jobId && !this._firstBidTick.has(data.jobId)) {
          this._jobsBidOn++;
          if (data?.tick != null) this._firstBidTick.set(data.jobId, data.tick);
        }
        if (data?.price != null) this._bidPrices.push(data.price);
        break;
      case 'bid.accepted':
        this._jobsAccepted++;
        if (data?.jobId && data?.tick != null) this._acceptTick.set(data.jobId, data.tick);
        if (data?.price != null && data?.budget > 0) this._acceptedPriceRatios.push(data.price / data.budget);
        if (data?.clientId && data?.agentId) this._matchPairs.add(`${data.clientId}:${data.agentId}`);
        break;
      case 'job.delivered':
        this._jobsDelivered++;
        if (data?.jobId && data?.tick != null) this._deliverTick.set(data.jobId, data.tick);
        break;
      case 'job.approved':
        this._jobsApproved++; this._tickCompletedJobs++;
        if (data?.disbursed != null) this._totalValueDisbursed += data.disbursed;
        if (data?.fee != null) this._totalPlatformFees += data.fee;
        break;
      case 'job.disputed':
        this._jobsDisputed++; this._tickDisputesOpened++; break;
      case 'job.resolved':
        this._jobsResolved++;
        if (data?.jobId && data?.tick != null) this._resolveTick.set(data.jobId, data.tick);
        // Track disbursement from resolved disputes (avoid double-counting via job.approved)
        if (data?.disbursed != null) this._totalValueDisbursed += data.disbursed;
        if (data?.fee != null) this._totalPlatformFees += data.fee;
        break;
      case 'job.expired':        this._jobsExpired++; break;
      case 'job.canceled':       this._jobsCanceled++; break;
      case 'escrow.funded':
        if (data?.amount != null) this._totalValueLocked += data.amount; break;
      case 'rating.submitted':
        if (data?.rating >= 1 && data?.rating <= 5) this._ratings[data.rating as 1|2|3|4|5]++; break;
      case 'premium.highRep':
        if (data?.amount != null) this._premiumWonByHighRep += data.amount; break;
      case 'auth.failure':          this._authFailures++; break;
      case 'rateLimit.hit':         this._rateLimitHits++; break;
      case 'transition.rejected':   this._rejectedInvalidTransitions++; break;
      case 'bid.duplicate.blocked': this._duplicateBidAttemptsBlocked++; break;
      case 'selfDeal.blocked':      this._selfDealAttemptsBlocked++; break;
      case 'invariant.failure':     this._invariantFailures++; break;
    }
  }

  recordTiming(route: string, durationMs: number): void {
    this._requestCountByRoute[route] = (this._requestCountByRoute[route] ?? 0) + 1;
    this._latencies.push(durationMs);
  }

  snapshot(tick: number): Omit<TickSnapshot, 'simulatedTime' | 'wallClockElapsedMs' | 'actorStates'> {
    const snap = {
      tick,
      activeJobs: this._jobsAccepted - this._jobsApproved - this._jobsDisputed - this._jobsCanceled,
      pendingBids: this._totalBids - this._jobsAccepted,
      escrowBalanceTotal: this._totalValueLocked - this._totalValueDisbursed,
      eventsThisTick: this._tickEvents,
      newJobs: this._tickNewJobs,
      completedJobs: this._tickCompletedJobs,
      disputesOpened: this._tickDisputesOpened,
    };
    this._tickEvents = 0; this._tickNewJobs = 0;
    this._tickCompletedJobs = 0; this._tickDisputesOpened = 0;
    return snap;
  }

  aggregate(): AggregateMetrics & {
    throughput: { jobsPosted: number; jobsBidOn: number; bidsPerJob: number; jobsAccepted: number; jobsDelivered: number; jobsApproved: number; jobsDisputed: number; jobsResolved: number; jobsExpired: number; jobsCanceled: number };
    health: { fillRate: number; approvalRate: number; disputeRate: number; timeToFirstBid: number; timeToAcceptance: number; timeToDelivery: number; timeToResolution: number; staleJobRatio: number; repeatClientRatio: number; repeatMatchRatio: number };
    reputation: { ratingDistribution: Record<1|2|3|4|5, number>; avgBidPrice: number; acceptedPriceVsBudgetRatio: number; premiumWonByHighRepAgents: number };
    security: { authFailures: number; rateLimitHits: number; rejectedInvalidTransitions: number; duplicateBidAttemptsBlocked: number; selfDealAttemptsBlocked: number; invariantFailures: number };
    infra: { requestCountByRoute: Record<string, number>; p50Latency: number; p95Latency: number };
  } {
    const bidsPerJob = this._jobsPosted > 0 ? this._totalBids / this._jobsPosted : 0;
    const fillRate = this._jobsPosted > 0 ? this._jobsAccepted / this._jobsPosted : 0;
    const completed = this._jobsApproved + this._jobsDisputed;
    const approvalRate = completed > 0 ? this._jobsApproved / completed : 0;
    const disputeRate = completed > 0 ? this._jobsDisputed / completed : 0;

    const avgDelta = (start: Map<string, number>, end: Map<string, number>): number => {
      let sum = 0, count = 0;
      end.forEach((endTick, id) => {
        const s = start.get(id);
        if (s != null) { sum += endTick - s; count++; }
      });
      return count > 0 ? sum / count : 0;
    };

    const staleJobs = this._jobsPosted - this._jobsBidOn;
    let repeatClients = 0;
    this._clientJobs.forEach(c => { if (c > 1) repeatClients++; });
    const totalClients = this._clientJobs.size;
    const totalRatings = this._ratings[1] + this._ratings[2] + this._ratings[3] + this._ratings[4] + this._ratings[5];
    const ratingSum = 1*this._ratings[1] + 2*this._ratings[2] + 3*this._ratings[3] + 4*this._ratings[4] + 5*this._ratings[5];
    const avgRating = totalRatings > 0 ? ratingSum / totalRatings : 0;
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const sorted = this._latencies.slice().sort((a, b) => a - b);
    const pct = (p: number) => sorted.length > 0 ? sorted[Math.floor(sorted.length * p)] ?? 0 : 0;
    const cancelledValue = this._totalValueLocked * (this._jobsCanceled / Math.max(this._jobsPosted, 1));
    const dpc = this._totalValueDisbursed + cancelledValue;

    return {
      jobsPosted: this._jobsPosted, jobsBid: this._jobsBidOn, jobsCompleted: this._jobsApproved,
      jobsApproved: this._jobsApproved, jobsAccepted: this._jobsAccepted, jobsResolved: this._jobsResolved,
      jobsDisputed: this._jobsDisputed, jobsCancelled: this._jobsCanceled,
      totalValueLocked: this._totalValueLocked - this._totalValueDisbursed,
      totalValueDisbursed: this._totalValueDisbursed, totalPlatformFees: this._totalPlatformFees,
      avgCompletionTimeTicks: avgDelta(this._acceptTick, this._deliverTick),
      avgBidsPerJob: bidsPerJob, avgRating, disputeRate,
      escrowUtilization: dpc > 0 ? this._totalValueDisbursed / dpc : 0,
      throughput: {
        jobsPosted: this._jobsPosted, jobsBidOn: this._jobsBidOn, bidsPerJob,
        jobsAccepted: this._jobsAccepted, jobsDelivered: this._jobsDelivered,
        jobsApproved: this._jobsApproved, jobsDisputed: this._jobsDisputed,
        jobsResolved: this._jobsResolved, jobsExpired: this._jobsExpired, jobsCanceled: this._jobsCanceled,
      },
      health: {
        fillRate, approvalRate, disputeRate,
        timeToFirstBid: avgDelta(this._postTick, this._firstBidTick),
        timeToAcceptance: avgDelta(this._postTick, this._acceptTick),
        timeToDelivery: avgDelta(this._acceptTick, this._deliverTick),
        timeToResolution: avgDelta(this._acceptTick, this._resolveTick),
        staleJobRatio: this._jobsPosted > 0 ? staleJobs / this._jobsPosted : 0,
        repeatClientRatio: totalClients > 0 ? repeatClients / totalClients : 0,
        repeatMatchRatio: 0, // requires multi-run match tracking
      },
      reputation: {
        ratingDistribution: { ...this._ratings }, avgBidPrice: avg(this._bidPrices),
        acceptedPriceVsBudgetRatio: avg(this._acceptedPriceRatios),
        premiumWonByHighRepAgents: this._premiumWonByHighRep,
      },
      security: {
        authFailures: this._authFailures, rateLimitHits: this._rateLimitHits,
        rejectedInvalidTransitions: this._rejectedInvalidTransitions,
        duplicateBidAttemptsBlocked: this._duplicateBidAttemptsBlocked,
        selfDealAttemptsBlocked: this._selfDealAttemptsBlocked,
        invariantFailures: this._invariantFailures,
      },
      infra: {
        requestCountByRoute: { ...this._requestCountByRoute },
        p50Latency: pct(0.5), p95Latency: pct(0.95),
      },
    };
  }

  reset(): void {
    this._jobsPosted = 0; this._jobsBidOn = 0; this._totalBids = 0;
    this._jobsAccepted = 0; this._jobsDelivered = 0; this._jobsApproved = 0;
    this._jobsDisputed = 0; this._jobsResolved = 0; this._jobsExpired = 0; this._jobsCanceled = 0;
    this._postTick.clear(); this._firstBidTick.clear(); this._acceptTick.clear();
    this._deliverTick.clear(); this._resolveTick.clear();
    this._clientJobs.clear(); this._matchPairs.clear();
    this._ratings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    this._bidPrices = []; this._acceptedPriceRatios = []; this._premiumWonByHighRep = 0;
    this._totalValueLocked = 0; this._totalValueDisbursed = 0; this._totalPlatformFees = 0;
    this._authFailures = 0; this._rateLimitHits = 0; this._rejectedInvalidTransitions = 0;
    this._duplicateBidAttemptsBlocked = 0; this._selfDealAttemptsBlocked = 0; this._invariantFailures = 0;
    this._requestCountByRoute = {}; this._latencies = [];
    this._tickEvents = 0; this._tickNewJobs = 0; this._tickCompletedJobs = 0; this._tickDisputesOpened = 0;
  }
}
