import { Request, Response, NextFunction } from 'express';

// ─── In-Memory Metrics ──────────────────────────────────────────
// Replace with Prometheus client (prom-client) in production.
// These counters reset on server restart — acceptable for dev,
// but production should use a persistent metrics backend.

interface Metrics {
  requestCount: number;
  errorCount: number;
  requestsByRoute: Map<string, number>;
  requestsByStatus: Map<number, number>;
  requestsByMethod: Map<string, number>;
  latencies: number[];
  startTime: number;
}

const metrics: Metrics = {
  requestCount: 0,
  errorCount: 0,
  requestsByRoute: new Map<string, number>(),
  requestsByStatus: new Map<number, number>(),
  requestsByMethod: new Map<string, number>(),
  latencies: [],
  startTime: Date.now(),
};

const MAX_LATENCY_SAMPLES = 10_000;

// ─── Middleware ──────────────────────────────────────────────────

export function requestMonitoring(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    metrics.requestCount++;

    // Route key: "GET /api/jobs/:id" or falls back to raw path
    const route = `${req.method} ${req.route?.path || req.path}`;
    metrics.requestsByRoute.set(route, (metrics.requestsByRoute.get(route) || 0) + 1);

    // Status code distribution
    metrics.requestsByStatus.set(res.statusCode, (metrics.requestsByStatus.get(res.statusCode) || 0) + 1);

    // Method distribution
    metrics.requestsByMethod.set(req.method, (metrics.requestsByMethod.get(req.method) || 0) + 1);

    // Error tracking (5xx only — 4xx are client errors, not system errors)
    if (res.statusCode >= 500) {
      metrics.errorCount++;
    }

    // Latency ring buffer (shift oldest when full)
    metrics.latencies.push(duration);
    if (metrics.latencies.length > MAX_LATENCY_SAMPLES) {
      metrics.latencies.shift();
    }
  });

  next();
}

// ─── Metrics Accessors ──────────────────────────────────────────

function computeLatencyStats(latencies: number[]) {
  if (latencies.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, count: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const len = sorted.length;

  return {
    min: sorted[0],
    max: sorted[len - 1],
    mean: Math.round(sum / len),
    p50: sorted[Math.floor(len * 0.5)],
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)],
    count: len,
  };
}

export function getMetrics() {
  const uptimeMs = Date.now() - metrics.startTime;

  return {
    uptime: {
      ms: uptimeMs,
      seconds: Math.floor(uptimeMs / 1000),
      human: formatUptime(uptimeMs),
    },
    requests: {
      total: metrics.requestCount,
      errors: metrics.errorCount,
      errorRate: metrics.requestCount > 0
        ? parseFloat((metrics.errorCount / metrics.requestCount * 100).toFixed(2))
        : 0,
    },
    latency: computeLatencyStats(metrics.latencies),
    byRoute: Object.fromEntries(metrics.requestsByRoute),
    byStatus: Object.fromEntries(metrics.requestsByStatus),
    byMethod: Object.fromEntries(metrics.requestsByMethod),
  };
}

export function getHealthData() {
  const uptimeMs = Date.now() - metrics.startTime;

  return {
    status: 'ok',
    timestamp: Date.now(),
    version: '0.1.0',
    uptime: {
      ms: uptimeMs,
      seconds: Math.floor(uptimeMs / 1000),
      human: formatUptime(uptimeMs),
    },
    requests: {
      total: metrics.requestCount,
      errors: metrics.errorCount,
    },
  };
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}
