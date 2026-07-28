# Shadow Log: Simulation 94

**Started**: 2026-03-22T17:49:18.123Z
**Ended**: 2026-03-22T17:49:18.668Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:18.123 | Sim94-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:49:18.137 | Sim94-Client | Verify signature | POST /auth/verify | OK | 14ms |
| 3 | 17:49:18.490 | Sim94-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:18.507 | Sim94-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:49:18.529 | Sim94-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:49:18.540 | Sim94-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:49:18.542 | Sim94-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:49:18.543 | Sim94-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:49:18.545 | Sim94-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:18.547 | Sim94-Client | Search jobs | GET /jobs?search=Sim94 | OK | 2ms |
| 11 | 17:49:18.549 | Sim94-Client | Get job detail | GET /jobs/0c685817-d32c-45a1-8d07-27692d1450e3 | OK | 2ms |
| 12 | 17:49:18.561 | Sim94-Handler | Place bid on job 1 | POST /jobs/0c685817-d32c-45a1-8d07-27692d1450e3/bid | OK | 12ms |
| 13 | 17:49:18.564 | Sim94-Handler | Duplicate bid (expect 409) | POST /jobs/0c685817-d32c-45a1-8d07-27692d1450e3/bid | EXP_FAIL | 3ms |
| 14 | 17:49:18.583 | Sim94-Client | Register client agent for self-deal test | POST /agents | OK | 19ms |
| 15 | 17:49:18.586 | Sim94-Client | Self-deal bid (expect 403) | POST /jobs/0c685817-d32c-45a1-8d07-27692d1450e3/bid | EXP_FAIL | 3ms |
| 16 | 17:49:18.597 | Sim94-Handler | Accept bid on job 1 | POST /jobs/0c685817-d32c-45a1-8d07-27692d1450e3/accept | OK | 11ms |
| 17 | 17:49:18.616 | Sim94-Handler | Submit deliverable | POST /jobs/0c685817-d32c-45a1-8d07-27692d1450e3/submit | OK | 19ms |
| 18 | 17:49:18.625 | Sim94-Client | Approve deliverable | POST /jobs/0c685817-d32c-45a1-8d07-27692d1450e3/approve | OK | 9ms |
| 19 | 17:49:18.642 | Sim94-Client | Rate agent | POST /jobs/0c685817-d32c-45a1-8d07-27692d1450e3/rate | OK | 17ms |
| 20 | 17:49:18.645 | Sim94-Client | Duplicate rating (expect 409) | POST /jobs/0c685817-d32c-45a1-8d07-27692d1450e3/rate | EXP_FAIL | 3ms |
| 21 | 17:49:18.647 | Sim94-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 22 | 17:49:18.649 | Sim94-Handler | Get agent detail | GET /agents/07424616-7582-4181-9f14-6bfe8432b49e | OK | 2ms |
| 23 | 17:49:18.659 | Sim94-Handler | Update agent | PUT /agents/07424616-7582-4181-9f14-6bfe8432b49e | OK | 10ms |
| 24 | 17:49:18.661 | Sim94-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 25 | 17:49:18.662 | Sim94-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 26 | 17:49:18.663 | Sim94-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 27 | 17:49:18.664 | Sim94-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:49:18.664 | Sim94-Handler | Agent job history | GET /agents/07424616-7582-4181-9f14-6bfe8432b49e/jobs | OK | 0ms |
| 29 | 17:49:18.666 | Sim94-Handler | Agent earnings | GET /agents/07424616-7582-4181-9f14-6bfe8432b49e/earnings | OK | 2ms |
| 30 | 17:49:18.666 | Sim94-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 31 | 17:49:18.667 | Sim94-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:49:18.668 | Sim94-NoAuth | Health check | GET /health | OK | 1ms |

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

