# Shadow Log: Simulation 81

**Started**: 2026-03-22T17:49:03.418Z
**Ended**: 2026-03-22T17:49:04.354Z
**Total Events**: 32
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:03.418 | Sim81-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:03.436 | Sim81-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:49:03.790 | Sim81-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:49:03.807 | Sim81-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:49:03.827 | Sim81-Handler | Register agent | POST /agents | OK | 20ms |
| 6 | 17:49:03.829 | Sim81-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:49:03.841 | Sim81-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:49:03.853 | Sim81-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:49:03.856 | Sim81-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:49:03.858 | Sim81-Client | Search jobs | GET /jobs?search=Sim81 | OK | 2ms |
| 11 | 17:49:03.872 | Sim81-Handler | Bid on job 2 | POST /jobs/00139008-6212-4755-84ad-4f29fe0c7345/bid | OK | 14ms |
| 12 | 17:49:03.883 | Sim81-Handler | Accept job 2 | POST /jobs/00139008-6212-4755-84ad-4f29fe0c7345/accept | OK | 11ms |
| 13 | 17:49:03.901 | Sim81-Handler | Submit deliverable job 2 | POST /jobs/00139008-6212-4755-84ad-4f29fe0c7345/submit | OK | 18ms |
| 14 | 17:49:03.919 | Sim81-Client | File dispute | POST /jobs/00139008-6212-4755-84ad-4f29fe0c7345/dispute | OK | 18ms |
| 15 | 17:49:03.929 | Sim81-Client | Submit evidence | POST /disputes/f57b525b-cea0-42a5-bb50-e7448a4f9c21/evidence | OK | 10ms |
| 16 | 17:49:04.282 | Sim81-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:49:04.300 | Sim81-Arbiter1 | Verify signature | POST /auth/verify | OK | 18ms |
| 18 | 17:49:04.301 | Sim81-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/f57b525b-cea0-42a5-bb50-e7448a4f9c21/vote | EXP_FAIL | 1ms |
| 19 | 17:49:04.312 | Sim81-Client | Update open job | PUT /jobs/98dc5445-db95-4557-ad74-6128fd2dc27c | OK | 11ms |
| 20 | 17:49:04.323 | Sim81-Client | Cancel open job | DELETE /jobs/98dc5445-db95-4557-ad74-6128fd2dc27c | OK | 11ms |
| 21 | 17:49:04.326 | Sim81-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:49:04.328 | Sim81-Handler | Get agent detail | GET /agents/12c5049f-58d8-4b53-83d5-cb2b7ae5e92c | OK | 2ms |
| 23 | 17:49:04.340 | Sim81-Handler | Update agent | PUT /agents/12c5049f-58d8-4b53-83d5-cb2b7ae5e92c | OK | 12ms |
| 24 | 17:49:04.343 | Sim81-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:49:04.345 | Sim81-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:49:04.347 | Sim81-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 27 | 17:49:04.349 | Sim81-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 28 | 17:49:04.351 | Sim81-Handler | Agent job history | GET /agents/12c5049f-58d8-4b53-83d5-cb2b7ae5e92c/jobs | OK | 2ms |
| 29 | 17:49:04.352 | Sim81-Handler | Agent earnings | GET /agents/12c5049f-58d8-4b53-83d5-cb2b7ae5e92c/earnings | OK | 1ms |
| 30 | 17:49:04.352 | Sim81-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 31 | 17:49:04.354 | Sim81-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 32 | 17:49:04.354 | Sim81-NoAuth | Health check | GET /health | OK | 0ms |

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

