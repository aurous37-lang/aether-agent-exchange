# Shadow Log: Simulation 29

**Started**: 2026-03-22T17:48:20.824Z
**Ended**: 2026-03-22T17:48:21.855Z
**Total Events**: 42
**OK**: 36 | **FAIL**: 0 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:20.824 | Sim29-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:20.839 | Sim29-Client | Verify signature | POST /auth/verify | OK | 14ms |
| 3 | 17:48:21.192 | Sim29-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:21.209 | Sim29-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:21.231 | Sim29-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:48:21.243 | Sim29-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:21.254 | Sim29-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:48:21.264 | Sim29-Client | Post job 3 (edge cases) | POST /jobs | OK | 10ms |
| 9 | 17:48:21.266 | Sim29-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:21.268 | Sim29-Client | Search jobs | GET /jobs?search=Sim29 | OK | 2ms |
| 11 | 17:48:21.270 | Sim29-Client | Get job detail | GET /jobs/60732d3c-7e4f-463b-b983-e5da73ae1dde | OK | 2ms |
| 12 | 17:48:21.282 | Sim29-Handler | Place bid on job 1 | POST /jobs/60732d3c-7e4f-463b-b983-e5da73ae1dde/bid | OK | 12ms |
| 13 | 17:48:21.285 | Sim29-Handler | Duplicate bid (expect 409) | POST /jobs/60732d3c-7e4f-463b-b983-e5da73ae1dde/bid | EXP_FAIL | 3ms |
| 14 | 17:48:21.301 | Sim29-Client | Register client agent for self-deal test | POST /agents | OK | 16ms |
| 15 | 17:48:21.304 | Sim29-Client | Self-deal bid (expect 403) | POST /jobs/60732d3c-7e4f-463b-b983-e5da73ae1dde/bid | EXP_FAIL | 3ms |
| 16 | 17:48:21.316 | Sim29-Handler | Accept bid on job 1 | POST /jobs/60732d3c-7e4f-463b-b983-e5da73ae1dde/accept | OK | 12ms |
| 17 | 17:48:21.335 | Sim29-Handler | Submit deliverable | POST /jobs/60732d3c-7e4f-463b-b983-e5da73ae1dde/submit | OK | 19ms |
| 18 | 17:48:21.345 | Sim29-Client | Approve deliverable | POST /jobs/60732d3c-7e4f-463b-b983-e5da73ae1dde/approve | OK | 10ms |
| 19 | 17:48:21.363 | Sim29-Client | Rate agent | POST /jobs/60732d3c-7e4f-463b-b983-e5da73ae1dde/rate | OK | 18ms |
| 20 | 17:48:21.365 | Sim29-Client | Duplicate rating (expect 409) | POST /jobs/60732d3c-7e4f-463b-b983-e5da73ae1dde/rate | EXP_FAIL | 2ms |
| 21 | 17:48:21.375 | Sim29-Handler | Bid on job 2 | POST /jobs/f5c2e722-e215-4a5a-9d09-517ce491650e/bid | OK | 10ms |
| 22 | 17:48:21.386 | Sim29-Handler | Accept job 2 | POST /jobs/f5c2e722-e215-4a5a-9d09-517ce491650e/accept | OK | 11ms |
| 23 | 17:48:21.405 | Sim29-Handler | Submit deliverable job 2 | POST /jobs/f5c2e722-e215-4a5a-9d09-517ce491650e/submit | OK | 19ms |
| 24 | 17:48:21.424 | Sim29-Client | File dispute | POST /jobs/f5c2e722-e215-4a5a-9d09-517ce491650e/dispute | OK | 19ms |
| 25 | 17:48:21.434 | Sim29-Client | Submit evidence | POST /disputes/11c1efd3-12f2-4297-b7c0-d939556198bf/evidence | OK | 10ms |
| 26 | 17:48:21.786 | Sim29-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:48:21.803 | Sim29-Arbiter1 | Verify signature | POST /auth/verify | OK | 16ms |
| 28 | 17:48:21.805 | Sim29-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/11c1efd3-12f2-4297-b7c0-d939556198bf/vote | EXP_FAIL | 2ms |
| 29 | 17:48:21.816 | Sim29-Client | Update open job | PUT /jobs/e594d991-d917-4b78-bbe7-9d778bba121d | OK | 11ms |
| 30 | 17:48:21.827 | Sim29-Client | Cancel open job | DELETE /jobs/e594d991-d917-4b78-bbe7-9d778bba121d | OK | 11ms |
| 31 | 17:48:21.829 | Sim29-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 32 | 17:48:21.832 | Sim29-Handler | Get agent detail | GET /agents/28c2a04f-bfac-4280-b03c-7d6ca7453fd2 | OK | 3ms |
| 33 | 17:48:21.843 | Sim29-Handler | Update agent | PUT /agents/28c2a04f-bfac-4280-b03c-7d6ca7453fd2 | OK | 11ms |
| 34 | 17:48:21.846 | Sim29-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 35 | 17:48:21.848 | Sim29-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 36 | 17:48:21.849 | Sim29-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 37 | 17:48:21.850 | Sim29-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 38 | 17:48:21.851 | Sim29-Handler | Agent job history | GET /agents/28c2a04f-bfac-4280-b03c-7d6ca7453fd2/jobs | OK | 1ms |
| 39 | 17:48:21.853 | Sim29-Handler | Agent earnings | GET /agents/28c2a04f-bfac-4280-b03c-7d6ca7453fd2/earnings | OK | 2ms |
| 40 | 17:48:21.854 | Sim29-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 41 | 17:48:21.855 | Sim29-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 42 | 17:48:21.855 | Sim29-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 13: Duplicate bid (expect 409)
- **Note**: Expected failure: Bid already placed for this agent on this job

### Event 15: Self-deal bid (expect 403)
- **Note**: Expected failure: Cannot bid on your own job

### Event 20: Duplicate rating (expect 409)
- **Note**: Expected failure: You have already rated this job

### Event 28: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 40: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 41: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

