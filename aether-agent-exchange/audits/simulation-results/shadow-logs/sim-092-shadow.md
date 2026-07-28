# Shadow Log: Simulation 92

**Started**: 2026-03-22T17:49:15.873Z
**Ended**: 2026-03-22T17:49:16.867Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:15.873 | Sim92-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:15.889 | Sim92-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:49:16.243 | Sim92-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:49:16.258 | Sim92-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:49:16.278 | Sim92-Handler | Register agent | POST /agents | OK | 20ms |
| 6 | 17:49:16.289 | Sim92-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:49:16.299 | Sim92-Client | Post job 2 (dispute path) | POST /jobs | OK | 10ms |
| 8 | 17:49:16.301 | Sim92-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:49:16.303 | Sim92-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:16.305 | Sim92-Client | Search jobs | GET /jobs?search=Sim92 | OK | 2ms |
| 11 | 17:49:16.308 | Sim92-Client | Get job detail | GET /jobs/b3f817a5-3da3-439e-bb75-2a0f0126de18 | OK | 3ms |
| 12 | 17:49:16.321 | Sim92-Handler | Place bid on job 1 | POST /jobs/b3f817a5-3da3-439e-bb75-2a0f0126de18/bid | OK | 13ms |
| 13 | 17:49:16.325 | Sim92-Handler | Duplicate bid (expect 409) | POST /jobs/b3f817a5-3da3-439e-bb75-2a0f0126de18/bid | EXP_FAIL | 4ms |
| 14 | 17:49:16.341 | Sim92-Client | Register client agent for self-deal test | POST /agents | OK | 16ms |
| 15 | 17:49:16.344 | Sim92-Client | Self-deal bid (expect 403) | POST /jobs/b3f817a5-3da3-439e-bb75-2a0f0126de18/bid | EXP_FAIL | 3ms |
| 16 | 17:49:16.352 | Sim92-Handler | Accept bid on job 1 | POST /jobs/b3f817a5-3da3-439e-bb75-2a0f0126de18/accept | OK | 8ms |
| 17 | 17:49:16.371 | Sim92-Handler | Submit deliverable | POST /jobs/b3f817a5-3da3-439e-bb75-2a0f0126de18/submit | OK | 19ms |
| 18 | 17:49:16.381 | Sim92-Client | Approve deliverable | POST /jobs/b3f817a5-3da3-439e-bb75-2a0f0126de18/approve | OK | 10ms |
| 19 | 17:49:16.398 | Sim92-Client | Rate agent | POST /jobs/b3f817a5-3da3-439e-bb75-2a0f0126de18/rate | OK | 17ms |
| 20 | 17:49:16.402 | Sim92-Client | Duplicate rating (expect 409) | POST /jobs/b3f817a5-3da3-439e-bb75-2a0f0126de18/rate | EXP_FAIL | 4ms |
| 21 | 17:49:16.412 | Sim92-Handler | Bid on job 2 | POST /jobs/3456c3bf-43ab-4e17-8df1-ad5552b6578b/bid | OK | 10ms |
| 22 | 17:49:16.421 | Sim92-Handler | Accept job 2 | POST /jobs/3456c3bf-43ab-4e17-8df1-ad5552b6578b/accept | OK | 9ms |
| 23 | 17:49:16.439 | Sim92-Handler | Submit deliverable job 2 | POST /jobs/3456c3bf-43ab-4e17-8df1-ad5552b6578b/submit | OK | 18ms |
| 24 | 17:49:16.456 | Sim92-Client | File dispute | POST /jobs/3456c3bf-43ab-4e17-8df1-ad5552b6578b/dispute | OK | 17ms |
| 25 | 17:49:16.466 | Sim92-Client | Submit evidence | POST /disputes/497b952d-6841-4508-923d-6c845c28ddc2/evidence | OK | 9ms |
| 26 | 17:49:16.818 | Sim92-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:49:16.834 | Sim92-Arbiter1 | Verify signature | POST /auth/verify | OK | 15ms |
| 28 | 17:49:16.836 | Sim92-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/497b952d-6841-4508-923d-6c845c28ddc2/vote | EXP_FAIL | 2ms |
| 29 | 17:49:16.839 | Sim92-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 30 | 17:49:16.841 | Sim92-Handler | Get agent detail | GET /agents/0ff627a0-2172-41c8-a57e-5ed71bd52504 | OK | 2ms |
| 31 | 17:49:16.852 | Sim92-Handler | Update agent | PUT /agents/0ff627a0-2172-41c8-a57e-5ed71bd52504 | OK | 11ms |
| 32 | 17:49:16.855 | Sim92-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 33 | 17:49:16.857 | Sim92-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 34 | 17:49:16.858 | Sim92-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 35 | 17:49:16.860 | Sim92-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 36 | 17:49:16.862 | Sim92-Handler | Agent job history | GET /agents/0ff627a0-2172-41c8-a57e-5ed71bd52504/jobs | OK | 2ms |
| 37 | 17:49:16.864 | Sim92-Handler | Agent earnings | GET /agents/0ff627a0-2172-41c8-a57e-5ed71bd52504/earnings | OK | 2ms |
| 38 | 17:49:16.865 | Sim92-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:49:16.867 | Sim92-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 40 | 17:49:16.867 | Sim92-NoAuth | Health check | GET /health | OK | 0ms |

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

