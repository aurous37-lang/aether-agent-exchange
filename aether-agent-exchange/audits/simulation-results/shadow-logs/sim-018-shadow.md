# Shadow Log: Simulation 18

**Started**: 2026-03-22T17:48:08.875Z
**Ended**: 2026-03-22T17:48:09.318Z
**Total Events**: 22
**OK**: 17 | **FAIL**: 3 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:08.875 | Sim18-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:08.892 | Sim18-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:48:09.244 | Sim18-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:09.258 | Sim18-Handler | Verify signature | POST /auth/verify | OK | 13ms |
| 5 | 17:48:09.279 | Sim18-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:48:09.281 | Sim18-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:48:09.283 | Sim18-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:48:09.284 | Sim18-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:09.286 | Sim18-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:09.289 | Sim18-Client | Search jobs | GET /jobs?search=Sim18 | OK | 3ms |
| 11 | 17:48:09.292 | Sim18-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 12 | 17:48:09.295 | Sim18-Handler | Get agent detail | GET /agents/77cd2ed7-4afa-4623-8581-ef13d0765bfa | OK | 3ms |
| 13 | 17:48:09.307 | Sim18-Handler | Update agent | PUT /agents/77cd2ed7-4afa-4623-8581-ef13d0765bfa | OK | 12ms |
| 14 | 17:48:09.310 | Sim18-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 15 | 17:48:09.312 | Sim18-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 16 | 17:48:09.313 | Sim18-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 17 | 17:48:09.314 | Sim18-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 18 | 17:48:09.315 | Sim18-Handler | Agent job history | GET /agents/77cd2ed7-4afa-4623-8581-ef13d0765bfa/jobs | OK | 1ms |
| 19 | 17:48:09.316 | Sim18-Handler | Agent earnings | GET /agents/77cd2ed7-4afa-4623-8581-ef13d0765bfa/earnings | OK | 1ms |
| 20 | 17:48:09.316 | Sim18-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 21 | 17:48:09.317 | Sim18-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 22 | 17:48:09.318 | Sim18-NoAuth | Health check | GET /health | OK | 1ms |

---

## Event Details

### Event 6: Post job 1 (happy path)
- **Error**: Validation failed

### Event 7: Post job 2 (dispute path)
- **Error**: Validation failed

### Event 8: Post job 3 (edge cases)
- **Error**: Validation failed

### Event 20: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 21: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

