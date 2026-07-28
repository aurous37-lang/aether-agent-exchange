# Shadow Log: Simulation 88

**Started**: 2026-03-22T17:49:11.105Z
**Ended**: 2026-03-22T17:49:12.034Z
**Total Events**: 32
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:11.105 | Sim88-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:49:11.122 | Sim88-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:49:11.475 | Sim88-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:11.491 | Sim88-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:49:11.512 | Sim88-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:49:11.514 | Sim88-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:49:11.524 | Sim88-Client | Post job 2 (dispute path) | POST /jobs | OK | 10ms |
| 8 | 17:49:11.536 | Sim88-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:49:11.538 | Sim88-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:11.540 | Sim88-Client | Search jobs | GET /jobs?search=Sim88 | OK | 2ms |
| 11 | 17:49:11.553 | Sim88-Handler | Bid on job 2 | POST /jobs/afc4c956-e5c4-4fdd-aa18-9ab4c2fc372d/bid | OK | 13ms |
| 12 | 17:49:11.564 | Sim88-Handler | Accept job 2 | POST /jobs/afc4c956-e5c4-4fdd-aa18-9ab4c2fc372d/accept | OK | 11ms |
| 13 | 17:49:11.582 | Sim88-Handler | Submit deliverable job 2 | POST /jobs/afc4c956-e5c4-4fdd-aa18-9ab4c2fc372d/submit | OK | 18ms |
| 14 | 17:49:11.601 | Sim88-Client | File dispute | POST /jobs/afc4c956-e5c4-4fdd-aa18-9ab4c2fc372d/dispute | OK | 19ms |
| 15 | 17:49:11.611 | Sim88-Client | Submit evidence | POST /disputes/057e5107-240a-4888-b173-461092d617cb/evidence | OK | 10ms |
| 16 | 17:49:11.963 | Sim88-Arbiter1 | Request nonce | POST /auth/nonce | OK | 1ms |
| 17 | 17:49:11.979 | Sim88-Arbiter1 | Verify signature | POST /auth/verify | OK | 15ms |
| 18 | 17:49:11.980 | Sim88-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/057e5107-240a-4888-b173-461092d617cb/vote | EXP_FAIL | 1ms |
| 19 | 17:49:11.991 | Sim88-Client | Update open job | PUT /jobs/2b461437-ce7c-48a8-9075-abce406fe9c9 | OK | 11ms |
| 20 | 17:49:12.002 | Sim88-Client | Cancel open job | DELETE /jobs/2b461437-ce7c-48a8-9075-abce406fe9c9 | OK | 11ms |
| 21 | 17:49:12.006 | Sim88-Handler | List agents | GET /agents?limit=10 | OK | 4ms |
| 22 | 17:49:12.010 | Sim88-Handler | Get agent detail | GET /agents/29cff3bb-1980-4c30-a6e5-9c22c5f6571f | OK | 4ms |
| 23 | 17:49:12.022 | Sim88-Handler | Update agent | PUT /agents/29cff3bb-1980-4c30-a6e5-9c22c5f6571f | OK | 12ms |
| 24 | 17:49:12.024 | Sim88-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 25 | 17:49:12.026 | Sim88-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:49:12.027 | Sim88-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 27 | 17:49:12.029 | Sim88-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 28 | 17:49:12.030 | Sim88-Handler | Agent job history | GET /agents/29cff3bb-1980-4c30-a6e5-9c22c5f6571f/jobs | OK | 1ms |
| 29 | 17:49:12.032 | Sim88-Handler | Agent earnings | GET /agents/29cff3bb-1980-4c30-a6e5-9c22c5f6571f/earnings | OK | 2ms |
| 30 | 17:49:12.032 | Sim88-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 31 | 17:49:12.034 | Sim88-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 32 | 17:49:12.034 | Sim88-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 6: Post job 1 (happy path)
- **Error**: Validation failed

### Event 18: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 30: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 31: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

