# Shadow Log: Simulation 86

**Started**: 2026-03-22T17:49:08.967Z
**Ended**: 2026-03-22T17:49:09.854Z
**Total Events**: 30
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:08.967 | Sim86-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:49:08.982 | Sim86-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:49:09.335 | Sim86-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:09.351 | Sim86-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:49:09.371 | Sim86-Handler | Register agent | POST /agents | OK | 20ms |
| 6 | 17:49:09.373 | Sim86-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:49:09.384 | Sim86-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:49:09.385 | Sim86-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:49:09.387 | Sim86-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:09.389 | Sim86-Client | Search jobs | GET /jobs?search=Sim86 | OK | 2ms |
| 11 | 17:49:09.401 | Sim86-Handler | Bid on job 2 | POST /jobs/7f7b8ef7-e370-4cbb-b975-c3b22b6d5503/bid | OK | 12ms |
| 12 | 17:49:09.413 | Sim86-Handler | Accept job 2 | POST /jobs/7f7b8ef7-e370-4cbb-b975-c3b22b6d5503/accept | OK | 12ms |
| 13 | 17:49:09.432 | Sim86-Handler | Submit deliverable job 2 | POST /jobs/7f7b8ef7-e370-4cbb-b975-c3b22b6d5503/submit | OK | 19ms |
| 14 | 17:49:09.449 | Sim86-Client | File dispute | POST /jobs/7f7b8ef7-e370-4cbb-b975-c3b22b6d5503/dispute | OK | 17ms |
| 15 | 17:49:09.458 | Sim86-Client | Submit evidence | POST /disputes/4f93c040-ad5c-44b1-8d31-93c9e62da66f/evidence | OK | 9ms |
| 16 | 17:49:09.811 | Sim86-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:49:09.826 | Sim86-Arbiter1 | Verify signature | POST /auth/verify | OK | 15ms |
| 18 | 17:49:09.828 | Sim86-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/4f93c040-ad5c-44b1-8d31-93c9e62da66f/vote | EXP_FAIL | 1ms |
| 19 | 17:49:09.831 | Sim86-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 20 | 17:49:09.832 | Sim86-Handler | Get agent detail | GET /agents/473de6de-ca1d-43e3-ab71-3b374bc2c01c | OK | 1ms |
| 21 | 17:49:09.842 | Sim86-Handler | Update agent | PUT /agents/473de6de-ca1d-43e3-ab71-3b374bc2c01c | OK | 10ms |
| 22 | 17:49:09.846 | Sim86-Handler | Handler dashboard | GET /handler/dashboard | OK | 4ms |
| 23 | 17:49:09.847 | Sim86-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 24 | 17:49:09.849 | Sim86-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 25 | 17:49:09.850 | Sim86-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 26 | 17:49:09.851 | Sim86-Handler | Agent job history | GET /agents/473de6de-ca1d-43e3-ab71-3b374bc2c01c/jobs | OK | 1ms |
| 27 | 17:49:09.852 | Sim86-Handler | Agent earnings | GET /agents/473de6de-ca1d-43e3-ab71-3b374bc2c01c/earnings | OK | 1ms |
| 28 | 17:49:09.852 | Sim86-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 29 | 17:49:09.853 | Sim86-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 30 | 17:49:09.854 | Sim86-NoAuth | Health check | GET /health | OK | 1ms |

---

## Event Details

### Event 6: Post job 1 (happy path)
- **Error**: Validation failed

### Event 8: Post job 3 (edge cases)
- **Error**: Validation failed

### Event 18: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 28: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 29: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

