# Shadow Log: Simulation 25

**Started**: 2026-03-22T17:48:15.938Z
**Ended**: 2026-03-22T17:48:16.951Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:15.938 | Sim25-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:15.955 | Sim25-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:48:16.308 | Sim25-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:16.324 | Sim25-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:48:16.347 | Sim25-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:48:16.358 | Sim25-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:48:16.369 | Sim25-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:48:16.371 | Sim25-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:48:16.374 | Sim25-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:16.377 | Sim25-Client | Search jobs | GET /jobs?search=Sim25 | OK | 3ms |
| 11 | 17:48:16.379 | Sim25-Client | Get job detail | GET /jobs/8db6d80f-5c02-4c8f-9fb7-5679033a0164 | OK | 2ms |
| 12 | 17:48:16.391 | Sim25-Handler | Place bid on job 1 | POST /jobs/8db6d80f-5c02-4c8f-9fb7-5679033a0164/bid | OK | 12ms |
| 13 | 17:48:16.395 | Sim25-Handler | Duplicate bid (expect 409) | POST /jobs/8db6d80f-5c02-4c8f-9fb7-5679033a0164/bid | EXP_FAIL | 4ms |
| 14 | 17:48:16.413 | Sim25-Client | Register client agent for self-deal test | POST /agents | OK | 17ms |
| 15 | 17:48:16.417 | Sim25-Client | Self-deal bid (expect 403) | POST /jobs/8db6d80f-5c02-4c8f-9fb7-5679033a0164/bid | EXP_FAIL | 4ms |
| 16 | 17:48:16.428 | Sim25-Handler | Accept bid on job 1 | POST /jobs/8db6d80f-5c02-4c8f-9fb7-5679033a0164/accept | OK | 11ms |
| 17 | 17:48:16.447 | Sim25-Handler | Submit deliverable | POST /jobs/8db6d80f-5c02-4c8f-9fb7-5679033a0164/submit | OK | 19ms |
| 18 | 17:48:16.457 | Sim25-Client | Approve deliverable | POST /jobs/8db6d80f-5c02-4c8f-9fb7-5679033a0164/approve | OK | 10ms |
| 19 | 17:48:16.475 | Sim25-Client | Rate agent | POST /jobs/8db6d80f-5c02-4c8f-9fb7-5679033a0164/rate | OK | 18ms |
| 20 | 17:48:16.479 | Sim25-Client | Duplicate rating (expect 409) | POST /jobs/8db6d80f-5c02-4c8f-9fb7-5679033a0164/rate | EXP_FAIL | 4ms |
| 21 | 17:48:16.490 | Sim25-Handler | Bid on job 2 | POST /jobs/c888974a-7d0d-4f6e-8b39-a4cf32a81d4b/bid | OK | 11ms |
| 22 | 17:48:16.501 | Sim25-Handler | Accept job 2 | POST /jobs/c888974a-7d0d-4f6e-8b39-a4cf32a81d4b/accept | OK | 11ms |
| 23 | 17:48:16.521 | Sim25-Handler | Submit deliverable job 2 | POST /jobs/c888974a-7d0d-4f6e-8b39-a4cf32a81d4b/submit | OK | 20ms |
| 24 | 17:48:16.538 | Sim25-Client | File dispute | POST /jobs/c888974a-7d0d-4f6e-8b39-a4cf32a81d4b/dispute | OK | 17ms |
| 25 | 17:48:16.549 | Sim25-Client | Submit evidence | POST /disputes/bcfa6af1-245c-4d2f-9db7-274bf7c86723/evidence | OK | 11ms |
| 26 | 17:48:16.902 | Sim25-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:48:16.918 | Sim25-Arbiter1 | Verify signature | POST /auth/verify | OK | 16ms |
| 28 | 17:48:16.919 | Sim25-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/bcfa6af1-245c-4d2f-9db7-274bf7c86723/vote | EXP_FAIL | 1ms |
| 29 | 17:48:16.922 | Sim25-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 30 | 17:48:16.926 | Sim25-Handler | Get agent detail | GET /agents/150e5726-245d-48d2-b2a0-0afb89dd7d7d | OK | 4ms |
| 31 | 17:48:16.937 | Sim25-Handler | Update agent | PUT /agents/150e5726-245d-48d2-b2a0-0afb89dd7d7d | OK | 11ms |
| 32 | 17:48:16.940 | Sim25-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 33 | 17:48:16.942 | Sim25-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 34 | 17:48:16.944 | Sim25-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 35 | 17:48:16.946 | Sim25-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 36 | 17:48:16.947 | Sim25-Handler | Agent job history | GET /agents/150e5726-245d-48d2-b2a0-0afb89dd7d7d/jobs | OK | 1ms |
| 37 | 17:48:16.949 | Sim25-Handler | Agent earnings | GET /agents/150e5726-245d-48d2-b2a0-0afb89dd7d7d/earnings | OK | 2ms |
| 38 | 17:48:16.950 | Sim25-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:48:16.951 | Sim25-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 40 | 17:48:16.951 | Sim25-NoAuth | Health check | GET /health | OK | 0ms |

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

