# Shadow Log: Simulation 1

**Started**: 2026-03-22T17:47:49.342Z
**Ended**: 2026-03-22T17:47:50.498Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:47:49.342 | Sim1-Client | Request nonce | POST /auth/nonce | OK | 12ms |
| 2 | 17:47:49.381 | Sim1-Client | Verify signature | POST /auth/verify | OK | 37ms |
| 3 | 17:47:49.735 | Sim1-Handler | Request nonce | POST /auth/nonce | OK | 4ms |
| 4 | 17:47:49.755 | Sim1-Handler | Verify signature | POST /auth/verify | OK | 19ms |
| 5 | 17:47:49.876 | Sim1-Handler | Register agent | POST /agents | OK | 121ms |
| 6 | 17:47:49.891 | Sim1-Client | Post job 1 (happy path) | POST /jobs | OK | 15ms |
| 7 | 17:47:49.905 | Sim1-Client | Post job 2 (dispute path) | POST /jobs | OK | 14ms |
| 8 | 17:47:49.910 | Sim1-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 5ms |
| 9 | 17:47:49.915 | Sim1-Client | List jobs | GET /jobs?limit=10 | OK | 5ms |
| 10 | 17:47:49.918 | Sim1-Client | Search jobs | GET /jobs?search=Sim1 | OK | 3ms |
| 11 | 17:47:49.920 | Sim1-Client | Get job detail | GET /jobs/40f13048-36e6-4c97-8e26-38bd522688d6 | OK | 2ms |
| 12 | 17:47:49.933 | Sim1-Handler | Place bid on job 1 | POST /jobs/40f13048-36e6-4c97-8e26-38bd522688d6/bid | OK | 13ms |
| 13 | 17:47:49.936 | Sim1-Handler | Duplicate bid (expect 409) | POST /jobs/40f13048-36e6-4c97-8e26-38bd522688d6/bid | EXP_FAIL | 3ms |
| 14 | 17:47:49.955 | Sim1-Client | Register client agent for self-deal test | POST /agents | OK | 19ms |
| 15 | 17:47:49.958 | Sim1-Client | Self-deal bid (expect 403) | POST /jobs/40f13048-36e6-4c97-8e26-38bd522688d6/bid | EXP_FAIL | 3ms |
| 16 | 17:47:49.967 | Sim1-Handler | Accept bid on job 1 | POST /jobs/40f13048-36e6-4c97-8e26-38bd522688d6/accept | OK | 9ms |
| 17 | 17:47:49.987 | Sim1-Handler | Submit deliverable | POST /jobs/40f13048-36e6-4c97-8e26-38bd522688d6/submit | OK | 20ms |
| 18 | 17:47:49.998 | Sim1-Client | Approve deliverable | POST /jobs/40f13048-36e6-4c97-8e26-38bd522688d6/approve | OK | 11ms |
| 19 | 17:47:50.019 | Sim1-Client | Rate agent | POST /jobs/40f13048-36e6-4c97-8e26-38bd522688d6/rate | OK | 21ms |
| 20 | 17:47:50.022 | Sim1-Client | Duplicate rating (expect 409) | POST /jobs/40f13048-36e6-4c97-8e26-38bd522688d6/rate | EXP_FAIL | 3ms |
| 21 | 17:47:50.032 | Sim1-Handler | Bid on job 2 | POST /jobs/7f70fb6d-1e19-48a1-89ae-2a87f8e7f05c/bid | OK | 10ms |
| 22 | 17:47:50.042 | Sim1-Handler | Accept job 2 | POST /jobs/7f70fb6d-1e19-48a1-89ae-2a87f8e7f05c/accept | OK | 10ms |
| 23 | 17:47:50.062 | Sim1-Handler | Submit deliverable job 2 | POST /jobs/7f70fb6d-1e19-48a1-89ae-2a87f8e7f05c/submit | OK | 20ms |
| 24 | 17:47:50.081 | Sim1-Client | File dispute | POST /jobs/7f70fb6d-1e19-48a1-89ae-2a87f8e7f05c/dispute | OK | 19ms |
| 25 | 17:47:50.091 | Sim1-Client | Submit evidence | POST /disputes/8a9bb4db-6626-4217-906d-d356d56e7968/evidence | OK | 10ms |
| 26 | 17:47:50.444 | Sim1-Arbiter1 | Request nonce | POST /auth/nonce | OK | 3ms |
| 27 | 17:47:50.463 | Sim1-Arbiter1 | Verify signature | POST /auth/verify | OK | 18ms |
| 28 | 17:47:50.465 | Sim1-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/8a9bb4db-6626-4217-906d-d356d56e7968/vote | EXP_FAIL | 2ms |
| 29 | 17:47:50.467 | Sim1-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 30 | 17:47:50.469 | Sim1-Handler | Get agent detail | GET /agents/afd93c82-0742-486c-b56d-97385a01a075 | OK | 2ms |
| 31 | 17:47:50.481 | Sim1-Handler | Update agent | PUT /agents/afd93c82-0742-486c-b56d-97385a01a075 | OK | 12ms |
| 32 | 17:47:50.486 | Sim1-Handler | Handler dashboard | GET /handler/dashboard | OK | 5ms |
| 33 | 17:47:50.488 | Sim1-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 34 | 17:47:50.490 | Sim1-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 35 | 17:47:50.492 | Sim1-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 36 | 17:47:50.494 | Sim1-Handler | Agent job history | GET /agents/afd93c82-0742-486c-b56d-97385a01a075/jobs | OK | 2ms |
| 37 | 17:47:50.495 | Sim1-Handler | Agent earnings | GET /agents/afd93c82-0742-486c-b56d-97385a01a075/earnings | OK | 1ms |
| 38 | 17:47:50.496 | Sim1-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:47:50.497 | Sim1-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 40 | 17:47:50.498 | Sim1-NoAuth | Health check | GET /health | OK | 1ms |

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

