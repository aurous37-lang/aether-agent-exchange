# Shadow Log: Simulation 74

**Started**: 2026-03-22T17:48:55.799Z
**Ended**: 2026-03-22T17:48:56.349Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:55.799 | Sim74-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:55.813 | Sim74-Client | Verify signature | POST /auth/verify | OK | 13ms |
| 3 | 17:48:56.165 | Sim74-Handler | Request nonce | POST /auth/nonce | OK | 1ms |
| 4 | 17:48:56.182 | Sim74-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:56.205 | Sim74-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:48:56.217 | Sim74-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:56.219 | Sim74-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:48:56.220 | Sim74-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:56.222 | Sim74-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:56.224 | Sim74-Client | Search jobs | GET /jobs?search=Sim74 | OK | 2ms |
| 11 | 17:48:56.225 | Sim74-Client | Get job detail | GET /jobs/15674042-470d-4c78-be9f-bc83b26d879e | OK | 1ms |
| 12 | 17:48:56.237 | Sim74-Handler | Place bid on job 1 | POST /jobs/15674042-470d-4c78-be9f-bc83b26d879e/bid | OK | 12ms |
| 13 | 17:48:56.241 | Sim74-Handler | Duplicate bid (expect 409) | POST /jobs/15674042-470d-4c78-be9f-bc83b26d879e/bid | EXP_FAIL | 4ms |
| 14 | 17:48:56.260 | Sim74-Client | Register client agent for self-deal test | POST /agents | OK | 19ms |
| 15 | 17:48:56.263 | Sim74-Client | Self-deal bid (expect 403) | POST /jobs/15674042-470d-4c78-be9f-bc83b26d879e/bid | EXP_FAIL | 3ms |
| 16 | 17:48:56.274 | Sim74-Handler | Accept bid on job 1 | POST /jobs/15674042-470d-4c78-be9f-bc83b26d879e/accept | OK | 11ms |
| 17 | 17:48:56.292 | Sim74-Handler | Submit deliverable | POST /jobs/15674042-470d-4c78-be9f-bc83b26d879e/submit | OK | 18ms |
| 18 | 17:48:56.302 | Sim74-Client | Approve deliverable | POST /jobs/15674042-470d-4c78-be9f-bc83b26d879e/approve | OK | 10ms |
| 19 | 17:48:56.320 | Sim74-Client | Rate agent | POST /jobs/15674042-470d-4c78-be9f-bc83b26d879e/rate | OK | 18ms |
| 20 | 17:48:56.324 | Sim74-Client | Duplicate rating (expect 409) | POST /jobs/15674042-470d-4c78-be9f-bc83b26d879e/rate | EXP_FAIL | 4ms |
| 21 | 17:48:56.327 | Sim74-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:48:56.329 | Sim74-Handler | Get agent detail | GET /agents/40e93ca5-6f52-41d3-8511-fbe46e8fa8e0 | OK | 2ms |
| 23 | 17:48:56.338 | Sim74-Handler | Update agent | PUT /agents/40e93ca5-6f52-41d3-8511-fbe46e8fa8e0 | OK | 9ms |
| 24 | 17:48:56.341 | Sim74-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:48:56.342 | Sim74-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 26 | 17:48:56.343 | Sim74-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 27 | 17:48:56.345 | Sim74-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:48:56.346 | Sim74-Handler | Agent job history | GET /agents/40e93ca5-6f52-41d3-8511-fbe46e8fa8e0/jobs | OK | 1ms |
| 29 | 17:48:56.347 | Sim74-Handler | Agent earnings | GET /agents/40e93ca5-6f52-41d3-8511-fbe46e8fa8e0/earnings | OK | 1ms |
| 30 | 17:48:56.347 | Sim74-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 31 | 17:48:56.348 | Sim74-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:48:56.349 | Sim74-NoAuth | Health check | GET /health | OK | 1ms |

---

## Event Details

### Event 7: Post job 2 (dispute path)
- **Error**: Validation failed

### Event 8: Post job 3 (edge cases)
- **Error**: Validation failed

### Event 13: Duplicate bid (expect 409)
- **Note**: Expected failure: Bid already placed for this agent on this job

### Event 15: Self-deal bid (expect 403)
- **Note**: Expected failure: Cannot bid on your own job

### Event 20: Duplicate rating (expect 409)
- **Note**: Expected failure: You have already rated this job

### Event 30: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 31: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

