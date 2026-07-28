# Shadow Log: Simulation 15

**Started**: 2026-03-22T17:48:05.831Z
**Ended**: 2026-03-22T17:48:06.305Z
**Total Events**: 24
**OK**: 20 | **FAIL**: 2 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:05.831 | Sim15-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:05.845 | Sim15-Client | Verify signature | POST /auth/verify | OK | 13ms |
| 3 | 17:48:06.196 | Sim15-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:06.216 | Sim15-Handler | Verify signature | POST /auth/verify | OK | 19ms |
| 5 | 17:48:06.239 | Sim15-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:48:06.241 | Sim15-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:48:06.242 | Sim15-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:48:06.254 | Sim15-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:48:06.256 | Sim15-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:06.258 | Sim15-Client | Search jobs | GET /jobs?search=Sim15 | OK | 2ms |
| 11 | 17:48:06.269 | Sim15-Client | Update open job | PUT /jobs/67a27598-1314-46af-af72-a3e59175e9f5 | OK | 11ms |
| 12 | 17:48:06.281 | Sim15-Client | Cancel open job | DELETE /jobs/67a27598-1314-46af-af72-a3e59175e9f5 | OK | 12ms |
| 13 | 17:48:06.283 | Sim15-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 14 | 17:48:06.284 | Sim15-Handler | Get agent detail | GET /agents/a92b3cb5-f062-4359-9a0e-106eefd57d99 | OK | 1ms |
| 15 | 17:48:06.292 | Sim15-Handler | Update agent | PUT /agents/a92b3cb5-f062-4359-9a0e-106eefd57d99 | OK | 8ms |
| 16 | 17:48:06.295 | Sim15-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 17 | 17:48:06.297 | Sim15-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 18 | 17:48:06.298 | Sim15-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 19 | 17:48:06.299 | Sim15-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 20 | 17:48:06.300 | Sim15-Handler | Agent job history | GET /agents/a92b3cb5-f062-4359-9a0e-106eefd57d99/jobs | OK | 1ms |
| 21 | 17:48:06.302 | Sim15-Handler | Agent earnings | GET /agents/a92b3cb5-f062-4359-9a0e-106eefd57d99/earnings | OK | 2ms |
| 22 | 17:48:06.303 | Sim15-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 23 | 17:48:06.305 | Sim15-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 24 | 17:48:06.305 | Sim15-NoAuth | Health check | GET /health | OK | 0ms |

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

