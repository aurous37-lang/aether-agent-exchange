# Shadow Log: Simulation 11

**Started**: 2026-03-22T17:48:00.918Z
**Ended**: 2026-03-22T17:48:01.929Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:00.918 | Sim11-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:00.935 | Sim11-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:48:01.289 | Sim11-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:48:01.303 | Sim11-Handler | Verify signature | POST /auth/verify | OK | 14ms |
| 5 | 17:48:01.324 | Sim11-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:48:01.337 | Sim11-Client | Post job 1 (happy path) | POST /jobs | OK | 13ms |
| 7 | 17:48:01.349 | Sim11-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:48:01.351 | Sim11-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:48:01.352 | Sim11-Client | List jobs | GET /jobs?limit=10 | OK | 1ms |
| 10 | 17:48:01.354 | Sim11-Client | Search jobs | GET /jobs?search=Sim11 | OK | 2ms |
| 11 | 17:48:01.355 | Sim11-Client | Get job detail | GET /jobs/f72b1341-2eb3-4d26-9414-ef0a9f2f4d68 | OK | 1ms |
| 12 | 17:48:01.367 | Sim11-Handler | Place bid on job 1 | POST /jobs/f72b1341-2eb3-4d26-9414-ef0a9f2f4d68/bid | OK | 12ms |
| 13 | 17:48:01.371 | Sim11-Handler | Duplicate bid (expect 409) | POST /jobs/f72b1341-2eb3-4d26-9414-ef0a9f2f4d68/bid | EXP_FAIL | 4ms |
| 14 | 17:48:01.390 | Sim11-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:48:01.394 | Sim11-Client | Self-deal bid (expect 403) | POST /jobs/f72b1341-2eb3-4d26-9414-ef0a9f2f4d68/bid | EXP_FAIL | 4ms |
| 16 | 17:48:01.406 | Sim11-Handler | Accept bid on job 1 | POST /jobs/f72b1341-2eb3-4d26-9414-ef0a9f2f4d68/accept | OK | 11ms |
| 17 | 17:48:01.424 | Sim11-Handler | Submit deliverable | POST /jobs/f72b1341-2eb3-4d26-9414-ef0a9f2f4d68/submit | OK | 18ms |
| 18 | 17:48:01.435 | Sim11-Client | Approve deliverable | POST /jobs/f72b1341-2eb3-4d26-9414-ef0a9f2f4d68/approve | OK | 11ms |
| 19 | 17:48:01.453 | Sim11-Client | Rate agent | POST /jobs/f72b1341-2eb3-4d26-9414-ef0a9f2f4d68/rate | OK | 18ms |
| 20 | 17:48:01.456 | Sim11-Client | Duplicate rating (expect 409) | POST /jobs/f72b1341-2eb3-4d26-9414-ef0a9f2f4d68/rate | EXP_FAIL | 3ms |
| 21 | 17:48:01.467 | Sim11-Handler | Bid on job 2 | POST /jobs/ab6c3c73-9ac2-4bac-b077-d74de5fb3661/bid | OK | 11ms |
| 22 | 17:48:01.478 | Sim11-Handler | Accept job 2 | POST /jobs/ab6c3c73-9ac2-4bac-b077-d74de5fb3661/accept | OK | 11ms |
| 23 | 17:48:01.497 | Sim11-Handler | Submit deliverable job 2 | POST /jobs/ab6c3c73-9ac2-4bac-b077-d74de5fb3661/submit | OK | 19ms |
| 24 | 17:48:01.514 | Sim11-Client | File dispute | POST /jobs/ab6c3c73-9ac2-4bac-b077-d74de5fb3661/dispute | OK | 17ms |
| 25 | 17:48:01.524 | Sim11-Client | Submit evidence | POST /disputes/a0359955-c8e3-4415-99d2-e8f7149341f7/evidence | OK | 10ms |
| 26 | 17:48:01.876 | Sim11-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:48:01.895 | Sim11-Arbiter1 | Verify signature | POST /auth/verify | OK | 18ms |
| 28 | 17:48:01.896 | Sim11-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/a0359955-c8e3-4415-99d2-e8f7149341f7/vote | EXP_FAIL | 1ms |
| 29 | 17:48:01.899 | Sim11-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 30 | 17:48:01.901 | Sim11-Handler | Get agent detail | GET /agents/b225b50e-aa2b-42e0-a510-a572e06c5d05 | OK | 2ms |
| 31 | 17:48:01.912 | Sim11-Handler | Update agent | PUT /agents/b225b50e-aa2b-42e0-a510-a572e06c5d05 | OK | 11ms |
| 32 | 17:48:01.915 | Sim11-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 33 | 17:48:01.917 | Sim11-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 34 | 17:48:01.920 | Sim11-Handler | Get notifications | GET /handler/notifications | OK | 3ms |
| 35 | 17:48:01.922 | Sim11-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 36 | 17:48:01.924 | Sim11-Handler | Agent job history | GET /agents/b225b50e-aa2b-42e0-a510-a572e06c5d05/jobs | OK | 2ms |
| 37 | 17:48:01.926 | Sim11-Handler | Agent earnings | GET /agents/b225b50e-aa2b-42e0-a510-a572e06c5d05/earnings | OK | 2ms |
| 38 | 17:48:01.927 | Sim11-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:48:01.928 | Sim11-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 40 | 17:48:01.929 | Sim11-NoAuth | Health check | GET /health | OK | 1ms |

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

