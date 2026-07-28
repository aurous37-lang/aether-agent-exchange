# Shadow Log: Simulation 79

**Started**: 2026-03-22T17:49:00.640Z
**Ended**: 2026-03-22T17:49:01.679Z
**Total Events**: 42
**OK**: 36 | **FAIL**: 0 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:00.640 | Sim79-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:00.656 | Sim79-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:49:01.009 | Sim79-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:01.025 | Sim79-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:49:01.047 | Sim79-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:49:01.060 | Sim79-Client | Post job 1 (happy path) | POST /jobs | OK | 13ms |
| 7 | 17:49:01.072 | Sim79-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:49:01.083 | Sim79-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:49:01.086 | Sim79-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:49:01.088 | Sim79-Client | Search jobs | GET /jobs?search=Sim79 | OK | 2ms |
| 11 | 17:49:01.091 | Sim79-Client | Get job detail | GET /jobs/3d64c77a-1604-41ba-8b79-df0553d4df78 | OK | 3ms |
| 12 | 17:49:01.102 | Sim79-Handler | Place bid on job 1 | POST /jobs/3d64c77a-1604-41ba-8b79-df0553d4df78/bid | OK | 11ms |
| 13 | 17:49:01.105 | Sim79-Handler | Duplicate bid (expect 409) | POST /jobs/3d64c77a-1604-41ba-8b79-df0553d4df78/bid | EXP_FAIL | 3ms |
| 14 | 17:49:01.123 | Sim79-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:49:01.127 | Sim79-Client | Self-deal bid (expect 403) | POST /jobs/3d64c77a-1604-41ba-8b79-df0553d4df78/bid | EXP_FAIL | 4ms |
| 16 | 17:49:01.138 | Sim79-Handler | Accept bid on job 1 | POST /jobs/3d64c77a-1604-41ba-8b79-df0553d4df78/accept | OK | 11ms |
| 17 | 17:49:01.156 | Sim79-Handler | Submit deliverable | POST /jobs/3d64c77a-1604-41ba-8b79-df0553d4df78/submit | OK | 18ms |
| 18 | 17:49:01.166 | Sim79-Client | Approve deliverable | POST /jobs/3d64c77a-1604-41ba-8b79-df0553d4df78/approve | OK | 10ms |
| 19 | 17:49:01.184 | Sim79-Client | Rate agent | POST /jobs/3d64c77a-1604-41ba-8b79-df0553d4df78/rate | OK | 18ms |
| 20 | 17:49:01.188 | Sim79-Client | Duplicate rating (expect 409) | POST /jobs/3d64c77a-1604-41ba-8b79-df0553d4df78/rate | EXP_FAIL | 4ms |
| 21 | 17:49:01.198 | Sim79-Handler | Bid on job 2 | POST /jobs/f52e366c-7c72-4289-96dc-a91d047b4a02/bid | OK | 10ms |
| 22 | 17:49:01.208 | Sim79-Handler | Accept job 2 | POST /jobs/f52e366c-7c72-4289-96dc-a91d047b4a02/accept | OK | 10ms |
| 23 | 17:49:01.226 | Sim79-Handler | Submit deliverable job 2 | POST /jobs/f52e366c-7c72-4289-96dc-a91d047b4a02/submit | OK | 18ms |
| 24 | 17:49:01.245 | Sim79-Client | File dispute | POST /jobs/f52e366c-7c72-4289-96dc-a91d047b4a02/dispute | OK | 19ms |
| 25 | 17:49:01.254 | Sim79-Client | Submit evidence | POST /disputes/2fa77112-b4ad-449d-8e49-7019b923d57a/evidence | OK | 9ms |
| 26 | 17:49:01.607 | Sim79-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:49:01.624 | Sim79-Arbiter1 | Verify signature | POST /auth/verify | OK | 16ms |
| 28 | 17:49:01.625 | Sim79-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/2fa77112-b4ad-449d-8e49-7019b923d57a/vote | EXP_FAIL | 1ms |
| 29 | 17:49:01.637 | Sim79-Client | Update open job | PUT /jobs/4a2e9bbf-e1ef-4d9c-8904-a61c69598027 | OK | 12ms |
| 30 | 17:49:01.648 | Sim79-Client | Cancel open job | DELETE /jobs/4a2e9bbf-e1ef-4d9c-8904-a61c69598027 | OK | 10ms |
| 31 | 17:49:01.651 | Sim79-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 32 | 17:49:01.653 | Sim79-Handler | Get agent detail | GET /agents/7b113f85-7b07-47cb-92da-3c8d8702f8d6 | OK | 2ms |
| 33 | 17:49:01.663 | Sim79-Handler | Update agent | PUT /agents/7b113f85-7b07-47cb-92da-3c8d8702f8d6 | OK | 10ms |
| 34 | 17:49:01.666 | Sim79-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 35 | 17:49:01.668 | Sim79-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 36 | 17:49:01.669 | Sim79-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 37 | 17:49:01.672 | Sim79-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 3ms |
| 38 | 17:49:01.674 | Sim79-Handler | Agent job history | GET /agents/7b113f85-7b07-47cb-92da-3c8d8702f8d6/jobs | OK | 2ms |
| 39 | 17:49:01.676 | Sim79-Handler | Agent earnings | GET /agents/7b113f85-7b07-47cb-92da-3c8d8702f8d6/earnings | OK | 2ms |
| 40 | 17:49:01.677 | Sim79-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 41 | 17:49:01.679 | Sim79-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 42 | 17:49:01.679 | Sim79-NoAuth | Health check | GET /health | OK | 0ms |

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

