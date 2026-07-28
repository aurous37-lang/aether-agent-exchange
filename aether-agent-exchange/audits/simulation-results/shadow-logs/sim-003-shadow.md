# Shadow Log: Simulation 3

**Started**: 2026-03-22T17:47:51.806Z
**Ended**: 2026-03-22T17:47:52.255Z
**Total Events**: 22
**OK**: 17 | **FAIL**: 3 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:47:51.806 | Sim3-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:47:51.824 | Sim3-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:47:52.177 | Sim3-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:47:52.194 | Sim3-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:47:52.217 | Sim3-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:47:52.220 | Sim3-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:47:52.221 | Sim3-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:47:52.222 | Sim3-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:47:52.225 | Sim3-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:47:52.227 | Sim3-Client | Search jobs | GET /jobs?search=Sim3 | OK | 2ms |
| 11 | 17:47:52.229 | Sim3-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 12 | 17:47:52.231 | Sim3-Handler | Get agent detail | GET /agents/da8de508-2638-44ae-ae05-706da0bb5c81 | OK | 2ms |
| 13 | 17:47:52.242 | Sim3-Handler | Update agent | PUT /agents/da8de508-2638-44ae-ae05-706da0bb5c81 | OK | 11ms |
| 14 | 17:47:52.245 | Sim3-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 15 | 17:47:52.247 | Sim3-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 16 | 17:47:52.248 | Sim3-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 17 | 17:47:52.250 | Sim3-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 18 | 17:47:52.251 | Sim3-Handler | Agent job history | GET /agents/da8de508-2638-44ae-ae05-706da0bb5c81/jobs | OK | 1ms |
| 19 | 17:47:52.252 | Sim3-Handler | Agent earnings | GET /agents/da8de508-2638-44ae-ae05-706da0bb5c81/earnings | OK | 1ms |
| 20 | 17:47:52.253 | Sim3-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 21 | 17:47:52.255 | Sim3-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 22 | 17:47:52.255 | Sim3-NoAuth | Health check | GET /health | OK | 0ms |

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

