# Shadow Log: Simulation 12

**Started**: 2026-03-22T17:48:02.284Z
**Ended**: 2026-03-22T17:48:03.292Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:02.284 | Sim12-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:02.298 | Sim12-Client | Verify signature | POST /auth/verify | OK | 14ms |
| 3 | 17:48:02.651 | Sim12-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:02.668 | Sim12-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:02.688 | Sim12-Handler | Register agent | POST /agents | OK | 20ms |
| 6 | 17:48:02.700 | Sim12-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:02.712 | Sim12-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:48:02.715 | Sim12-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 3ms |
| 9 | 17:48:02.717 | Sim12-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:02.720 | Sim12-Client | Search jobs | GET /jobs?search=Sim12 | OK | 3ms |
| 11 | 17:48:02.722 | Sim12-Client | Get job detail | GET /jobs/24ed6c16-36e8-4464-8d0b-3fc183c745a8 | OK | 2ms |
| 12 | 17:48:02.735 | Sim12-Handler | Place bid on job 1 | POST /jobs/24ed6c16-36e8-4464-8d0b-3fc183c745a8/bid | OK | 13ms |
| 13 | 17:48:02.739 | Sim12-Handler | Duplicate bid (expect 409) | POST /jobs/24ed6c16-36e8-4464-8d0b-3fc183c745a8/bid | EXP_FAIL | 4ms |
| 14 | 17:48:02.757 | Sim12-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:48:02.760 | Sim12-Client | Self-deal bid (expect 403) | POST /jobs/24ed6c16-36e8-4464-8d0b-3fc183c745a8/bid | EXP_FAIL | 3ms |
| 16 | 17:48:02.770 | Sim12-Handler | Accept bid on job 1 | POST /jobs/24ed6c16-36e8-4464-8d0b-3fc183c745a8/accept | OK | 10ms |
| 17 | 17:48:02.789 | Sim12-Handler | Submit deliverable | POST /jobs/24ed6c16-36e8-4464-8d0b-3fc183c745a8/submit | OK | 19ms |
| 18 | 17:48:02.800 | Sim12-Client | Approve deliverable | POST /jobs/24ed6c16-36e8-4464-8d0b-3fc183c745a8/approve | OK | 11ms |
| 19 | 17:48:02.818 | Sim12-Client | Rate agent | POST /jobs/24ed6c16-36e8-4464-8d0b-3fc183c745a8/rate | OK | 18ms |
| 20 | 17:48:02.821 | Sim12-Client | Duplicate rating (expect 409) | POST /jobs/24ed6c16-36e8-4464-8d0b-3fc183c745a8/rate | EXP_FAIL | 3ms |
| 21 | 17:48:02.832 | Sim12-Handler | Bid on job 2 | POST /jobs/999b5454-f20f-47f8-aee6-33b97ae66133/bid | OK | 11ms |
| 22 | 17:48:02.843 | Sim12-Handler | Accept job 2 | POST /jobs/999b5454-f20f-47f8-aee6-33b97ae66133/accept | OK | 11ms |
| 23 | 17:48:02.861 | Sim12-Handler | Submit deliverable job 2 | POST /jobs/999b5454-f20f-47f8-aee6-33b97ae66133/submit | OK | 18ms |
| 24 | 17:48:02.879 | Sim12-Client | File dispute | POST /jobs/999b5454-f20f-47f8-aee6-33b97ae66133/dispute | OK | 18ms |
| 25 | 17:48:02.889 | Sim12-Client | Submit evidence | POST /disputes/bb24e539-2b62-4e1e-a860-e4d381f9f0fb/evidence | OK | 10ms |
| 26 | 17:48:03.242 | Sim12-Arbiter1 | Request nonce | POST /auth/nonce | OK | 3ms |
| 27 | 17:48:03.258 | Sim12-Arbiter1 | Verify signature | POST /auth/verify | OK | 16ms |
| 28 | 17:48:03.259 | Sim12-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/bb24e539-2b62-4e1e-a860-e4d381f9f0fb/vote | EXP_FAIL | 1ms |
| 29 | 17:48:03.263 | Sim12-Handler | List agents | GET /agents?limit=10 | OK | 4ms |
| 30 | 17:48:03.265 | Sim12-Handler | Get agent detail | GET /agents/2b643dfe-b90b-4606-96b5-9f1c98da9a69 | OK | 2ms |
| 31 | 17:48:03.276 | Sim12-Handler | Update agent | PUT /agents/2b643dfe-b90b-4606-96b5-9f1c98da9a69 | OK | 11ms |
| 32 | 17:48:03.279 | Sim12-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 33 | 17:48:03.282 | Sim12-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 34 | 17:48:03.283 | Sim12-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 35 | 17:48:03.285 | Sim12-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 36 | 17:48:03.287 | Sim12-Handler | Agent job history | GET /agents/2b643dfe-b90b-4606-96b5-9f1c98da9a69/jobs | OK | 2ms |
| 37 | 17:48:03.288 | Sim12-Handler | Agent earnings | GET /agents/2b643dfe-b90b-4606-96b5-9f1c98da9a69/earnings | OK | 1ms |
| 38 | 17:48:03.289 | Sim12-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:48:03.292 | Sim12-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 3ms |
| 40 | 17:48:03.292 | Sim12-NoAuth | Health check | GET /health | OK | 0ms |

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

