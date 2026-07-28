# Shadow Log: Simulation 91

**Started**: 2026-03-22T17:49:14.532Z
**Ended**: 2026-03-22T17:49:15.519Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:14.532 | Sim91-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:49:14.544 | Sim91-Client | Verify signature | POST /auth/verify | OK | 12ms |
| 3 | 17:49:14.896 | Sim91-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:14.914 | Sim91-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:49:14.935 | Sim91-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:49:14.947 | Sim91-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:49:14.959 | Sim91-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:49:14.961 | Sim91-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:49:14.963 | Sim91-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:14.966 | Sim91-Client | Search jobs | GET /jobs?search=Sim91 | OK | 3ms |
| 11 | 17:49:14.967 | Sim91-Client | Get job detail | GET /jobs/f8c66897-101d-4a55-a926-0658f1c18a49 | OK | 1ms |
| 12 | 17:49:14.978 | Sim91-Handler | Place bid on job 1 | POST /jobs/f8c66897-101d-4a55-a926-0658f1c18a49/bid | OK | 11ms |
| 13 | 17:49:14.981 | Sim91-Handler | Duplicate bid (expect 409) | POST /jobs/f8c66897-101d-4a55-a926-0658f1c18a49/bid | EXP_FAIL | 3ms |
| 14 | 17:49:14.998 | Sim91-Client | Register client agent for self-deal test | POST /agents | OK | 17ms |
| 15 | 17:49:15.000 | Sim91-Client | Self-deal bid (expect 403) | POST /jobs/f8c66897-101d-4a55-a926-0658f1c18a49/bid | EXP_FAIL | 2ms |
| 16 | 17:49:15.009 | Sim91-Handler | Accept bid on job 1 | POST /jobs/f8c66897-101d-4a55-a926-0658f1c18a49/accept | OK | 9ms |
| 17 | 17:49:15.028 | Sim91-Handler | Submit deliverable | POST /jobs/f8c66897-101d-4a55-a926-0658f1c18a49/submit | OK | 19ms |
| 18 | 17:49:15.038 | Sim91-Client | Approve deliverable | POST /jobs/f8c66897-101d-4a55-a926-0658f1c18a49/approve | OK | 10ms |
| 19 | 17:49:15.056 | Sim91-Client | Rate agent | POST /jobs/f8c66897-101d-4a55-a926-0658f1c18a49/rate | OK | 18ms |
| 20 | 17:49:15.059 | Sim91-Client | Duplicate rating (expect 409) | POST /jobs/f8c66897-101d-4a55-a926-0658f1c18a49/rate | EXP_FAIL | 3ms |
| 21 | 17:49:15.068 | Sim91-Handler | Bid on job 2 | POST /jobs/bdb5160f-b14c-4c4e-a4ad-cb9ab6fda01c/bid | OK | 9ms |
| 22 | 17:49:15.078 | Sim91-Handler | Accept job 2 | POST /jobs/bdb5160f-b14c-4c4e-a4ad-cb9ab6fda01c/accept | OK | 10ms |
| 23 | 17:49:15.096 | Sim91-Handler | Submit deliverable job 2 | POST /jobs/bdb5160f-b14c-4c4e-a4ad-cb9ab6fda01c/submit | OK | 18ms |
| 24 | 17:49:15.114 | Sim91-Client | File dispute | POST /jobs/bdb5160f-b14c-4c4e-a4ad-cb9ab6fda01c/dispute | OK | 18ms |
| 25 | 17:49:15.124 | Sim91-Client | Submit evidence | POST /disputes/b42ce479-639f-4a81-a1b8-8cb4d8cd5479/evidence | OK | 10ms |
| 26 | 17:49:15.477 | Sim91-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:49:15.494 | Sim91-Arbiter1 | Verify signature | POST /auth/verify | OK | 16ms |
| 28 | 17:49:15.495 | Sim91-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/b42ce479-639f-4a81-a1b8-8cb4d8cd5479/vote | EXP_FAIL | 1ms |
| 29 | 17:49:15.498 | Sim91-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 30 | 17:49:15.500 | Sim91-Handler | Get agent detail | GET /agents/dd8a2a4c-24b7-4932-ab43-3f39f6d4eae3 | OK | 2ms |
| 31 | 17:49:15.510 | Sim91-Handler | Update agent | PUT /agents/dd8a2a4c-24b7-4932-ab43-3f39f6d4eae3 | OK | 10ms |
| 32 | 17:49:15.513 | Sim91-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 33 | 17:49:15.514 | Sim91-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 34 | 17:49:15.515 | Sim91-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 35 | 17:49:15.516 | Sim91-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 36 | 17:49:15.516 | Sim91-Handler | Agent job history | GET /agents/dd8a2a4c-24b7-4932-ab43-3f39f6d4eae3/jobs | OK | 0ms |
| 37 | 17:49:15.517 | Sim91-Handler | Agent earnings | GET /agents/dd8a2a4c-24b7-4932-ab43-3f39f6d4eae3/earnings | OK | 1ms |
| 38 | 17:49:15.518 | Sim91-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:49:15.518 | Sim91-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 0ms |
| 40 | 17:49:15.519 | Sim91-NoAuth | Health check | GET /health | OK | 1ms |

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

