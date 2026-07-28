# Shadow Log: Simulation 5

**Started**: 2026-03-22T17:47:53.906Z
**Ended**: 2026-03-22T17:47:54.955Z
**Total Events**: 42
**OK**: 36 | **FAIL**: 0 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:47:53.906 | Sim5-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:47:53.923 | Sim5-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:47:54.276 | Sim5-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:47:54.293 | Sim5-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:47:54.315 | Sim5-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:47:54.327 | Sim5-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:47:54.338 | Sim5-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:47:54.350 | Sim5-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:47:54.352 | Sim5-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:47:54.354 | Sim5-Client | Search jobs | GET /jobs?search=Sim5 | OK | 2ms |
| 11 | 17:47:54.356 | Sim5-Client | Get job detail | GET /jobs/4fef9665-403f-453e-ac7b-8cca8f7f0a12 | OK | 2ms |
| 12 | 17:47:54.368 | Sim5-Handler | Place bid on job 1 | POST /jobs/4fef9665-403f-453e-ac7b-8cca8f7f0a12/bid | OK | 12ms |
| 13 | 17:47:54.372 | Sim5-Handler | Duplicate bid (expect 409) | POST /jobs/4fef9665-403f-453e-ac7b-8cca8f7f0a12/bid | EXP_FAIL | 4ms |
| 14 | 17:47:54.390 | Sim5-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:47:54.394 | Sim5-Client | Self-deal bid (expect 403) | POST /jobs/4fef9665-403f-453e-ac7b-8cca8f7f0a12/bid | EXP_FAIL | 4ms |
| 16 | 17:47:54.405 | Sim5-Handler | Accept bid on job 1 | POST /jobs/4fef9665-403f-453e-ac7b-8cca8f7f0a12/accept | OK | 11ms |
| 17 | 17:47:54.424 | Sim5-Handler | Submit deliverable | POST /jobs/4fef9665-403f-453e-ac7b-8cca8f7f0a12/submit | OK | 19ms |
| 18 | 17:47:54.434 | Sim5-Client | Approve deliverable | POST /jobs/4fef9665-403f-453e-ac7b-8cca8f7f0a12/approve | OK | 10ms |
| 19 | 17:47:54.452 | Sim5-Client | Rate agent | POST /jobs/4fef9665-403f-453e-ac7b-8cca8f7f0a12/rate | OK | 18ms |
| 20 | 17:47:54.455 | Sim5-Client | Duplicate rating (expect 409) | POST /jobs/4fef9665-403f-453e-ac7b-8cca8f7f0a12/rate | EXP_FAIL | 3ms |
| 21 | 17:47:54.465 | Sim5-Handler | Bid on job 2 | POST /jobs/eeac7b5e-93a6-45c4-9e2b-9064369007a5/bid | OK | 10ms |
| 22 | 17:47:54.477 | Sim5-Handler | Accept job 2 | POST /jobs/eeac7b5e-93a6-45c4-9e2b-9064369007a5/accept | OK | 12ms |
| 23 | 17:47:54.495 | Sim5-Handler | Submit deliverable job 2 | POST /jobs/eeac7b5e-93a6-45c4-9e2b-9064369007a5/submit | OK | 17ms |
| 24 | 17:47:54.516 | Sim5-Client | File dispute | POST /jobs/eeac7b5e-93a6-45c4-9e2b-9064369007a5/dispute | OK | 21ms |
| 25 | 17:47:54.527 | Sim5-Client | Submit evidence | POST /disputes/c37fd98e-b488-4af1-a386-b1045ce0a629/evidence | OK | 11ms |
| 26 | 17:47:54.880 | Sim5-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:47:54.896 | Sim5-Arbiter1 | Verify signature | POST /auth/verify | OK | 16ms |
| 28 | 17:47:54.898 | Sim5-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/c37fd98e-b488-4af1-a386-b1045ce0a629/vote | EXP_FAIL | 2ms |
| 29 | 17:47:54.909 | Sim5-Client | Update open job | PUT /jobs/6c737c94-e2f0-4a85-911b-03f3fb48bd30 | OK | 11ms |
| 30 | 17:47:54.920 | Sim5-Client | Cancel open job | DELETE /jobs/6c737c94-e2f0-4a85-911b-03f3fb48bd30 | OK | 11ms |
| 31 | 17:47:54.923 | Sim5-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 32 | 17:47:54.926 | Sim5-Handler | Get agent detail | GET /agents/184456a8-16d0-4328-a113-a7f7a629262e | OK | 3ms |
| 33 | 17:47:54.938 | Sim5-Handler | Update agent | PUT /agents/184456a8-16d0-4328-a113-a7f7a629262e | OK | 12ms |
| 34 | 17:47:54.941 | Sim5-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 35 | 17:47:54.944 | Sim5-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 36 | 17:47:54.946 | Sim5-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 37 | 17:47:54.948 | Sim5-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 38 | 17:47:54.949 | Sim5-Handler | Agent job history | GET /agents/184456a8-16d0-4328-a113-a7f7a629262e/jobs | OK | 1ms |
| 39 | 17:47:54.951 | Sim5-Handler | Agent earnings | GET /agents/184456a8-16d0-4328-a113-a7f7a629262e/earnings | OK | 2ms |
| 40 | 17:47:54.952 | Sim5-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 41 | 17:47:54.954 | Sim5-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 42 | 17:47:54.955 | Sim5-NoAuth | Health check | GET /health | OK | 1ms |

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

