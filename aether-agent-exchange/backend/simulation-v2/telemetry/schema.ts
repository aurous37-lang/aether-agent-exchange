/**
 * AAE Simulation v2 — Telemetry Schema
 *
 * Version-controlled telemetry types compatible with OpenTelemetry concepts.
 * These types are used to instrument simulation runs with structured traces,
 * spans, and metrics for observability and post-run analysis.
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

export const TELEMETRY_SCHEMA_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Cardinality budget constants
// ---------------------------------------------------------------------------

/** Maximum number of unique span operation names per run. */
export const MAX_SPAN_OPERATION_CARDINALITY = 200;

/** Maximum number of attribute keys per span. */
export const MAX_SPAN_ATTRIBUTES = 32;

/** Maximum number of events per span. */
export const MAX_EVENTS_PER_SPAN = 128;

/** Maximum number of spans per run before sampling kicks in. */
export const MAX_SPANS_PER_RUN = 50_000;

/** Maximum number of metrics per run. */
export const MAX_METRICS_PER_RUN = 10_000;

/** Maximum attribute value string length before truncation. */
export const MAX_ATTRIBUTE_VALUE_LENGTH = 1024;

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface TelemetryEvent {
  name: string;
  timestamp: string; // ISO 8601
  attributes: Record<string, string | number | boolean>;
}

export interface TelemetrySpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  durationMs: number;
  attributes: Record<string, string | number | boolean>;
  events: TelemetryEvent[];
  status: 'OK' | 'ERROR';
}

export interface TelemetryMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  value: number;
  unit: string;
  timestamp: string; // ISO 8601
  attributes: Record<string, string>;
}

export interface RunTelemetry {
  schemaVersion: string;
  runCorrelationId: string;
  spans: TelemetrySpan[];
  metrics: TelemetryMetric[];
}

// ---------------------------------------------------------------------------
// Factory & helpers
// ---------------------------------------------------------------------------

/**
 * Create a new RunTelemetry container for a simulation run.
 *
 * @param runId - The simulation run ID to use as the correlation identifier.
 * @returns A fresh RunTelemetry object with empty spans and metrics arrays.
 */
export function createRunTelemetry(runId: string): RunTelemetry {
  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    runCorrelationId: runId,
    spans: [],
    metrics: [],
  };
}

/**
 * Append a span to the telemetry container.
 * Enforces the cardinality budget — if MAX_SPANS_PER_RUN is exceeded,
 * the span is silently dropped and the function returns false.
 *
 * @param telemetry - The RunTelemetry container to mutate.
 * @param span - The span to add.
 * @returns true if the span was added, false if it was dropped due to budget.
 */
export function addSpan(
  telemetry: RunTelemetry,
  span: TelemetrySpan
): boolean {
  if (telemetry.spans.length >= MAX_SPANS_PER_RUN) {
    return false;
  }
  telemetry.spans.push(span);
  return true;
}

/**
 * Append a metric to the telemetry container.
 * Enforces the cardinality budget — if MAX_METRICS_PER_RUN is exceeded,
 * the metric is silently dropped and the function returns false.
 *
 * @param telemetry - The RunTelemetry container to mutate.
 * @param metric - The metric to add.
 * @returns true if the metric was added, false if it was dropped due to budget.
 */
export function addMetric(
  telemetry: RunTelemetry,
  metric: TelemetryMetric
): boolean {
  if (telemetry.metrics.length >= MAX_METRICS_PER_RUN) {
    return false;
  }
  telemetry.metrics.push(metric);
  return true;
}

/**
 * Create a new span with auto-generated IDs and timing.
 * The caller is responsible for setting endTime and durationMs
 * when the operation completes (see `finishSpan`).
 *
 * @param operationName - The logical name of the operation.
 * @param traceId - The trace ID to associate with (use the run's correlation ID or a parent trace).
 * @param parentSpanId - Optional parent span ID for nested operations.
 * @returns A partially-initialized TelemetrySpan (endTime = startTime, durationMs = 0).
 */
export function startSpan(
  operationName: string,
  traceId: string,
  parentSpanId?: string
): TelemetrySpan {
  const now = new Date().toISOString();
  return {
    traceId,
    spanId: randomUUID(),
    parentSpanId,
    operationName,
    startTime: now,
    endTime: now,
    durationMs: 0,
    attributes: {},
    events: [],
    status: 'OK',
  };
}

/**
 * Finalize a span by recording its end time and computing duration.
 *
 * @param span - The span to finalize (mutated in place).
 * @param status - Final status of the operation.
 */
export function finishSpan(
  span: TelemetrySpan,
  status: 'OK' | 'ERROR' = 'OK'
): void {
  const end = new Date();
  span.endTime = end.toISOString();
  span.durationMs = end.getTime() - new Date(span.startTime).getTime();
  span.status = status;
}

/**
 * Add an event to a span, respecting the per-span event cardinality budget.
 *
 * @param span - The span to attach the event to.
 * @param name - Event name.
 * @param attributes - Key-value pairs describing the event.
 * @returns true if the event was added, false if the budget was exceeded.
 */
export function addSpanEvent(
  span: TelemetrySpan,
  name: string,
  attributes: Record<string, string | number | boolean> = {}
): boolean {
  if (span.events.length >= MAX_EVENTS_PER_SPAN) {
    return false;
  }
  span.events.push({
    name,
    timestamp: new Date().toISOString(),
    attributes,
  });
  return true;
}
