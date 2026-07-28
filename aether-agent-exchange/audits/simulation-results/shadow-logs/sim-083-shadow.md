# Shadow Log: Simulation 83

**Started**: 2026-03-22T17:49:05.957Z
**Ended**: 2026-03-22T17:49:06.398Z
**Total Events**: 22
**OK**: 17 | **FAIL**: 3 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:05.957 | Sim83-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:49:05.974 | Sim83-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:49:06.326 | Sim83-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:49:06.341 | Sim83-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:49:06.362 | Sim83-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:49:06.364 | Sim83-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:49:06.365 | Sim83-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:49:06.366 | Sim83-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:49:06.368 | Sim83-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:06.370 | Sim83-Client | Search jobs | GET /jobs?search=Sim83 | OK | 2ms |
| 11 | 17:49:06.373 | Sim83-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 12 | 17:49:06.375 | Sim83-Handler | Get agent detail | GET /agents/c2d5cf9b-12fe-49cb-8b26-5fde24b1ebed | OK | 2ms |
| 13 | 17:49:06.385 | Sim83-Handler | Update agent | PUT /agents/c2d5cf9b-12fe-49cb-8b26-5fde24b1ebed | OK | 10ms |
| 14 | 17:49:06.388 | Sim83-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 15 | 17:49:06.391 | Sim83-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 16 | 17:49:06.393 | Sim83-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 17 | 17:49:06.394 | Sim83-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 18 | 17:49:06.395 | Sim83-Handler | Agent job history | GET /agents/c2d5cf9b-12fe-49cb-8b26-5fde24b1ebed/jobs | OK | 1ms |
| 19 | 17:49:06.396 | Sim83-Handler | Agent earnings | GET /agents/c2d5cf9b-12fe-49cb-8b26-5fde24b1ebed/earnings | OK | 1ms |
| 20 | 17:49:06.397 | Sim83-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 21 | 17:49:06.398 | Sim83-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 22 | 17:49:06.398 | Sim83-NoAuth | Health check | GET /health | OK | 0ms |

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

