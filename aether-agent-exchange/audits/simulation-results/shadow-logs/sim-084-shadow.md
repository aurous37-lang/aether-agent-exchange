# Shadow Log: Simulation 84

**Started**: 2026-03-22T17:49:06.752Z
**Ended**: 2026-03-22T17:49:07.782Z
**Total Events**: 42
**OK**: 36 | **FAIL**: 0 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:06.752 | Sim84-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:06.769 | Sim84-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:49:07.121 | Sim84-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:07.137 | Sim84-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:49:07.159 | Sim84-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:49:07.174 | Sim84-Client | Post job 1 (happy path) | POST /jobs | OK | 15ms |
| 7 | 17:49:07.185 | Sim84-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:49:07.196 | Sim84-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:49:07.198 | Sim84-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:07.201 | Sim84-Client | Search jobs | GET /jobs?search=Sim84 | OK | 3ms |
| 11 | 17:49:07.203 | Sim84-Client | Get job detail | GET /jobs/cefcef2f-e99f-45c4-ba05-5719fdf49317 | OK | 2ms |
| 12 | 17:49:07.215 | Sim84-Handler | Place bid on job 1 | POST /jobs/cefcef2f-e99f-45c4-ba05-5719fdf49317/bid | OK | 12ms |
| 13 | 17:49:07.218 | Sim84-Handler | Duplicate bid (expect 409) | POST /jobs/cefcef2f-e99f-45c4-ba05-5719fdf49317/bid | EXP_FAIL | 3ms |
| 14 | 17:49:07.233 | Sim84-Client | Register client agent for self-deal test | POST /agents | OK | 15ms |
| 15 | 17:49:07.236 | Sim84-Client | Self-deal bid (expect 403) | POST /jobs/cefcef2f-e99f-45c4-ba05-5719fdf49317/bid | EXP_FAIL | 3ms |
| 16 | 17:49:07.246 | Sim84-Handler | Accept bid on job 1 | POST /jobs/cefcef2f-e99f-45c4-ba05-5719fdf49317/accept | OK | 10ms |
| 17 | 17:49:07.264 | Sim84-Handler | Submit deliverable | POST /jobs/cefcef2f-e99f-45c4-ba05-5719fdf49317/submit | OK | 18ms |
| 18 | 17:49:07.275 | Sim84-Client | Approve deliverable | POST /jobs/cefcef2f-e99f-45c4-ba05-5719fdf49317/approve | OK | 11ms |
| 19 | 17:49:07.293 | Sim84-Client | Rate agent | POST /jobs/cefcef2f-e99f-45c4-ba05-5719fdf49317/rate | OK | 18ms |
| 20 | 17:49:07.295 | Sim84-Client | Duplicate rating (expect 409) | POST /jobs/cefcef2f-e99f-45c4-ba05-5719fdf49317/rate | EXP_FAIL | 2ms |
| 21 | 17:49:07.305 | Sim84-Handler | Bid on job 2 | POST /jobs/b5e13adf-da33-43f9-aff7-57d89631890e/bid | OK | 10ms |
| 22 | 17:49:07.315 | Sim84-Handler | Accept job 2 | POST /jobs/b5e13adf-da33-43f9-aff7-57d89631890e/accept | OK | 10ms |
| 23 | 17:49:07.333 | Sim84-Handler | Submit deliverable job 2 | POST /jobs/b5e13adf-da33-43f9-aff7-57d89631890e/submit | OK | 18ms |
| 24 | 17:49:07.351 | Sim84-Client | File dispute | POST /jobs/b5e13adf-da33-43f9-aff7-57d89631890e/dispute | OK | 18ms |
| 25 | 17:49:07.361 | Sim84-Client | Submit evidence | POST /disputes/49fe24b5-52a2-4962-b1c8-82e4280b89d9/evidence | OK | 9ms |
| 26 | 17:49:07.713 | Sim84-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:49:07.728 | Sim84-Arbiter1 | Verify signature | POST /auth/verify | OK | 15ms |
| 28 | 17:49:07.729 | Sim84-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/49fe24b5-52a2-4962-b1c8-82e4280b89d9/vote | EXP_FAIL | 1ms |
| 29 | 17:49:07.740 | Sim84-Client | Update open job | PUT /jobs/57961bda-2df8-47aa-b38f-e5152de12e2a | OK | 11ms |
| 30 | 17:49:07.750 | Sim84-Client | Cancel open job | DELETE /jobs/57961bda-2df8-47aa-b38f-e5152de12e2a | OK | 10ms |
| 31 | 17:49:07.753 | Sim84-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 32 | 17:49:07.755 | Sim84-Handler | Get agent detail | GET /agents/2e8da112-6747-4084-aa7d-9d33f07622ac | OK | 2ms |
| 33 | 17:49:07.765 | Sim84-Handler | Update agent | PUT /agents/2e8da112-6747-4084-aa7d-9d33f07622ac | OK | 10ms |
| 34 | 17:49:07.768 | Sim84-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 35 | 17:49:07.771 | Sim84-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 36 | 17:49:07.772 | Sim84-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 37 | 17:49:07.773 | Sim84-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 38 | 17:49:07.775 | Sim84-Handler | Agent job history | GET /agents/2e8da112-6747-4084-aa7d-9d33f07622ac/jobs | OK | 2ms |
| 39 | 17:49:07.778 | Sim84-Handler | Agent earnings | GET /agents/2e8da112-6747-4084-aa7d-9d33f07622ac/earnings | OK | 3ms |
| 40 | 17:49:07.779 | Sim84-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 41 | 17:49:07.781 | Sim84-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 42 | 17:49:07.782 | Sim84-NoAuth | Health check | GET /health | OK | 1ms |

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

