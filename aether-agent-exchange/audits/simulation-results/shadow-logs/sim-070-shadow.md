# Shadow Log: Simulation 70

**Started**: 2026-03-22T17:48:51.038Z
**Ended**: 2026-03-22T17:48:51.517Z
**Total Events**: 24
**OK**: 20 | **FAIL**: 2 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:51.038 | Sim70-Client | Request nonce | POST /auth/nonce | OK | 1ms |
| 2 | 17:48:51.052 | Sim70-Client | Verify signature | POST /auth/verify | OK | 14ms |
| 3 | 17:48:51.405 | Sim70-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:51.424 | Sim70-Handler | Verify signature | POST /auth/verify | OK | 18ms |
| 5 | 17:48:51.446 | Sim70-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:48:51.448 | Sim70-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:48:51.449 | Sim70-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:48:51.460 | Sim70-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:48:51.463 | Sim70-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:51.466 | Sim70-Client | Search jobs | GET /jobs?search=Sim70 | OK | 3ms |
| 11 | 17:48:51.478 | Sim70-Client | Update open job | PUT /jobs/34f4b346-2e46-43a1-9c80-486d2658a1c9 | OK | 12ms |
| 12 | 17:48:51.489 | Sim70-Client | Cancel open job | DELETE /jobs/34f4b346-2e46-43a1-9c80-486d2658a1c9 | OK | 11ms |
| 13 | 17:48:51.492 | Sim70-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 14 | 17:48:51.494 | Sim70-Handler | Get agent detail | GET /agents/7f7609c5-45a7-4183-863a-da832e50f97f | OK | 2ms |
| 15 | 17:48:51.503 | Sim70-Handler | Update agent | PUT /agents/7f7609c5-45a7-4183-863a-da832e50f97f | OK | 9ms |
| 16 | 17:48:51.506 | Sim70-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 17 | 17:48:51.508 | Sim70-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 18 | 17:48:51.510 | Sim70-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 19 | 17:48:51.513 | Sim70-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 3ms |
| 20 | 17:48:51.514 | Sim70-Handler | Agent job history | GET /agents/7f7609c5-45a7-4183-863a-da832e50f97f/jobs | OK | 1ms |
| 21 | 17:48:51.515 | Sim70-Handler | Agent earnings | GET /agents/7f7609c5-45a7-4183-863a-da832e50f97f/earnings | OK | 1ms |
| 22 | 17:48:51.516 | Sim70-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 23 | 17:48:51.517 | Sim70-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 24 | 17:48:51.517 | Sim70-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 6: Post job 1 (happy path)
- **Error**: Validation failed

### Event 7: Post job 2 (dispute path)
- **Error**: Validation failed

### Event 22: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 23: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

