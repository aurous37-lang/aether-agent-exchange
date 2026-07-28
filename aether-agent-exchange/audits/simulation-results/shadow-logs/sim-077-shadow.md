# Shadow Log: Simulation 77

**Started**: 2026-03-22T17:48:58.891Z
**Ended**: 2026-03-22T17:48:59.370Z
**Total Events**: 24
**OK**: 20 | **FAIL**: 2 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:58.891 | Sim77-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:58.907 | Sim77-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:48:59.260 | Sim77-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:59.276 | Sim77-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:48:59.297 | Sim77-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:48:59.299 | Sim77-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:48:59.300 | Sim77-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:48:59.311 | Sim77-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:48:59.314 | Sim77-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:59.317 | Sim77-Client | Search jobs | GET /jobs?search=Sim77 | OK | 3ms |
| 11 | 17:48:59.329 | Sim77-Client | Update open job | PUT /jobs/5e87d420-fd72-4c49-9b34-4f330174d2d6 | OK | 12ms |
| 12 | 17:48:59.340 | Sim77-Client | Cancel open job | DELETE /jobs/5e87d420-fd72-4c49-9b34-4f330174d2d6 | OK | 11ms |
| 13 | 17:48:59.342 | Sim77-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 14 | 17:48:59.344 | Sim77-Handler | Get agent detail | GET /agents/531f4461-5b4d-4b62-8de7-94ccc69e96ed | OK | 2ms |
| 15 | 17:48:59.357 | Sim77-Handler | Update agent | PUT /agents/531f4461-5b4d-4b62-8de7-94ccc69e96ed | OK | 13ms |
| 16 | 17:48:59.360 | Sim77-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 17 | 17:48:59.362 | Sim77-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 18 | 17:48:59.364 | Sim77-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 19 | 17:48:59.365 | Sim77-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 20 | 17:48:59.366 | Sim77-Handler | Agent job history | GET /agents/531f4461-5b4d-4b62-8de7-94ccc69e96ed/jobs | OK | 1ms |
| 21 | 17:48:59.368 | Sim77-Handler | Agent earnings | GET /agents/531f4461-5b4d-4b62-8de7-94ccc69e96ed/earnings | OK | 2ms |
| 22 | 17:48:59.368 | Sim77-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 23 | 17:48:59.369 | Sim77-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 24 | 17:48:59.370 | Sim77-NoAuth | Health check | GET /health | OK | 1ms |

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

