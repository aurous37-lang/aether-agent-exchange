# Shadow Log: Simulation 85

**Started**: 2026-03-22T17:49:08.137Z
**Ended**: 2026-03-22T17:49:08.613Z
**Total Events**: 24
**OK**: 20 | **FAIL**: 2 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:08.137 | Sim85-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:08.154 | Sim85-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:49:08.507 | Sim85-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:08.523 | Sim85-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:49:08.545 | Sim85-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:49:08.547 | Sim85-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:49:08.547 | Sim85-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 0ms |
| 8 | 17:49:08.558 | Sim85-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:49:08.560 | Sim85-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:08.561 | Sim85-Client | Search jobs | GET /jobs?search=Sim85 | OK | 1ms |
| 11 | 17:49:08.576 | Sim85-Client | Update open job | PUT /jobs/8d65f549-8162-4ad4-a478-edd70067fb42 | OK | 15ms |
| 12 | 17:49:08.587 | Sim85-Client | Cancel open job | DELETE /jobs/8d65f549-8162-4ad4-a478-edd70067fb42 | OK | 11ms |
| 13 | 17:49:08.590 | Sim85-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 14 | 17:49:08.592 | Sim85-Handler | Get agent detail | GET /agents/ba6418e1-d444-4d0c-85d7-1c22e61bec79 | OK | 2ms |
| 15 | 17:49:08.601 | Sim85-Handler | Update agent | PUT /agents/ba6418e1-d444-4d0c-85d7-1c22e61bec79 | OK | 9ms |
| 16 | 17:49:08.603 | Sim85-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 17 | 17:49:08.606 | Sim85-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 18 | 17:49:08.608 | Sim85-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 19 | 17:49:08.609 | Sim85-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 20 | 17:49:08.610 | Sim85-Handler | Agent job history | GET /agents/ba6418e1-d444-4d0c-85d7-1c22e61bec79/jobs | OK | 1ms |
| 21 | 17:49:08.611 | Sim85-Handler | Agent earnings | GET /agents/ba6418e1-d444-4d0c-85d7-1c22e61bec79/earnings | OK | 1ms |
| 22 | 17:49:08.611 | Sim85-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 23 | 17:49:08.612 | Sim85-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 24 | 17:49:08.613 | Sim85-NoAuth | Health check | GET /health | OK | 1ms |

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

