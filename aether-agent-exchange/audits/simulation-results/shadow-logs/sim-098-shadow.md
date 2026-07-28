# Shadow Log: Simulation 98

**Started**: 2026-03-22T17:49:22.550Z
**Ended**: 2026-03-22T17:49:23.495Z
**Total Events**: 38
**OK**: 20 | **FAIL**: 13 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:22.550 | Sim98-Client | Request nonce | POST /auth/nonce | OK | 1ms |
| 2 | 17:49:22.565 | Sim98-Client | Verify signature | POST /auth/verify | OK | 14ms |
| 3 | 17:49:22.918 | Sim98-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:22.933 | Sim98-Handler | Verify signature | POST /auth/verify | OK | 14ms |
| 5 | 17:49:22.955 | Sim98-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:49:22.966 | Sim98-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:49:22.977 | Sim98-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:49:22.979 | Sim98-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:49:22.981 | Sim98-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:22.983 | Sim98-Client | Search jobs | GET /jobs?search=Sim98 | OK | 2ms |
| 11 | 17:49:22.985 | Sim98-Client | Get job detail | GET /jobs/01c1b413-1147-47c4-bc8f-211313d8487e | OK | 2ms |
| 12 | 17:49:22.997 | Sim98-Handler | Place bid on job 1 | POST /jobs/01c1b413-1147-47c4-bc8f-211313d8487e/bid | OK | 12ms |
| 13 | 17:49:23.000 | Sim98-Handler | Duplicate bid (expect 409) | POST /jobs/01c1b413-1147-47c4-bc8f-211313d8487e/bid | EXP_FAIL | 3ms |
| 14 | 17:49:23.017 | Sim98-Client | Register client agent for self-deal test | POST /agents | OK | 17ms |
| 15 | 17:49:23.021 | Sim98-Client | Self-deal bid (expect 403) | POST /jobs/01c1b413-1147-47c4-bc8f-211313d8487e/bid | EXP_FAIL | 4ms |
| 16 | 17:49:23.030 | Sim98-Handler | Accept bid on job 1 | POST /jobs/01c1b413-1147-47c4-bc8f-211313d8487e/accept | OK | 9ms |
| 17 | 17:49:23.048 | Sim98-Handler | Submit deliverable | POST /jobs/01c1b413-1147-47c4-bc8f-211313d8487e/submit | OK | 18ms |
| 18 | 17:49:23.057 | Sim98-Client | Approve deliverable | POST /jobs/01c1b413-1147-47c4-bc8f-211313d8487e/approve | OK | 9ms |
| 19 | 17:49:23.074 | Sim98-Client | Rate agent | POST /jobs/01c1b413-1147-47c4-bc8f-211313d8487e/rate | OK | 16ms |
| 20 | 17:49:23.077 | Sim98-Client | Duplicate rating (expect 409) | POST /jobs/01c1b413-1147-47c4-bc8f-211313d8487e/rate | EXP_FAIL | 3ms |
| 21 | 17:49:23.087 | Sim98-Handler | Bid on job 2 | POST /jobs/384f859c-89db-45c5-9b65-33a221a781c4/bid | OK | 10ms |
| 22 | 17:49:23.099 | Sim98-Handler | Accept job 2 | POST /jobs/384f859c-89db-45c5-9b65-33a221a781c4/accept | OK | 12ms |
| 23 | 17:49:23.116 | Sim98-Handler | Submit deliverable job 2 | POST /jobs/384f859c-89db-45c5-9b65-33a221a781c4/submit | OK | 17ms |
| 24 | 17:49:23.135 | Sim98-Client | File dispute | POST /jobs/384f859c-89db-45c5-9b65-33a221a781c4/dispute | OK | 18ms |
| 25 | 17:49:23.136 | Sim98-Client | Submit evidence | POST /disputes/e4b56706-4087-4f41-be72-7a2288684619/evidence | FAIL | 1ms |
| 26 | 17:49:23.488 | Sim98-Arbiter1 | Request nonce | POST /auth/nonce | FAIL | 2ms |
| 27 | 17:49:23.489 | Sim98-Handler | List agents | GET /agents?limit=10 | FAIL | 1ms |
| 28 | 17:49:23.490 | Sim98-Handler | Get agent detail | GET /agents/77cdaba4-b07a-43d9-a498-1335bfa342a8 | FAIL | 1ms |
| 29 | 17:49:23.491 | Sim98-Handler | Update agent | PUT /agents/77cdaba4-b07a-43d9-a498-1335bfa342a8 | FAIL | 1ms |
| 30 | 17:49:23.491 | Sim98-Handler | Handler dashboard | GET /handler/dashboard | FAIL | 0ms |
| 31 | 17:49:23.492 | Sim98-Handler | Handler agents list | GET /handler/agents | FAIL | 1ms |
| 32 | 17:49:23.492 | Sim98-Handler | Get notifications | GET /handler/notifications | FAIL | 0ms |
| 33 | 17:49:23.493 | Sim98-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | FAIL | 1ms |
| 34 | 17:49:23.493 | Sim98-Handler | Agent job history | GET /agents/77cdaba4-b07a-43d9-a498-1335bfa342a8/jobs | FAIL | 0ms |
| 35 | 17:49:23.494 | Sim98-Handler | Agent earnings | GET /agents/77cdaba4-b07a-43d9-a498-1335bfa342a8/earnings | FAIL | 1ms |
| 36 | 17:49:23.494 | Sim98-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 37 | 17:49:23.495 | Sim98-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 38 | 17:49:23.495 | Sim98-NoAuth | Health check | GET /health | FAIL | 0ms |

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

### Event 25: Submit evidence
- **Error**: Too many requests, please try again later.

### Event 26: Request nonce
- **Error**: Too many requests, please try again later.

### Event 27: List agents
- **Error**: Too many requests, please try again later.

### Event 28: Get agent detail
- **Error**: Too many requests, please try again later.

### Event 29: Update agent
- **Error**: Too many requests, please try again later.

### Event 30: Handler dashboard
- **Error**: Too many requests, please try again later.

### Event 31: Handler agents list
- **Error**: Too many requests, please try again later.

### Event 32: Get notifications
- **Error**: Too many requests, please try again later.

### Event 33: Mark notifications read (empty)
- **Error**: Too many requests, please try again later.

### Event 34: Agent job history
- **Error**: Too many requests, please try again later.

### Event 35: Agent earnings
- **Error**: Too many requests, please try again later.

### Event 36: Post job without auth (expect 401)
- **Note**: Expected failure: Too many requests, please try again later.

### Event 37: Get nonexistent job (expect 404)
- **Note**: Expected failure: Too many requests, please try again later.

### Event 38: Health check
- **Error**: Too many requests, please try again later.

