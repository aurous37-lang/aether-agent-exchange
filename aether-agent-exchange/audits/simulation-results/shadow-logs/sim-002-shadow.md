# Shadow Log: Simulation 2

**Started**: 2026-03-22T17:47:50.853Z
**Ended**: 2026-03-22T17:47:51.451Z
**Total Events**: 34
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:47:50.853 | Sim2-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:47:50.872 | Sim2-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:47:51.226 | Sim2-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:47:51.244 | Sim2-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:47:51.267 | Sim2-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:47:51.279 | Sim2-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:47:51.281 | Sim2-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:47:51.293 | Sim2-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:47:51.296 | Sim2-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:47:51.299 | Sim2-Client | Search jobs | GET /jobs?search=Sim2 | OK | 3ms |
| 11 | 17:47:51.301 | Sim2-Client | Get job detail | GET /jobs/9448700d-5ddb-49f5-85c1-35a8eec7faca | OK | 2ms |
| 12 | 17:47:51.313 | Sim2-Handler | Place bid on job 1 | POST /jobs/9448700d-5ddb-49f5-85c1-35a8eec7faca/bid | OK | 12ms |
| 13 | 17:47:51.316 | Sim2-Handler | Duplicate bid (expect 409) | POST /jobs/9448700d-5ddb-49f5-85c1-35a8eec7faca/bid | EXP_FAIL | 3ms |
| 14 | 17:47:51.334 | Sim2-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:47:51.337 | Sim2-Client | Self-deal bid (expect 403) | POST /jobs/9448700d-5ddb-49f5-85c1-35a8eec7faca/bid | EXP_FAIL | 3ms |
| 16 | 17:47:51.346 | Sim2-Handler | Accept bid on job 1 | POST /jobs/9448700d-5ddb-49f5-85c1-35a8eec7faca/accept | OK | 9ms |
| 17 | 17:47:51.364 | Sim2-Handler | Submit deliverable | POST /jobs/9448700d-5ddb-49f5-85c1-35a8eec7faca/submit | OK | 18ms |
| 18 | 17:47:51.374 | Sim2-Client | Approve deliverable | POST /jobs/9448700d-5ddb-49f5-85c1-35a8eec7faca/approve | OK | 10ms |
| 19 | 17:47:51.393 | Sim2-Client | Rate agent | POST /jobs/9448700d-5ddb-49f5-85c1-35a8eec7faca/rate | OK | 19ms |
| 20 | 17:47:51.397 | Sim2-Client | Duplicate rating (expect 409) | POST /jobs/9448700d-5ddb-49f5-85c1-35a8eec7faca/rate | EXP_FAIL | 4ms |
| 21 | 17:47:51.408 | Sim2-Client | Update open job | PUT /jobs/60c91855-fc05-4a70-963f-135377c0d1dc | OK | 11ms |
| 22 | 17:47:51.419 | Sim2-Client | Cancel open job | DELETE /jobs/60c91855-fc05-4a70-963f-135377c0d1dc | OK | 11ms |
| 23 | 17:47:51.422 | Sim2-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 24 | 17:47:51.426 | Sim2-Handler | Get agent detail | GET /agents/48594c55-5661-4719-b706-901a0e1a3a0c | OK | 4ms |
| 25 | 17:47:51.435 | Sim2-Handler | Update agent | PUT /agents/48594c55-5661-4719-b706-901a0e1a3a0c | OK | 9ms |
| 26 | 17:47:51.439 | Sim2-Handler | Handler dashboard | GET /handler/dashboard | OK | 4ms |
| 27 | 17:47:51.442 | Sim2-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 28 | 17:47:51.444 | Sim2-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 29 | 17:47:51.446 | Sim2-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 30 | 17:47:51.447 | Sim2-Handler | Agent job history | GET /agents/48594c55-5661-4719-b706-901a0e1a3a0c/jobs | OK | 1ms |
| 31 | 17:47:51.449 | Sim2-Handler | Agent earnings | GET /agents/48594c55-5661-4719-b706-901a0e1a3a0c/earnings | OK | 2ms |
| 32 | 17:47:51.449 | Sim2-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 33 | 17:47:51.451 | Sim2-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 34 | 17:47:51.451 | Sim2-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 7: Post job 2 (dispute path)
- **Error**: Validation failed

### Event 13: Duplicate bid (expect 409)
- **Note**: Expected failure: Bid already placed for this agent on this job

### Event 15: Self-deal bid (expect 403)
- **Note**: Expected failure: Cannot bid on your own job

### Event 20: Duplicate rating (expect 409)
- **Note**: Expected failure: You have already rated this job

### Event 32: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 33: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

