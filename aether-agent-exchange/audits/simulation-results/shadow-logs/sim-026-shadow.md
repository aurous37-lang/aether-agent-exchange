# Shadow Log: Simulation 26

**Started**: 2026-03-22T17:48:17.305Z
**Ended**: 2026-03-22T17:48:17.863Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:17.305 | Sim26-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:17.319 | Sim26-Client | Verify signature | POST /auth/verify | OK | 14ms |
| 3 | 17:48:17.672 | Sim26-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:48:17.691 | Sim26-Handler | Verify signature | POST /auth/verify | OK | 18ms |
| 5 | 17:48:17.714 | Sim26-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:48:17.726 | Sim26-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:17.727 | Sim26-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:48:17.728 | Sim26-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:17.729 | Sim26-Client | List jobs | GET /jobs?limit=10 | OK | 1ms |
| 10 | 17:48:17.732 | Sim26-Client | Search jobs | GET /jobs?search=Sim26 | OK | 3ms |
| 11 | 17:48:17.734 | Sim26-Client | Get job detail | GET /jobs/3702a4e1-f30a-47da-893e-b5e84b2349f1 | OK | 2ms |
| 12 | 17:48:17.745 | Sim26-Handler | Place bid on job 1 | POST /jobs/3702a4e1-f30a-47da-893e-b5e84b2349f1/bid | OK | 11ms |
| 13 | 17:48:17.748 | Sim26-Handler | Duplicate bid (expect 409) | POST /jobs/3702a4e1-f30a-47da-893e-b5e84b2349f1/bid | EXP_FAIL | 3ms |
| 14 | 17:48:17.768 | Sim26-Client | Register client agent for self-deal test | POST /agents | OK | 20ms |
| 15 | 17:48:17.772 | Sim26-Client | Self-deal bid (expect 403) | POST /jobs/3702a4e1-f30a-47da-893e-b5e84b2349f1/bid | EXP_FAIL | 4ms |
| 16 | 17:48:17.785 | Sim26-Handler | Accept bid on job 1 | POST /jobs/3702a4e1-f30a-47da-893e-b5e84b2349f1/accept | OK | 13ms |
| 17 | 17:48:17.804 | Sim26-Handler | Submit deliverable | POST /jobs/3702a4e1-f30a-47da-893e-b5e84b2349f1/submit | OK | 19ms |
| 18 | 17:48:17.814 | Sim26-Client | Approve deliverable | POST /jobs/3702a4e1-f30a-47da-893e-b5e84b2349f1/approve | OK | 10ms |
| 19 | 17:48:17.833 | Sim26-Client | Rate agent | POST /jobs/3702a4e1-f30a-47da-893e-b5e84b2349f1/rate | OK | 19ms |
| 20 | 17:48:17.837 | Sim26-Client | Duplicate rating (expect 409) | POST /jobs/3702a4e1-f30a-47da-893e-b5e84b2349f1/rate | EXP_FAIL | 3ms |
| 21 | 17:48:17.840 | Sim26-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:48:17.843 | Sim26-Handler | Get agent detail | GET /agents/babf94e6-9416-47eb-9d71-764af6ec709d | OK | 3ms |
| 23 | 17:48:17.852 | Sim26-Handler | Update agent | PUT /agents/babf94e6-9416-47eb-9d71-764af6ec709d | OK | 9ms |
| 24 | 17:48:17.854 | Sim26-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 25 | 17:48:17.856 | Sim26-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:48:17.857 | Sim26-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 27 | 17:48:17.858 | Sim26-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:48:17.859 | Sim26-Handler | Agent job history | GET /agents/babf94e6-9416-47eb-9d71-764af6ec709d/jobs | OK | 1ms |
| 29 | 17:48:17.861 | Sim26-Handler | Agent earnings | GET /agents/babf94e6-9416-47eb-9d71-764af6ec709d/earnings | OK | 2ms |
| 30 | 17:48:17.861 | Sim26-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 31 | 17:48:17.863 | Sim26-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 32 | 17:48:17.863 | Sim26-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 7: Post job 2 (dispute path)
- **Error**: Validation failed

### Event 8: Post job 3 (edge cases)
- **Error**: Validation failed

### Event 13: Duplicate bid (expect 409)
- **Note**: Expected failure: Bid already placed for this agent on this job

### Event 15: Self-deal bid (expect 403)
- **Note**: Expected failure: Cannot bid on your own job

### Event 20: Duplicate rating (expect 409)
- **Note**: Expected failure: You have already rated this job

### Event 30: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 31: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

