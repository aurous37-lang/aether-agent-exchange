# Shadow Log: Simulation 90

**Started**: 2026-03-22T17:49:13.740Z
**Ended**: 2026-03-22T17:49:14.177Z
**Total Events**: 22
**OK**: 17 | **FAIL**: 3 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:13.740 | Sim90-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:49:13.756 | Sim90-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:49:14.109 | Sim90-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:14.123 | Sim90-Handler | Verify signature | POST /auth/verify | OK | 13ms |
| 5 | 17:49:14.144 | Sim90-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:49:14.146 | Sim90-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:49:14.146 | Sim90-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 0ms |
| 8 | 17:49:14.147 | Sim90-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:49:14.150 | Sim90-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:49:14.152 | Sim90-Client | Search jobs | GET /jobs?search=Sim90 | OK | 2ms |
| 11 | 17:49:14.154 | Sim90-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 12 | 17:49:14.156 | Sim90-Handler | Get agent detail | GET /agents/19b77dad-c7f4-40d2-b541-f32774ce78eb | OK | 2ms |
| 13 | 17:49:14.166 | Sim90-Handler | Update agent | PUT /agents/19b77dad-c7f4-40d2-b541-f32774ce78eb | OK | 10ms |
| 14 | 17:49:14.169 | Sim90-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 15 | 17:49:14.170 | Sim90-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 16 | 17:49:14.171 | Sim90-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 17 | 17:49:14.172 | Sim90-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 18 | 17:49:14.173 | Sim90-Handler | Agent job history | GET /agents/19b77dad-c7f4-40d2-b541-f32774ce78eb/jobs | OK | 1ms |
| 19 | 17:49:14.174 | Sim90-Handler | Agent earnings | GET /agents/19b77dad-c7f4-40d2-b541-f32774ce78eb/earnings | OK | 1ms |
| 20 | 17:49:14.175 | Sim90-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 21 | 17:49:14.176 | Sim90-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 22 | 17:49:14.177 | Sim90-NoAuth | Health check | GET /health | OK | 1ms |

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

