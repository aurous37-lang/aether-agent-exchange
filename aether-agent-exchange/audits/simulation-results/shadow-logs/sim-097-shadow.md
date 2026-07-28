# Shadow Log: Simulation 97

**Started**: 2026-03-22T17:49:21.658Z
**Ended**: 2026-03-22T17:49:22.197Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:21.658 | Sim97-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:21.674 | Sim97-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:49:22.027 | Sim97-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:49:22.042 | Sim97-Handler | Verify signature | POST /auth/verify | OK | 14ms |
| 5 | 17:49:22.065 | Sim97-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:49:22.075 | Sim97-Client | Post job 1 (happy path) | POST /jobs | OK | 10ms |
| 7 | 17:49:22.077 | Sim97-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:49:22.078 | Sim97-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:49:22.080 | Sim97-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:22.082 | Sim97-Client | Search jobs | GET /jobs?search=Sim97 | OK | 2ms |
| 11 | 17:49:22.084 | Sim97-Client | Get job detail | GET /jobs/72c77cab-4fe0-450c-8c1f-fd6cb8d68beb | OK | 2ms |
| 12 | 17:49:22.095 | Sim97-Handler | Place bid on job 1 | POST /jobs/72c77cab-4fe0-450c-8c1f-fd6cb8d68beb/bid | OK | 11ms |
| 13 | 17:49:22.098 | Sim97-Handler | Duplicate bid (expect 409) | POST /jobs/72c77cab-4fe0-450c-8c1f-fd6cb8d68beb/bid | EXP_FAIL | 3ms |
| 14 | 17:49:22.113 | Sim97-Client | Register client agent for self-deal test | POST /agents | OK | 15ms |
| 15 | 17:49:22.116 | Sim97-Client | Self-deal bid (expect 403) | POST /jobs/72c77cab-4fe0-450c-8c1f-fd6cb8d68beb/bid | EXP_FAIL | 3ms |
| 16 | 17:49:22.126 | Sim97-Handler | Accept bid on job 1 | POST /jobs/72c77cab-4fe0-450c-8c1f-fd6cb8d68beb/accept | OK | 10ms |
| 17 | 17:49:22.143 | Sim97-Handler | Submit deliverable | POST /jobs/72c77cab-4fe0-450c-8c1f-fd6cb8d68beb/submit | OK | 17ms |
| 18 | 17:49:22.153 | Sim97-Client | Approve deliverable | POST /jobs/72c77cab-4fe0-450c-8c1f-fd6cb8d68beb/approve | OK | 10ms |
| 19 | 17:49:22.171 | Sim97-Client | Rate agent | POST /jobs/72c77cab-4fe0-450c-8c1f-fd6cb8d68beb/rate | OK | 18ms |
| 20 | 17:49:22.173 | Sim97-Client | Duplicate rating (expect 409) | POST /jobs/72c77cab-4fe0-450c-8c1f-fd6cb8d68beb/rate | EXP_FAIL | 2ms |
| 21 | 17:49:22.174 | Sim97-Handler | List agents | GET /agents?limit=10 | OK | 1ms |
| 22 | 17:49:22.177 | Sim97-Handler | Get agent detail | GET /agents/f35552d5-bc49-47c4-87ee-0b519be4f829 | OK | 3ms |
| 23 | 17:49:22.186 | Sim97-Handler | Update agent | PUT /agents/f35552d5-bc49-47c4-87ee-0b519be4f829 | OK | 9ms |
| 24 | 17:49:22.189 | Sim97-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:49:22.190 | Sim97-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 26 | 17:49:22.191 | Sim97-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 27 | 17:49:22.192 | Sim97-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:49:22.193 | Sim97-Handler | Agent job history | GET /agents/f35552d5-bc49-47c4-87ee-0b519be4f829/jobs | OK | 1ms |
| 29 | 17:49:22.195 | Sim97-Handler | Agent earnings | GET /agents/f35552d5-bc49-47c4-87ee-0b519be4f829/earnings | OK | 2ms |
| 30 | 17:49:22.195 | Sim97-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 31 | 17:49:22.197 | Sim97-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 32 | 17:49:22.197 | Sim97-NoAuth | Health check | GET /health | OK | 0ms |

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

