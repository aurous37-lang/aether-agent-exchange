# Shadow Log: Simulation 80

**Started**: 2026-03-22T17:49:02.032Z
**Ended**: 2026-03-22T17:49:03.064Z
**Total Events**: 42
**OK**: 36 | **FAIL**: 0 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:02.032 | Sim80-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:02.050 | Sim80-Client | Verify signature | POST /auth/verify | OK | 18ms |
| 3 | 17:49:02.402 | Sim80-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:49:02.418 | Sim80-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:49:02.440 | Sim80-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:49:02.452 | Sim80-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:49:02.463 | Sim80-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:49:02.474 | Sim80-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:49:02.477 | Sim80-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:49:02.479 | Sim80-Client | Search jobs | GET /jobs?search=Sim80 | OK | 2ms |
| 11 | 17:49:02.481 | Sim80-Client | Get job detail | GET /jobs/45141fe3-165c-4db3-a414-5cfdd4c7cb2c | OK | 2ms |
| 12 | 17:49:02.492 | Sim80-Handler | Place bid on job 1 | POST /jobs/45141fe3-165c-4db3-a414-5cfdd4c7cb2c/bid | OK | 11ms |
| 13 | 17:49:02.496 | Sim80-Handler | Duplicate bid (expect 409) | POST /jobs/45141fe3-165c-4db3-a414-5cfdd4c7cb2c/bid | EXP_FAIL | 4ms |
| 14 | 17:49:02.513 | Sim80-Client | Register client agent for self-deal test | POST /agents | OK | 17ms |
| 15 | 17:49:02.516 | Sim80-Client | Self-deal bid (expect 403) | POST /jobs/45141fe3-165c-4db3-a414-5cfdd4c7cb2c/bid | EXP_FAIL | 3ms |
| 16 | 17:49:02.526 | Sim80-Handler | Accept bid on job 1 | POST /jobs/45141fe3-165c-4db3-a414-5cfdd4c7cb2c/accept | OK | 10ms |
| 17 | 17:49:02.545 | Sim80-Handler | Submit deliverable | POST /jobs/45141fe3-165c-4db3-a414-5cfdd4c7cb2c/submit | OK | 19ms |
| 18 | 17:49:02.555 | Sim80-Client | Approve deliverable | POST /jobs/45141fe3-165c-4db3-a414-5cfdd4c7cb2c/approve | OK | 10ms |
| 19 | 17:49:02.573 | Sim80-Client | Rate agent | POST /jobs/45141fe3-165c-4db3-a414-5cfdd4c7cb2c/rate | OK | 18ms |
| 20 | 17:49:02.575 | Sim80-Client | Duplicate rating (expect 409) | POST /jobs/45141fe3-165c-4db3-a414-5cfdd4c7cb2c/rate | EXP_FAIL | 2ms |
| 21 | 17:49:02.585 | Sim80-Handler | Bid on job 2 | POST /jobs/30749d60-8815-46c8-a8df-6b97e57515f7/bid | OK | 10ms |
| 22 | 17:49:02.595 | Sim80-Handler | Accept job 2 | POST /jobs/30749d60-8815-46c8-a8df-6b97e57515f7/accept | OK | 10ms |
| 23 | 17:49:02.615 | Sim80-Handler | Submit deliverable job 2 | POST /jobs/30749d60-8815-46c8-a8df-6b97e57515f7/submit | OK | 20ms |
| 24 | 17:49:02.635 | Sim80-Client | File dispute | POST /jobs/30749d60-8815-46c8-a8df-6b97e57515f7/dispute | OK | 20ms |
| 25 | 17:49:02.645 | Sim80-Client | Submit evidence | POST /disputes/502eef59-a7a7-4c93-9729-6b0004c43379/evidence | OK | 10ms |
| 26 | 17:49:02.996 | Sim80-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:49:03.009 | Sim80-Arbiter1 | Verify signature | POST /auth/verify | OK | 13ms |
| 28 | 17:49:03.010 | Sim80-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/502eef59-a7a7-4c93-9729-6b0004c43379/vote | EXP_FAIL | 1ms |
| 29 | 17:49:03.021 | Sim80-Client | Update open job | PUT /jobs/00b91f73-1d4e-4d85-b89d-dceb8bf84a4e | OK | 11ms |
| 30 | 17:49:03.033 | Sim80-Client | Cancel open job | DELETE /jobs/00b91f73-1d4e-4d85-b89d-dceb8bf84a4e | OK | 12ms |
| 31 | 17:49:03.036 | Sim80-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 32 | 17:49:03.039 | Sim80-Handler | Get agent detail | GET /agents/3f24edb1-9949-4df8-ac56-32f514037d0e | OK | 3ms |
| 33 | 17:49:03.052 | Sim80-Handler | Update agent | PUT /agents/3f24edb1-9949-4df8-ac56-32f514037d0e | OK | 13ms |
| 34 | 17:49:03.054 | Sim80-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 35 | 17:49:03.056 | Sim80-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 36 | 17:49:03.057 | Sim80-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 37 | 17:49:03.058 | Sim80-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 38 | 17:49:03.060 | Sim80-Handler | Agent job history | GET /agents/3f24edb1-9949-4df8-ac56-32f514037d0e/jobs | OK | 2ms |
| 39 | 17:49:03.062 | Sim80-Handler | Agent earnings | GET /agents/3f24edb1-9949-4df8-ac56-32f514037d0e/earnings | OK | 2ms |
| 40 | 17:49:03.063 | Sim80-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 41 | 17:49:03.064 | Sim80-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 42 | 17:49:03.064 | Sim80-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 13: Duplicate bid (expect 409)
- **Note**: Expected failure: Bid already placed for this agent on this job

### Event 15: Self-deal bid (expect 403)
- **Note**: Expected failure: Cannot bid on your own job

### Event 20: Duplicate rating (expect 409)
- **Note**: Expected failure: You have already rated this job

### Event 28: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 40: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 41: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

