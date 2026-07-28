/**
 * Structured output types for Simulation V2 runs.
 */

import type { SimConfig } from './config';
import type { RunTelemetry } from './telemetry/schema';

// ---------------------------------------------------------------------------
// Top-level run output
// ---------------------------------------------------------------------------

export interface RunOutput {
  runId: string;
  seed: string;
  scenarioName: string;
  startTime: string;       // ISO-8601
  endTime: string;         // ISO-8601
  tickCount: number;
  config: SimConfig;
  actorSummary: ActorSummary;
  aggregateMetrics: AggregateMetrics;
  tickSnapshots?: TickSnapshot[];
  invariantResults: InvariantResult[];
  errorSummary: ErrorSummary;
  telemetry?: RunTelemetry;
  eventLogPath: string;
  status: RunStatus;
}

export type RunStatus =
  | 'PASSED'
  | 'PASSED_WITH_EXPECTED_FAILURES'
  | 'FAILED_INVARIANTS'
  | 'FAILED_ENGINE';

// ---------------------------------------------------------------------------
// Actor summary
// ---------------------------------------------------------------------------

export interface ActorSummary {
  totalClients: number;
  totalHandlers: number;
  totalAgents: number;
  totalArbiters: number;
  activeClients: number;
  activeHandlers: number;
  activeAgents: number;
  actors: ActorRecord[];
}

export interface ActorRecord {
  id: string;
  role: 'client' | 'handler' | 'agent' | 'arbiter';
  displayName: string;
  walletAddress: string;
  jobsPosted: number;
  jobsCompleted: number;
  jobsFailed: number;
  totalEarned: number;
  totalSpent: number;
  reputationScore: number;
}

// ---------------------------------------------------------------------------
// Aggregate metrics
// ---------------------------------------------------------------------------

export interface AggregateMetrics {
  jobsPosted: number;
  jobsBid: number;
  jobsCompleted: number;
  jobsApproved: number;
  jobsAccepted: number;
  jobsResolved: number;
  jobsDisputed: number;
  jobsCancelled: number;
  totalValueLocked: number;       // sum of active escrows
  totalValueDisbursed: number;
  totalPlatformFees: number;
  avgCompletionTimeTicks: number;
  avgBidsPerJob: number;
  avgRating: number;
  disputeRate: number;            // disputes / completed
  escrowUtilization: number;      // disbursed / (disbursed + cancelled)
}

// ---------------------------------------------------------------------------
// Tick snapshot
// ---------------------------------------------------------------------------

export interface TickSnapshot {
  tick: number;
  simulatedTime: string;          // ISO-8601
  wallClockElapsedMs: number;
  activeJobs: number;
  pendingBids: number;
  escrowBalanceTotal: number;
  eventsThisTick: number;
  newJobs: number;
  completedJobs: number;
  disputesOpened: number;
  actorStates: ActorTickState[];
}

export interface ActorTickState {
  actorId: string;
  role: string;
  busy: boolean;
  currentJobId?: string;
  balance: number;
}

// ---------------------------------------------------------------------------
// Invariant results
// ---------------------------------------------------------------------------

export interface InvariantResult {
  invariantId: string;
  name: string;
  description: string;
  passed: boolean;
  expectedFailure: boolean;       // marks known/accepted deviations
  actual: string;
  expected: string;
  tick?: number;                  // tick at which violation occurred
  severity: 'info' | 'warning' | 'critical';
}

// ---------------------------------------------------------------------------
// Error summary
// ---------------------------------------------------------------------------

export interface ErrorSummary {
  totalErrors: number;
  totalWarnings: number;
  fatalError?: string;
  errors: SimError[];
}

export interface SimError {
  tick: number;
  timestamp: string;              // ISO-8601
  code: string;
  message: string;
  actorId?: string;
  jobId?: string;
  stackTrace?: string;
  severity: 'warning' | 'error' | 'fatal';
}

// ---------------------------------------------------------------------------
// Simulation event (governance-grade audit trail)
// ---------------------------------------------------------------------------

export interface SimEvent {
  eventId: string;
  tick: number;
  timestamp: string;              // ISO-8601
  eventType: string;
  actorId: string;
  jobId?: string;
  payload: Record<string, unknown>;

  // Governance & audit fields
  humanApprovalRequired: boolean;
  reasonForAction: string;
  modelOrAgentVersion?: string;
  auditRetentionClass: AuditRetentionClass;
  securityClassification?: string;  // OWASP tag, e.g. "A01:2021-Broken Access Control"
}

export type AuditRetentionClass = 'standard' | 'compliance' | 'governance';
