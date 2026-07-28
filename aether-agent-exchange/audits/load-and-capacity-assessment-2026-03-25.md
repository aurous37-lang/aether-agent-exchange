# Load & Capacity Assessment

**Date**: 2026-03-25
**Scope**: Backend API, WebSocket service, database layer, rate limiting infrastructure
**Environment**: Local dev (Node.js single-process + SQLite + Express)
**Method**: Static code analysis — no runtime load testing performed

---

## 1. Executive Summary

No load or performance testing exists in the project. The existing stress test (`stress-test.ts`) validates **correctness** (100 sequential simulations, 2,089 API calls, 28 scenarios each) but does not measure throughput, latency, memory, or concurrency limits.

The architecture has identifiable bottlenecks — SQLite single-writer lock, 10 independent PrismaClient instances, unbounded WebSocket connections, in-memory rate-limit stores — but **none are relevant at the current project stage** (pre-testnet, zero real users, virtual execution only). The PostgreSQL and Redis migrations are already planned.

**Recommendation**: Fix the 7 open audit findings (security/correctness bugs) before investing in performance work. Load testing should happen after testnet deployment with real traffic patterns.

---

## 2. What Has Been Tested

| Attribute | Detail |
|-----------|--------|
| Tool | `backend/test-env/stress-test.ts` |
| Simulations | 100, executed **sequentially** (`CONCURRENCY = 1`) |
| Total API calls | 2,089 |
| Scenarios per sim | 28 (auth, CRUD, guards, disputes, ratings) |
| Auth delay | 350ms between auth calls (to avoid rate limiter) |
| Measures | Correctness (status codes, guard pass rates) |
| Does NOT measure | Requests/sec, latency percentiles, memory, connection limits, disk I/O |

**No load testing tools** (k6, Artillery, autocannon, wrk) are present in the project.

---

## 3. Architectural Bottlenecks Identified

### 3.1 SQLite — Single Writer Lock

SQLite uses file-level locking. One writer at a time for the entire database.

- **Reads**: Effectively unlimited concurrent reads (WAL mode enabled by Prisma)
- **Writes**: Every POST (create job, place bid, submit, rate) queues behind every other write
- **Under concurrent load**: `SQLITE_BUSY` errors or escalating write latency
- **Estimated limit**: ~50-100 concurrent users with mixed read/write before noticeable write delays

**Mitigation (planned)**: PostgreSQL migration prepared in `prisma/schema.postgres.prisma`. Swap provider from `sqlite` to `postgresql` — enables concurrent writers, proper connection pooling, and horizontal scaling.

### 3.2 PrismaClient Instance Sprawl

Every route file instantiates its own `new PrismaClient()`:

| File | Instance |
|------|----------|
| `routes/jobs.ts` | Own PrismaClient |
| `routes/agents.ts` | Own PrismaClient |
| `routes/agent-api.ts` | Own PrismaClient |
| `routes/auth.ts` | Own PrismaClient |
| `routes/disputes.ts` | Own PrismaClient |
| `routes/handler.ts` | Own PrismaClient |
| `routes/reports.ts` | Own PrismaClient |
| `services/scheduler.ts` | Own PrismaClient |
| `services/audit.ts` | Own PrismaClient |
| `middleware/consent.ts` | Own PrismaClient |

**Total**: 10 independent connection pools to the same database.

- Each defaults to ~5 connections = 50 total connections competing for SQLite's single-writer lock
- Memory: ~20-30MB per PrismaClient instance (~200-300MB total, vs ~20-30MB with a shared instance)
- With PostgreSQL, this would mean 50 DB connections instead of 5

**Fix**: Consolidate into a single shared PrismaClient exported from a central module. This is a code quality improvement independent of scale.

### 3.3 WebSocket — Unbounded In-Memory Map

`services/websocket.ts` stores all connected clients with no limits:

- No maximum connection cap — every browser tab opens a persistent WS connection
- Broadcast is O(N) — iterates all clients on every job status change
- No heartbeat/ping mechanism — dead connections linger until TCP timeout
- Memory: ~2-4KB per connection. At 10,000 connections = ~30-40MB for WS state alone

**Estimated limit**: ~5,000-10,000 connections before broadcast latency spikes.

### 3.4 Rate Limiter — In-Memory Store

All 5 rate limiters (`authLimiter`, `nonceLimiter`, `userLimiter`, `agentApiLimiter`, `writeLimiter`) use `express-rate-limit`'s default `MemoryStore`:

- Per-process only — breaks in multi-instance deployments (see audit finding C2)
- Entries accumulate with every unique IP/wallet, no proactive cleanup beyond window expiry
- Redis store is **coded** (`services/redis.ts` with `createRedisRateLimitStore()`) but **not wired** into `server.ts`

### 3.5 Single-Process Node.js

Backend runs as `tsx watch src/server.ts` — one process, one event loop, one core.

- CPU-bound work (bcrypt comparisons, Zod validation, JSON serialization) blocks the event loop
- Agent API auth iterates all active keys per request with `bcrypt.compare()` (~10ms per comparison)
- No clustering (PM2, Node.js cluster module) configured

### 3.6 Scheduler — No Overlap Protection

`setInterval(run, intervalMs)` fires every 60 seconds regardless of whether the previous run completed. If a sweep takes >60s under load, overlapping sweeps can cause duplicate state transitions and double notifications.

---

## 4. Rough Capacity Estimates

| Resource | Bottleneck | Approximate Limit |
|----------|-----------|-------------------|
| Concurrent HTTP users | SQLite write lock + single process | ~50-100 before write latency degrades |
| Requests/sec (reads) | Express + Prisma overhead | ~500-1,000 rps |
| Requests/sec (writes) | SQLite single writer | ~20-50 rps |
| WebSocket connections | Memory + broadcast O(N) | ~5,000-10,000 |
| Database file size | SQLite query performance | ~1GB before degradation |
| Memory (idle) | 10 PrismaClients + Express | ~150-250MB |
| Memory (under load) | + WS + rate-limit maps | ~500MB-1GB at 1,000 concurrent users |

These are estimates based on typical Express/SQLite benchmarks, not measured values from this specific system.

---

## 5. Practical Impact Assessment

Applying Knuth's principle — "premature optimization is the root of all evil" — to each finding:

| Issue | Severity Now | Severity at Testnet (10 users) | Severity in Production (1,000+ users) | Action |
|-------|-------------|-------------------------------|---------------------------------------|--------|
| SQLite write lock | None | None | **Blocking** | PostgreSQL migration already planned. Execute before production. |
| 10 PrismaClient instances | Code smell | Code smell | Memory waste + connection pool exhaustion | Consolidate when convenient. Low effort, clean code benefit. |
| WebSocket unbounded | None | None | **High** — memory leak risk | Add max-connections + heartbeat before production. |
| Rate limiter in-memory | None | None | **Critical** — bypassed in multi-instance | Wire Redis stores (code exists). Already audit finding C2. |
| Single-process | None | None | **Moderate** — underutilizes hardware | Add PM2 or clustering for production. |
| Scheduler overlap | None | None | **Low** — edge case under extreme load | Add overlap guard before production. |
| No load testing | None | **Low** — baseline unknown | **High** — deploying blind | Build k6 scripts after testnet, before production. |

**Bottom line**: None of these bottlenecks are blocking for the current milestone (testnet deployment). All have known fixes. The 7 open security/correctness audit findings are higher priority.

---

## 6. Recommended Load Testing Approach (When Ready)

### Tool

[k6](https://k6.io/) — runs locally, scriptable in JavaScript, measures latency percentiles, integrates with Grafana.

### Scenarios to Test

1. **Ramp test**: 1 → 100 virtual users over 2 minutes, sustained for 5 minutes. Mixed 70% reads / 30% writes.
2. **Write burst**: 50 concurrent job creation requests. Measures SQLite write contention (or PostgreSQL throughput post-migration).
3. **WebSocket fan-out**: Ramp 100 → 1,000 WS connections, each subscribing to a channel. Trigger 10 broadcasts/sec, measure delivery latency.
4. **Auth throughput**: 100 concurrent nonce + verify flows. Measures bcrypt cost + rate limiter behavior.
5. **Sustained load**: 50 concurrent users for 30 minutes. Monitors memory growth, GC pauses, connection pool health.

### Metrics to Capture

- p50 / p95 / p99 response latency
- Error rate (4xx, 5xx)
- Requests per second (achieved)
- Node.js heap usage over time
- SQLite WAL file size (or PostgreSQL connection pool utilization)
- WebSocket message delivery latency

### When to Run

- **After testnet deployment** — system will have real contract integration, changing the performance profile
- **After PostgreSQL migration** — removes the most significant bottleneck, making results representative
- **Before production** — establish baseline and set SLOs (e.g., p99 < 200ms for reads, p99 < 500ms for writes)

### Hardware Baseline

Record these for reproducible results:
- CPU model and core count
- RAM (total and available)
- Disk type (SSD/NVMe) and sequential write speed
- Node.js version
- OS and kernel version

---

## 7. Fixes Prioritized by Impact-to-Effort Ratio

| Priority | Fix | Effort | Impact | When |
|----------|-----|--------|--------|------|
| 1 | Fix 7 audit findings (C1-C3, H1-H4) | 1-2 days | Security/correctness — blocks testnet | **Now** |
| 2 | Shared PrismaClient singleton | 30 min | Code quality, -80% DB memory | Before testnet |
| 3 | PostgreSQL migration | 2-4 hours | Removes write bottleneck | Before production |
| 4 | Wire Redis rate-limit stores | 1-2 hours | Production-safe rate limiting | Before production |
| 5 | WS connection limits + heartbeat | 1-2 hours | Prevents memory leak at scale | Before production |
| 6 | PM2 / clustering | 1 hour | Multi-core utilization | Before production |
| 7 | Scheduler overlap guard | 30 min | Prevents duplicate sweeps | Before production |
| 8 | k6 load test suite | 4-8 hours | Establishes performance baseline | After PostgreSQL migration |

---

## 8. Relationship to Open Audit Findings

The 7 open audit findings from the Task Force review (2026-03-22) are **correctness and security bugs**, not performance issues. They exist at any scale, even with a single user:

| Finding | Type | Overlap with Load Concerns |
|---------|------|---------------------------|
| C1: Accept without bid verification | Logic bug | None |
| C2: Redis mandatory in production | Deployment | Overlaps with §3.4 (rate limiter in-memory) |
| C3: Bcrypt cost not enforced | Security | Overlaps with §3.5 (bcrypt CPU cost in single-process) |
| H1: Scheduler jitter | Timing attack | Overlaps with §3.6 (scheduler overlap) |
| H2: Nonce rate limit gap | Security | Overlaps with §3.4 (rate limiter design) |
| H3: Action log data leak | Privacy | None |
| H4: Vote truncation in Solidity | Math bug | None |

C2 and the rate-limiter capacity concern are the same underlying issue (in-memory stores). Fixing C2 (enforcing Redis in production) also resolves the capacity concern.

---

*Assessment completed 2026-03-25. No runtime measurements taken — all estimates are based on static analysis and typical benchmarks for the technology stack. Revisit after testnet deployment with real traffic data.*
