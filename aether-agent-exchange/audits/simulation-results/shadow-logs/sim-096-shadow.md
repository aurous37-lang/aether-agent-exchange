# Shadow Log: Simulation 96

**Started**: 2026-03-22T17:49:20.307Z
**Ended**: 2026-03-22T17:49:21.304Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:20.307 | Sim96-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:20.325 | Sim96-Client | Verify signature | POST /auth/verify | OK | 18ms |
| 3 | 17:49:20.678 | Sim96-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:20.693 | Sim96-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:49:20.714 | Sim96-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:49:20.727 | Sim96-Client | Post job 1 (happy path) | POST /jobs | OK | 13ms |
| 7 | 17:49:20.737 | Sim96-Client | Post job 2 (dispute path) | POST /jobs | OK | 10ms |
| 8 | 17:49:20.739 | Sim96-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:49:20.741 | Sim96-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:20.744 | Sim96-Client | Search jobs | GET /jobs?search=Sim96 | OK | 3ms |
| 11 | 17:49:20.746 | Sim96-Client | Get job detail | GET /jobs/166d8a01-a021-4a6d-bbd2-c21532523e7c | OK | 2ms |
| 12 | 17:49:20.757 | Sim96-Handler | Place bid on job 1 | POST /jobs/166d8a01-a021-4a6d-bbd2-c21532523e7c/bid | OK | 11ms |
| 13 | 17:49:20.761 | Sim96-Handler | Duplicate bid (expect 409) | POST /jobs/166d8a01-a021-4a6d-bbd2-c21532523e7c/bid | EXP_FAIL | 4ms |
| 14 | 17:49:20.780 | Sim96-Client | Register client agent for self-deal test | POST /agents | OK | 19ms |
| 15 | 17:49:20.784 | Sim96-Client | Self-deal bid (expect 403) | POST /jobs/166d8a01-a021-4a6d-bbd2-c21532523e7c/bid | EXP_FAIL | 4ms |
| 16 | 17:49:20.796 | Sim96-Handler | Accept bid on job 1 | POST /jobs/166d8a01-a021-4a6d-bbd2-c21532523e7c/accept | OK | 12ms |
| 17 | 17:49:20.815 | Sim96-Handler | Submit deliverable | POST /jobs/166d8a01-a021-4a6d-bbd2-c21532523e7c/submit | OK | 19ms |
| 18 | 17:49:20.825 | Sim96-Client | Approve deliverable | POST /jobs/166d8a01-a021-4a6d-bbd2-c21532523e7c/approve | OK | 10ms |
| 19 | 17:49:20.843 | Sim96-Client | Rate agent | POST /jobs/166d8a01-a021-4a6d-bbd2-c21532523e7c/rate | OK | 18ms |
| 20 | 17:49:20.846 | Sim96-Client | Duplicate rating (expect 409) | POST /jobs/166d8a01-a021-4a6d-bbd2-c21532523e7c/rate | EXP_FAIL | 3ms |
| 21 | 17:49:20.855 | Sim96-Handler | Bid on job 2 | POST /jobs/3652495c-2d75-41fd-a421-adc4f26d04e7/bid | OK | 9ms |
| 22 | 17:49:20.865 | Sim96-Handler | Accept job 2 | POST /jobs/3652495c-2d75-41fd-a421-adc4f26d04e7/accept | OK | 10ms |
| 23 | 17:49:20.883 | Sim96-Handler | Submit deliverable job 2 | POST /jobs/3652495c-2d75-41fd-a421-adc4f26d04e7/submit | OK | 18ms |
| 24 | 17:49:20.901 | Sim96-Client | File dispute | POST /jobs/3652495c-2d75-41fd-a421-adc4f26d04e7/dispute | OK | 18ms |
| 25 | 17:49:20.910 | Sim96-Client | Submit evidence | POST /disputes/3125c3a8-1a6c-44cc-a03b-4042d17a9e6e/evidence | OK | 9ms |
| 26 | 17:49:21.262 | Sim96-Arbiter1 | Request nonce | POST /auth/nonce | OK | 1ms |
| 27 | 17:49:21.276 | Sim96-Arbiter1 | Verify signature | POST /auth/verify | OK | 13ms |
| 28 | 17:49:21.278 | Sim96-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/3125c3a8-1a6c-44cc-a03b-4042d17a9e6e/vote | EXP_FAIL | 2ms |
| 29 | 17:49:21.281 | Sim96-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 30 | 17:49:21.283 | Sim96-Handler | Get agent detail | GET /agents/4c3f8c0c-4829-40ba-ad6c-4375dd6a605e | OK | 2ms |
| 31 | 17:49:21.294 | Sim96-Handler | Update agent | PUT /agents/4c3f8c0c-4829-40ba-ad6c-4375dd6a605e | OK | 11ms |
| 32 | 17:49:21.297 | Sim96-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 33 | 17:49:21.298 | Sim96-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 34 | 17:49:21.299 | Sim96-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 35 | 17:49:21.300 | Sim96-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 36 | 17:49:21.301 | Sim96-Handler | Agent job history | GET /agents/4c3f8c0c-4829-40ba-ad6c-4375dd6a605e/jobs | OK | 1ms |
| 37 | 17:49:21.302 | Sim96-Handler | Agent earnings | GET /agents/4c3f8c0c-4829-40ba-ad6c-4375dd6a605e/earnings | OK | 1ms |
| 38 | 17:49:21.303 | Sim96-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:49:21.304 | Sim96-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 40 | 17:49:21.304 | Sim96-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 8: Post job 3 (edge cases)
- **Error**: Validation failed

### Event 13: Duplicate bid (expect 409)
- **Note**: Expected failure: Bid already placed for this agent on this job

### Event 15: Self-deal bid (expect 403)
- **Note**: Expected failure: Cannot bid on your own job

### Event 20: Duplicate rating (expect 409)
- **Note**: Expected failure: You have already rated this job

### Event 28: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 38: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 39: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

