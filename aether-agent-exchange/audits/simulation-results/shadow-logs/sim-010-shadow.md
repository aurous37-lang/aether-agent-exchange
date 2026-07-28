# Shadow Log: Simulation 10

**Started**: 2026-03-22T17:48:00.020Z
**Ended**: 2026-03-22T17:48:00.565Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:00.020 | Sim10-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:00.031 | Sim10-Client | Verify signature | POST /auth/verify | OK | 11ms |
| 3 | 17:48:00.384 | Sim10-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:00.398 | Sim10-Handler | Verify signature | POST /auth/verify | OK | 14ms |
| 5 | 17:48:00.419 | Sim10-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:48:00.430 | Sim10-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:48:00.432 | Sim10-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:48:00.433 | Sim10-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:00.435 | Sim10-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:00.438 | Sim10-Client | Search jobs | GET /jobs?search=Sim10 | OK | 3ms |
| 11 | 17:48:00.440 | Sim10-Client | Get job detail | GET /jobs/abb58775-161a-45c4-bca6-af7752981ba8 | OK | 2ms |
| 12 | 17:48:00.452 | Sim10-Handler | Place bid on job 1 | POST /jobs/abb58775-161a-45c4-bca6-af7752981ba8/bid | OK | 12ms |
| 13 | 17:48:00.455 | Sim10-Handler | Duplicate bid (expect 409) | POST /jobs/abb58775-161a-45c4-bca6-af7752981ba8/bid | EXP_FAIL | 3ms |
| 14 | 17:48:00.474 | Sim10-Client | Register client agent for self-deal test | POST /agents | OK | 19ms |
| 15 | 17:48:00.477 | Sim10-Client | Self-deal bid (expect 403) | POST /jobs/abb58775-161a-45c4-bca6-af7752981ba8/bid | EXP_FAIL | 3ms |
| 16 | 17:48:00.487 | Sim10-Handler | Accept bid on job 1 | POST /jobs/abb58775-161a-45c4-bca6-af7752981ba8/accept | OK | 10ms |
| 17 | 17:48:00.505 | Sim10-Handler | Submit deliverable | POST /jobs/abb58775-161a-45c4-bca6-af7752981ba8/submit | OK | 18ms |
| 18 | 17:48:00.517 | Sim10-Client | Approve deliverable | POST /jobs/abb58775-161a-45c4-bca6-af7752981ba8/approve | OK | 12ms |
| 19 | 17:48:00.535 | Sim10-Client | Rate agent | POST /jobs/abb58775-161a-45c4-bca6-af7752981ba8/rate | OK | 18ms |
| 20 | 17:48:00.537 | Sim10-Client | Duplicate rating (expect 409) | POST /jobs/abb58775-161a-45c4-bca6-af7752981ba8/rate | EXP_FAIL | 2ms |
| 21 | 17:48:00.539 | Sim10-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 22 | 17:48:00.542 | Sim10-Handler | Get agent detail | GET /agents/456450ab-d7b4-44f2-be45-5291fcb004b5 | OK | 3ms |
| 23 | 17:48:00.550 | Sim10-Handler | Update agent | PUT /agents/456450ab-d7b4-44f2-be45-5291fcb004b5 | OK | 8ms |
| 24 | 17:48:00.552 | Sim10-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 25 | 17:48:00.554 | Sim10-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:48:00.556 | Sim10-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 27 | 17:48:00.558 | Sim10-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 28 | 17:48:00.560 | Sim10-Handler | Agent job history | GET /agents/456450ab-d7b4-44f2-be45-5291fcb004b5/jobs | OK | 2ms |
| 29 | 17:48:00.561 | Sim10-Handler | Agent earnings | GET /agents/456450ab-d7b4-44f2-be45-5291fcb004b5/earnings | OK | 1ms |
| 30 | 17:48:00.563 | Sim10-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 2ms |
| 31 | 17:48:00.564 | Sim10-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:48:00.565 | Sim10-NoAuth | Health check | GET /health | OK | 1ms |

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

