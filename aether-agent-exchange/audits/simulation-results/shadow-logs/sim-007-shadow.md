# Shadow Log: Simulation 7

**Started**: 2026-03-22T17:47:56.663Z
**Ended**: 2026-03-22T17:47:57.563Z
**Total Events**: 30
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:47:56.663 | Sim7-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:47:56.679 | Sim7-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:47:57.030 | Sim7-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:47:57.047 | Sim7-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:47:57.068 | Sim7-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:47:57.071 | Sim7-Client | Post job 1 (happy path) | POST /jobs | FAIL | 3ms |
| 7 | 17:47:57.083 | Sim7-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:47:57.085 | Sim7-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:47:57.088 | Sim7-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:47:57.092 | Sim7-Client | Search jobs | GET /jobs?search=Sim7 | OK | 4ms |
| 11 | 17:47:57.104 | Sim7-Handler | Bid on job 2 | POST /jobs/a230c5ec-9bf2-4f26-b8ad-fc12a3d8bc01/bid | OK | 12ms |
| 12 | 17:47:57.116 | Sim7-Handler | Accept job 2 | POST /jobs/a230c5ec-9bf2-4f26-b8ad-fc12a3d8bc01/accept | OK | 12ms |
| 13 | 17:47:57.135 | Sim7-Handler | Submit deliverable job 2 | POST /jobs/a230c5ec-9bf2-4f26-b8ad-fc12a3d8bc01/submit | OK | 19ms |
| 14 | 17:47:57.155 | Sim7-Client | File dispute | POST /jobs/a230c5ec-9bf2-4f26-b8ad-fc12a3d8bc01/dispute | OK | 20ms |
| 15 | 17:47:57.166 | Sim7-Client | Submit evidence | POST /disputes/7fb2389d-9004-40f8-80cd-616cd3273525/evidence | OK | 11ms |
| 16 | 17:47:57.518 | Sim7-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:47:57.533 | Sim7-Arbiter1 | Verify signature | POST /auth/verify | OK | 14ms |
| 18 | 17:47:57.534 | Sim7-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/7fb2389d-9004-40f8-80cd-616cd3273525/vote | EXP_FAIL | 1ms |
| 19 | 17:47:57.536 | Sim7-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 20 | 17:47:57.538 | Sim7-Handler | Get agent detail | GET /agents/2044d7fb-90d4-4993-aa21-979186a97cec | OK | 2ms |
| 21 | 17:47:57.549 | Sim7-Handler | Update agent | PUT /agents/2044d7fb-90d4-4993-aa21-979186a97cec | OK | 11ms |
| 22 | 17:47:57.551 | Sim7-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 23 | 17:47:57.553 | Sim7-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 24 | 17:47:57.554 | Sim7-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 25 | 17:47:57.555 | Sim7-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 26 | 17:47:57.556 | Sim7-Handler | Agent job history | GET /agents/2044d7fb-90d4-4993-aa21-979186a97cec/jobs | OK | 1ms |
| 27 | 17:47:57.558 | Sim7-Handler | Agent earnings | GET /agents/2044d7fb-90d4-4993-aa21-979186a97cec/earnings | OK | 2ms |
| 28 | 17:47:57.560 | Sim7-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 2ms |
| 29 | 17:47:57.562 | Sim7-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 30 | 17:47:57.563 | Sim7-NoAuth | Health check | GET /health | OK | 1ms |

---

## Event Details

### Event 6: Post job 1 (happy path)
- **Error**: Validation failed

### Event 8: Post job 3 (edge cases)
- **Error**: Validation failed

### Event 18: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 28: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 29: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

