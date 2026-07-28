# Shadow Log: Simulation 9

**Started**: 2026-03-22T17:47:59.182Z
**Ended**: 2026-03-22T17:47:59.665Z
**Total Events**: 24
**OK**: 20 | **FAIL**: 2 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:47:59.182 | Sim9-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:47:59.200 | Sim9-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:47:59.553 | Sim9-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:47:59.568 | Sim9-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:47:59.591 | Sim9-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:47:59.592 | Sim9-Client | Post job 1 (happy path) | POST /jobs | FAIL | 1ms |
| 7 | 17:47:59.594 | Sim9-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:47:59.606 | Sim9-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:47:59.608 | Sim9-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:47:59.610 | Sim9-Client | Search jobs | GET /jobs?search=Sim9 | OK | 2ms |
| 11 | 17:47:59.621 | Sim9-Client | Update open job | PUT /jobs/929a84a4-2c6c-4f95-a829-ba8394e748f1 | OK | 11ms |
| 12 | 17:47:59.633 | Sim9-Client | Cancel open job | DELETE /jobs/929a84a4-2c6c-4f95-a829-ba8394e748f1 | OK | 12ms |
| 13 | 17:47:59.636 | Sim9-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 14 | 17:47:59.639 | Sim9-Handler | Get agent detail | GET /agents/44ba62d5-d61d-4143-a580-b050426a0212 | OK | 3ms |
| 15 | 17:47:59.650 | Sim9-Handler | Update agent | PUT /agents/44ba62d5-d61d-4143-a580-b050426a0212 | OK | 11ms |
| 16 | 17:47:59.652 | Sim9-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 17 | 17:47:59.654 | Sim9-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 18 | 17:47:59.655 | Sim9-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 19 | 17:47:59.656 | Sim9-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 20 | 17:47:59.657 | Sim9-Handler | Agent job history | GET /agents/44ba62d5-d61d-4143-a580-b050426a0212/jobs | OK | 1ms |
| 21 | 17:47:59.659 | Sim9-Handler | Agent earnings | GET /agents/44ba62d5-d61d-4143-a580-b050426a0212/earnings | OK | 2ms |
| 22 | 17:47:59.660 | Sim9-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 23 | 17:47:59.663 | Sim9-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 3ms |
| 24 | 17:47:59.665 | Sim9-NoAuth | Health check | GET /health | OK | 2ms |

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

