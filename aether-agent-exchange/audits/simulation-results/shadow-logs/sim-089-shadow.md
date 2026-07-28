# Shadow Log: Simulation 89

**Started**: 2026-03-22T17:49:12.389Z
**Ended**: 2026-03-22T17:49:13.385Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:12.389 | Sim89-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:12.405 | Sim89-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:49:12.758 | Sim89-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:12.776 | Sim89-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:49:12.797 | Sim89-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:49:12.807 | Sim89-Client | Post job 1 (happy path) | POST /jobs | OK | 10ms |
| 7 | 17:49:12.818 | Sim89-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:49:12.819 | Sim89-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:49:12.822 | Sim89-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:49:12.824 | Sim89-Client | Search jobs | GET /jobs?search=Sim89 | OK | 2ms |
| 11 | 17:49:12.827 | Sim89-Client | Get job detail | GET /jobs/b41aee5b-8c3a-4b13-85fc-a80981da6f19 | OK | 3ms |
| 12 | 17:49:12.840 | Sim89-Handler | Place bid on job 1 | POST /jobs/b41aee5b-8c3a-4b13-85fc-a80981da6f19/bid | OK | 13ms |
| 13 | 17:49:12.844 | Sim89-Handler | Duplicate bid (expect 409) | POST /jobs/b41aee5b-8c3a-4b13-85fc-a80981da6f19/bid | EXP_FAIL | 4ms |
| 14 | 17:49:12.862 | Sim89-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:49:12.865 | Sim89-Client | Self-deal bid (expect 403) | POST /jobs/b41aee5b-8c3a-4b13-85fc-a80981da6f19/bid | EXP_FAIL | 3ms |
| 16 | 17:49:12.875 | Sim89-Handler | Accept bid on job 1 | POST /jobs/b41aee5b-8c3a-4b13-85fc-a80981da6f19/accept | OK | 10ms |
| 17 | 17:49:12.893 | Sim89-Handler | Submit deliverable | POST /jobs/b41aee5b-8c3a-4b13-85fc-a80981da6f19/submit | OK | 18ms |
| 18 | 17:49:12.903 | Sim89-Client | Approve deliverable | POST /jobs/b41aee5b-8c3a-4b13-85fc-a80981da6f19/approve | OK | 10ms |
| 19 | 17:49:12.920 | Sim89-Client | Rate agent | POST /jobs/b41aee5b-8c3a-4b13-85fc-a80981da6f19/rate | OK | 17ms |
| 20 | 17:49:12.922 | Sim89-Client | Duplicate rating (expect 409) | POST /jobs/b41aee5b-8c3a-4b13-85fc-a80981da6f19/rate | EXP_FAIL | 2ms |
| 21 | 17:49:12.931 | Sim89-Handler | Bid on job 2 | POST /jobs/5be62900-1359-4e86-98ce-63784c6aa0ea/bid | OK | 9ms |
| 22 | 17:49:12.940 | Sim89-Handler | Accept job 2 | POST /jobs/5be62900-1359-4e86-98ce-63784c6aa0ea/accept | OK | 9ms |
| 23 | 17:49:12.958 | Sim89-Handler | Submit deliverable job 2 | POST /jobs/5be62900-1359-4e86-98ce-63784c6aa0ea/submit | OK | 18ms |
| 24 | 17:49:12.978 | Sim89-Client | File dispute | POST /jobs/5be62900-1359-4e86-98ce-63784c6aa0ea/dispute | OK | 20ms |
| 25 | 17:49:12.988 | Sim89-Client | Submit evidence | POST /disputes/299f5d6e-4ee8-4778-b15e-6e7c693a8620/evidence | OK | 10ms |
| 26 | 17:49:13.340 | Sim89-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:49:13.355 | Sim89-Arbiter1 | Verify signature | POST /auth/verify | OK | 14ms |
| 28 | 17:49:13.356 | Sim89-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/299f5d6e-4ee8-4778-b15e-6e7c693a8620/vote | EXP_FAIL | 1ms |
| 29 | 17:49:13.358 | Sim89-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 30 | 17:49:13.361 | Sim89-Handler | Get agent detail | GET /agents/8307f6f7-78de-405d-aec8-10d1cb55b150 | OK | 3ms |
| 31 | 17:49:13.372 | Sim89-Handler | Update agent | PUT /agents/8307f6f7-78de-405d-aec8-10d1cb55b150 | OK | 11ms |
| 32 | 17:49:13.376 | Sim89-Handler | Handler dashboard | GET /handler/dashboard | OK | 4ms |
| 33 | 17:49:13.379 | Sim89-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 34 | 17:49:13.380 | Sim89-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 35 | 17:49:13.381 | Sim89-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 36 | 17:49:13.382 | Sim89-Handler | Agent job history | GET /agents/8307f6f7-78de-405d-aec8-10d1cb55b150/jobs | OK | 1ms |
| 37 | 17:49:13.383 | Sim89-Handler | Agent earnings | GET /agents/8307f6f7-78de-405d-aec8-10d1cb55b150/earnings | OK | 1ms |
| 38 | 17:49:13.384 | Sim89-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:49:13.385 | Sim89-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 40 | 17:49:13.385 | Sim89-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 8: Post job 3 (edge cases)
- **Error**: Validation failed

### Event 13: Duplicate bid (expect 409)
- **Note**: Expected failure: Bid already placed for this agent on this job

### Event 15: Self-deal bid (expect 403)
- **Note**: Expected failure: Cannot bid on your own job

### Event 20: Duplicate rating (expect 409)
- **Note**: Expected failure: You have already rated this job

### Event 28: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 38: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 39: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

