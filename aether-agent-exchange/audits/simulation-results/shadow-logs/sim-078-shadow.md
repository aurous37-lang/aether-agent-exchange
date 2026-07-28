# Shadow Log: Simulation 78

**Started**: 2026-03-22T17:48:59.724Z
**Ended**: 2026-03-22T17:49:00.285Z
**Total Events**: 34
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:59.724 | Sim78-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:59.740 | Sim78-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:49:00.093 | Sim78-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:00.105 | Sim78-Handler | Verify signature | POST /auth/verify | OK | 12ms |
| 5 | 17:49:00.123 | Sim78-Handler | Register agent | POST /agents | OK | 18ms |
| 6 | 17:49:00.134 | Sim78-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:49:00.136 | Sim78-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:49:00.144 | Sim78-Client | Post job 3 (edge cases) | POST /jobs | OK | 8ms |
| 9 | 17:49:00.146 | Sim78-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:00.148 | Sim78-Client | Search jobs | GET /jobs?search=Sim78 | OK | 2ms |
| 11 | 17:49:00.150 | Sim78-Client | Get job detail | GET /jobs/34a75abd-59c5-4c08-8b64-9283267421a4 | OK | 2ms |
| 12 | 17:49:00.161 | Sim78-Handler | Place bid on job 1 | POST /jobs/34a75abd-59c5-4c08-8b64-9283267421a4/bid | OK | 11ms |
| 13 | 17:49:00.164 | Sim78-Handler | Duplicate bid (expect 409) | POST /jobs/34a75abd-59c5-4c08-8b64-9283267421a4/bid | EXP_FAIL | 3ms |
| 14 | 17:49:00.182 | Sim78-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:49:00.185 | Sim78-Client | Self-deal bid (expect 403) | POST /jobs/34a75abd-59c5-4c08-8b64-9283267421a4/bid | EXP_FAIL | 3ms |
| 16 | 17:49:00.194 | Sim78-Handler | Accept bid on job 1 | POST /jobs/34a75abd-59c5-4c08-8b64-9283267421a4/accept | OK | 9ms |
| 17 | 17:49:00.212 | Sim78-Handler | Submit deliverable | POST /jobs/34a75abd-59c5-4c08-8b64-9283267421a4/submit | OK | 18ms |
| 18 | 17:49:00.221 | Sim78-Client | Approve deliverable | POST /jobs/34a75abd-59c5-4c08-8b64-9283267421a4/approve | OK | 9ms |
| 19 | 17:49:00.238 | Sim78-Client | Rate agent | POST /jobs/34a75abd-59c5-4c08-8b64-9283267421a4/rate | OK | 17ms |
| 20 | 17:49:00.241 | Sim78-Client | Duplicate rating (expect 409) | POST /jobs/34a75abd-59c5-4c08-8b64-9283267421a4/rate | EXP_FAIL | 3ms |
| 21 | 17:49:00.250 | Sim78-Client | Update open job | PUT /jobs/19d8d4b9-e6a5-40d3-8876-355b42d9f6a7 | OK | 9ms |
| 22 | 17:49:00.260 | Sim78-Client | Cancel open job | DELETE /jobs/19d8d4b9-e6a5-40d3-8876-355b42d9f6a7 | OK | 10ms |
| 23 | 17:49:00.263 | Sim78-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 24 | 17:49:00.265 | Sim78-Handler | Get agent detail | GET /agents/cfe089a6-f53b-4afc-b004-d0cf8ab14fa0 | OK | 2ms |
| 25 | 17:49:00.274 | Sim78-Handler | Update agent | PUT /agents/cfe089a6-f53b-4afc-b004-d0cf8ab14fa0 | OK | 9ms |
| 26 | 17:49:00.276 | Sim78-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 27 | 17:49:00.278 | Sim78-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 28 | 17:49:00.279 | Sim78-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 29 | 17:49:00.281 | Sim78-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 30 | 17:49:00.282 | Sim78-Handler | Agent job history | GET /agents/cfe089a6-f53b-4afc-b004-d0cf8ab14fa0/jobs | OK | 1ms |
| 31 | 17:49:00.283 | Sim78-Handler | Agent earnings | GET /agents/cfe089a6-f53b-4afc-b004-d0cf8ab14fa0/earnings | OK | 1ms |
| 32 | 17:49:00.284 | Sim78-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 33 | 17:49:00.285 | Sim78-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 34 | 17:49:00.285 | Sim78-NoAuth | Health check | GET /health | OK | 0ms |

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

