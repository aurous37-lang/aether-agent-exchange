# Shadow Log: Simulation 82

**Started**: 2026-03-22T17:49:04.708Z
**Ended**: 2026-03-22T17:49:05.602Z
**Total Events**: 30
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:04.708 | Sim82-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:04.726 | Sim82-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:49:05.078 | Sim82-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:49:05.093 | Sim82-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:49:05.113 | Sim82-Handler | Register agent | POST /agents | OK | 20ms |
| 6 | 17:49:05.115 | Sim82-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:49:05.128 | Sim82-Client | Post job 2 (dispute path) | POST /jobs | OK | 13ms |
| 8 | 17:49:05.129 | Sim82-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:49:05.132 | Sim82-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:49:05.134 | Sim82-Client | Search jobs | GET /jobs?search=Sim82 | OK | 2ms |
| 11 | 17:49:05.145 | Sim82-Handler | Bid on job 2 | POST /jobs/e20427f1-ea29-477b-9c94-8c0f5a3c39e0/bid | OK | 11ms |
| 12 | 17:49:05.156 | Sim82-Handler | Accept job 2 | POST /jobs/e20427f1-ea29-477b-9c94-8c0f5a3c39e0/accept | OK | 11ms |
| 13 | 17:49:05.175 | Sim82-Handler | Submit deliverable job 2 | POST /jobs/e20427f1-ea29-477b-9c94-8c0f5a3c39e0/submit | OK | 19ms |
| 14 | 17:49:05.194 | Sim82-Client | File dispute | POST /jobs/e20427f1-ea29-477b-9c94-8c0f5a3c39e0/dispute | OK | 19ms |
| 15 | 17:49:05.203 | Sim82-Client | Submit evidence | POST /disputes/2aca8d61-1545-4985-9a00-56804baadf76/evidence | OK | 9ms |
| 16 | 17:49:05.555 | Sim82-Arbiter1 | Request nonce | POST /auth/nonce | OK | 1ms |
| 17 | 17:49:05.571 | Sim82-Arbiter1 | Verify signature | POST /auth/verify | OK | 15ms |
| 18 | 17:49:05.573 | Sim82-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/2aca8d61-1545-4985-9a00-56804baadf76/vote | EXP_FAIL | 2ms |
| 19 | 17:49:05.575 | Sim82-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 20 | 17:49:05.576 | Sim82-Handler | Get agent detail | GET /agents/d73b9749-ffba-4dff-b0d2-5ee6add0b6c4 | OK | 1ms |
| 21 | 17:49:05.587 | Sim82-Handler | Update agent | PUT /agents/d73b9749-ffba-4dff-b0d2-5ee6add0b6c4 | OK | 11ms |
| 22 | 17:49:05.590 | Sim82-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 23 | 17:49:05.593 | Sim82-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 24 | 17:49:05.595 | Sim82-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 25 | 17:49:05.596 | Sim82-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 26 | 17:49:05.597 | Sim82-Handler | Agent job history | GET /agents/d73b9749-ffba-4dff-b0d2-5ee6add0b6c4/jobs | OK | 1ms |
| 27 | 17:49:05.599 | Sim82-Handler | Agent earnings | GET /agents/d73b9749-ffba-4dff-b0d2-5ee6add0b6c4/earnings | OK | 2ms |
| 28 | 17:49:05.600 | Sim82-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 29 | 17:49:05.602 | Sim82-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 30 | 17:49:05.602 | Sim82-NoAuth | Health check | GET /health | OK | 0ms |

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

