# Shadow Log: Simulation 27

**Started**: 2026-03-22T17:48:18.216Z
**Ended**: 2026-03-22T17:48:19.225Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:18.216 | Sim27-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:18.232 | Sim27-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:48:18.585 | Sim27-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:18.602 | Sim27-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:18.625 | Sim27-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:48:18.637 | Sim27-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:18.649 | Sim27-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:48:18.651 | Sim27-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:48:18.653 | Sim27-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:18.655 | Sim27-Client | Search jobs | GET /jobs?search=Sim27 | OK | 2ms |
| 11 | 17:48:18.657 | Sim27-Client | Get job detail | GET /jobs/c56e1327-03b3-4e99-a6ff-55421c05af35 | OK | 2ms |
| 12 | 17:48:18.668 | Sim27-Handler | Place bid on job 1 | POST /jobs/c56e1327-03b3-4e99-a6ff-55421c05af35/bid | OK | 11ms |
| 13 | 17:48:18.672 | Sim27-Handler | Duplicate bid (expect 409) | POST /jobs/c56e1327-03b3-4e99-a6ff-55421c05af35/bid | EXP_FAIL | 4ms |
| 14 | 17:48:18.690 | Sim27-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:48:18.694 | Sim27-Client | Self-deal bid (expect 403) | POST /jobs/c56e1327-03b3-4e99-a6ff-55421c05af35/bid | EXP_FAIL | 4ms |
| 16 | 17:48:18.706 | Sim27-Handler | Accept bid on job 1 | POST /jobs/c56e1327-03b3-4e99-a6ff-55421c05af35/accept | OK | 12ms |
| 17 | 17:48:18.724 | Sim27-Handler | Submit deliverable | POST /jobs/c56e1327-03b3-4e99-a6ff-55421c05af35/submit | OK | 18ms |
| 18 | 17:48:18.733 | Sim27-Client | Approve deliverable | POST /jobs/c56e1327-03b3-4e99-a6ff-55421c05af35/approve | OK | 9ms |
| 19 | 17:48:18.751 | Sim27-Client | Rate agent | POST /jobs/c56e1327-03b3-4e99-a6ff-55421c05af35/rate | OK | 18ms |
| 20 | 17:48:18.755 | Sim27-Client | Duplicate rating (expect 409) | POST /jobs/c56e1327-03b3-4e99-a6ff-55421c05af35/rate | EXP_FAIL | 4ms |
| 21 | 17:48:18.767 | Sim27-Handler | Bid on job 2 | POST /jobs/3653b5a4-ac1c-47e0-bff6-bca2a8cbcc7a/bid | OK | 12ms |
| 22 | 17:48:18.777 | Sim27-Handler | Accept job 2 | POST /jobs/3653b5a4-ac1c-47e0-bff6-bca2a8cbcc7a/accept | OK | 10ms |
| 23 | 17:48:18.795 | Sim27-Handler | Submit deliverable job 2 | POST /jobs/3653b5a4-ac1c-47e0-bff6-bca2a8cbcc7a/submit | OK | 18ms |
| 24 | 17:48:18.813 | Sim27-Client | File dispute | POST /jobs/3653b5a4-ac1c-47e0-bff6-bca2a8cbcc7a/dispute | OK | 18ms |
| 25 | 17:48:18.823 | Sim27-Client | Submit evidence | POST /disputes/aaafdf1c-22ce-4d53-90a0-4470d742bdfe/evidence | OK | 10ms |
| 26 | 17:48:19.176 | Sim27-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:48:19.192 | Sim27-Arbiter1 | Verify signature | POST /auth/verify | OK | 15ms |
| 28 | 17:48:19.193 | Sim27-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/aaafdf1c-22ce-4d53-90a0-4470d742bdfe/vote | EXP_FAIL | 1ms |
| 29 | 17:48:19.196 | Sim27-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 30 | 17:48:19.199 | Sim27-Handler | Get agent detail | GET /agents/a849c6c0-1092-43cd-b7f1-fc7bdd9ae619 | OK | 3ms |
| 31 | 17:48:19.211 | Sim27-Handler | Update agent | PUT /agents/a849c6c0-1092-43cd-b7f1-fc7bdd9ae619 | OK | 12ms |
| 32 | 17:48:19.213 | Sim27-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 33 | 17:48:19.216 | Sim27-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 34 | 17:48:19.217 | Sim27-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 35 | 17:48:19.219 | Sim27-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 36 | 17:48:19.221 | Sim27-Handler | Agent job history | GET /agents/a849c6c0-1092-43cd-b7f1-fc7bdd9ae619/jobs | OK | 2ms |
| 37 | 17:48:19.222 | Sim27-Handler | Agent earnings | GET /agents/a849c6c0-1092-43cd-b7f1-fc7bdd9ae619/earnings | OK | 1ms |
| 38 | 17:48:19.223 | Sim27-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:48:19.225 | Sim27-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 40 | 17:48:19.225 | Sim27-NoAuth | Health check | GET /health | OK | 0ms |

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

