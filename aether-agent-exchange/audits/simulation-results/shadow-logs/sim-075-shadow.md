# Shadow Log: Simulation 75

**Started**: 2026-03-22T17:48:56.703Z
**Ended**: 2026-03-22T17:48:57.599Z
**Total Events**: 30
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:56.703 | Sim75-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:56.719 | Sim75-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:48:57.073 | Sim75-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:48:57.089 | Sim75-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:57.112 | Sim75-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:48:57.113 | Sim75-Client | Post job 1 (happy path) | POST /jobs | FAIL | 1ms |
| 7 | 17:48:57.124 | Sim75-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:48:57.125 | Sim75-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:57.127 | Sim75-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:57.131 | Sim75-Client | Search jobs | GET /jobs?search=Sim75 | OK | 4ms |
| 11 | 17:48:57.143 | Sim75-Handler | Bid on job 2 | POST /jobs/9876c37c-a8b9-40be-b44b-18c6ca69c441/bid | OK | 12ms |
| 12 | 17:48:57.155 | Sim75-Handler | Accept job 2 | POST /jobs/9876c37c-a8b9-40be-b44b-18c6ca69c441/accept | OK | 12ms |
| 13 | 17:48:57.174 | Sim75-Handler | Submit deliverable job 2 | POST /jobs/9876c37c-a8b9-40be-b44b-18c6ca69c441/submit | OK | 19ms |
| 14 | 17:48:57.192 | Sim75-Client | File dispute | POST /jobs/9876c37c-a8b9-40be-b44b-18c6ca69c441/dispute | OK | 18ms |
| 15 | 17:48:57.202 | Sim75-Client | Submit evidence | POST /disputes/2009555e-fa08-4907-a67a-be99d9ac7f4a/evidence | OK | 10ms |
| 16 | 17:48:57.554 | Sim75-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:48:57.569 | Sim75-Arbiter1 | Verify signature | POST /auth/verify | OK | 14ms |
| 18 | 17:48:57.570 | Sim75-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/2009555e-fa08-4907-a67a-be99d9ac7f4a/vote | EXP_FAIL | 1ms |
| 19 | 17:48:57.573 | Sim75-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 20 | 17:48:57.576 | Sim75-Handler | Get agent detail | GET /agents/4b37242d-6cfa-4db8-9be2-f4d759ef9fbf | OK | 3ms |
| 21 | 17:48:57.587 | Sim75-Handler | Update agent | PUT /agents/4b37242d-6cfa-4db8-9be2-f4d759ef9fbf | OK | 11ms |
| 22 | 17:48:57.591 | Sim75-Handler | Handler dashboard | GET /handler/dashboard | OK | 4ms |
| 23 | 17:48:57.593 | Sim75-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 24 | 17:48:57.594 | Sim75-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 25 | 17:48:57.595 | Sim75-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 26 | 17:48:57.596 | Sim75-Handler | Agent job history | GET /agents/4b37242d-6cfa-4db8-9be2-f4d759ef9fbf/jobs | OK | 1ms |
| 27 | 17:48:57.597 | Sim75-Handler | Agent earnings | GET /agents/4b37242d-6cfa-4db8-9be2-f4d759ef9fbf/earnings | OK | 1ms |
| 28 | 17:48:57.598 | Sim75-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 29 | 17:48:57.599 | Sim75-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 30 | 17:48:57.599 | Sim75-NoAuth | Health check | GET /health | OK | 0ms |

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

