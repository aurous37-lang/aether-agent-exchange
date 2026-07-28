# Shadow Log: Simulation 13

**Started**: 2026-03-22T17:48:03.647Z
**Ended**: 2026-03-22T17:48:04.570Z
**Total Events**: 32
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:03.647 | Sim13-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:03.662 | Sim13-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:48:04.015 | Sim13-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:04.033 | Sim13-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:48:04.055 | Sim13-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:48:04.056 | Sim13-Client | Post job 1 (happy path) | POST /jobs | FAIL | 1ms |
| 7 | 17:48:04.067 | Sim13-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:48:04.078 | Sim13-Client | Post job 3 (edge cases) | POST /jobs | OK | 10ms |
| 9 | 17:48:04.080 | Sim13-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:04.083 | Sim13-Client | Search jobs | GET /jobs?search=Sim13 | OK | 3ms |
| 11 | 17:48:04.094 | Sim13-Handler | Bid on job 2 | POST /jobs/fb34010d-10c2-4464-9bfb-344130f84ad4/bid | OK | 11ms |
| 12 | 17:48:04.105 | Sim13-Handler | Accept job 2 | POST /jobs/fb34010d-10c2-4464-9bfb-344130f84ad4/accept | OK | 11ms |
| 13 | 17:48:04.124 | Sim13-Handler | Submit deliverable job 2 | POST /jobs/fb34010d-10c2-4464-9bfb-344130f84ad4/submit | OK | 19ms |
| 14 | 17:48:04.143 | Sim13-Client | File dispute | POST /jobs/fb34010d-10c2-4464-9bfb-344130f84ad4/dispute | OK | 19ms |
| 15 | 17:48:04.152 | Sim13-Client | Submit evidence | POST /disputes/6bd1d453-1ec7-4176-8f1d-06afdbdf60e9/evidence | OK | 9ms |
| 16 | 17:48:04.504 | Sim13-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:48:04.519 | Sim13-Arbiter1 | Verify signature | POST /auth/verify | OK | 14ms |
| 18 | 17:48:04.520 | Sim13-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/6bd1d453-1ec7-4176-8f1d-06afdbdf60e9/vote | EXP_FAIL | 1ms |
| 19 | 17:48:04.531 | Sim13-Client | Update open job | PUT /jobs/4e6486df-770e-40e3-8c2e-517caa38c4be | OK | 11ms |
| 20 | 17:48:04.542 | Sim13-Client | Cancel open job | DELETE /jobs/4e6486df-770e-40e3-8c2e-517caa38c4be | OK | 11ms |
| 21 | 17:48:04.545 | Sim13-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:48:04.548 | Sim13-Handler | Get agent detail | GET /agents/dd639fd2-2193-4595-89f8-5046838294ab | OK | 3ms |
| 23 | 17:48:04.559 | Sim13-Handler | Update agent | PUT /agents/dd639fd2-2193-4595-89f8-5046838294ab | OK | 11ms |
| 24 | 17:48:04.562 | Sim13-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:48:04.564 | Sim13-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:48:04.565 | Sim13-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 27 | 17:48:04.566 | Sim13-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:48:04.567 | Sim13-Handler | Agent job history | GET /agents/dd639fd2-2193-4595-89f8-5046838294ab/jobs | OK | 1ms |
| 29 | 17:48:04.568 | Sim13-Handler | Agent earnings | GET /agents/dd639fd2-2193-4595-89f8-5046838294ab/earnings | OK | 1ms |
| 30 | 17:48:04.568 | Sim13-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 31 | 17:48:04.569 | Sim13-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:48:04.570 | Sim13-NoAuth | Health check | GET /health | OK | 1ms |

---

## Event Details

### Event 6: Post job 1 (happy path)
- **Error**: Validation failed

### Event 18: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 30: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 31: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

