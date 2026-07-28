# Shadow Log: Simulation 19

**Started**: 2026-03-22T17:48:09.672Z
**Ended**: 2026-03-22T17:48:10.153Z
**Total Events**: 24
**OK**: 20 | **FAIL**: 2 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:09.672 | Sim19-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:09.690 | Sim19-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:48:10.043 | Sim19-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:10.060 | Sim19-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:10.083 | Sim19-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:48:10.084 | Sim19-Client | Post job 1 (happy path) | POST /jobs | FAIL | 1ms |
| 7 | 17:48:10.085 | Sim19-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:48:10.097 | Sim19-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:48:10.100 | Sim19-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:10.103 | Sim19-Client | Search jobs | GET /jobs?search=Sim19 | OK | 3ms |
| 11 | 17:48:10.116 | Sim19-Client | Update open job | PUT /jobs/61ed8e66-9d67-4f66-ace3-2cfb5791b0f4 | OK | 13ms |
| 12 | 17:48:10.127 | Sim19-Client | Cancel open job | DELETE /jobs/61ed8e66-9d67-4f66-ace3-2cfb5791b0f4 | OK | 11ms |
| 13 | 17:48:10.130 | Sim19-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 14 | 17:48:10.132 | Sim19-Handler | Get agent detail | GET /agents/200a4c43-232c-453b-9a6b-034ae521369d | OK | 2ms |
| 15 | 17:48:10.140 | Sim19-Handler | Update agent | PUT /agents/200a4c43-232c-453b-9a6b-034ae521369d | OK | 8ms |
| 16 | 17:48:10.143 | Sim19-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 17 | 17:48:10.145 | Sim19-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 18 | 17:48:10.146 | Sim19-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 19 | 17:48:10.148 | Sim19-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 20 | 17:48:10.150 | Sim19-Handler | Agent job history | GET /agents/200a4c43-232c-453b-9a6b-034ae521369d/jobs | OK | 2ms |
| 21 | 17:48:10.151 | Sim19-Handler | Agent earnings | GET /agents/200a4c43-232c-453b-9a6b-034ae521369d/earnings | OK | 1ms |
| 22 | 17:48:10.152 | Sim19-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 23 | 17:48:10.153 | Sim19-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 24 | 17:48:10.153 | Sim19-NoAuth | Health check | GET /health | OK | 0ms |

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

