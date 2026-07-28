# Shadow Log: Simulation 21

**Started**: 2026-03-22T17:48:11.423Z
**Ended**: 2026-03-22T17:48:12.007Z
**Total Events**: 34
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:11.423 | Sim21-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:11.441 | Sim21-Client | Verify signature | POST /auth/verify | OK | 18ms |
| 3 | 17:48:11.794 | Sim21-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:11.810 | Sim21-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:11.832 | Sim21-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:48:11.844 | Sim21-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:11.845 | Sim21-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:48:11.855 | Sim21-Client | Post job 3 (edge cases) | POST /jobs | OK | 10ms |
| 9 | 17:48:11.858 | Sim21-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:11.861 | Sim21-Client | Search jobs | GET /jobs?search=Sim21 | OK | 2ms |
| 11 | 17:48:11.864 | Sim21-Client | Get job detail | GET /jobs/3e767a9d-f047-41d0-af1d-045364fae764 | OK | 3ms |
| 12 | 17:48:11.876 | Sim21-Handler | Place bid on job 1 | POST /jobs/3e767a9d-f047-41d0-af1d-045364fae764/bid | OK | 12ms |
| 13 | 17:48:11.882 | Sim21-Handler | Duplicate bid (expect 409) | POST /jobs/3e767a9d-f047-41d0-af1d-045364fae764/bid | EXP_FAIL | 6ms |
| 14 | 17:48:11.902 | Sim21-Client | Register client agent for self-deal test | POST /agents | OK | 20ms |
| 15 | 17:48:11.904 | Sim21-Client | Self-deal bid (expect 403) | POST /jobs/3e767a9d-f047-41d0-af1d-045364fae764/bid | EXP_FAIL | 2ms |
| 16 | 17:48:11.913 | Sim21-Handler | Accept bid on job 1 | POST /jobs/3e767a9d-f047-41d0-af1d-045364fae764/accept | OK | 9ms |
| 17 | 17:48:11.931 | Sim21-Handler | Submit deliverable | POST /jobs/3e767a9d-f047-41d0-af1d-045364fae764/submit | OK | 18ms |
| 18 | 17:48:11.941 | Sim21-Client | Approve deliverable | POST /jobs/3e767a9d-f047-41d0-af1d-045364fae764/approve | OK | 10ms |
| 19 | 17:48:11.959 | Sim21-Client | Rate agent | POST /jobs/3e767a9d-f047-41d0-af1d-045364fae764/rate | OK | 18ms |
| 20 | 17:48:11.962 | Sim21-Client | Duplicate rating (expect 409) | POST /jobs/3e767a9d-f047-41d0-af1d-045364fae764/rate | EXP_FAIL | 3ms |
| 21 | 17:48:11.971 | Sim21-Client | Update open job | PUT /jobs/5cc2eb57-655a-472c-9e3a-9d041b573629 | OK | 9ms |
| 22 | 17:48:11.980 | Sim21-Client | Cancel open job | DELETE /jobs/5cc2eb57-655a-472c-9e3a-9d041b573629 | OK | 9ms |
| 23 | 17:48:11.983 | Sim21-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 24 | 17:48:11.986 | Sim21-Handler | Get agent detail | GET /agents/8679c2a1-a38f-4f75-aef0-718c001304bd | OK | 3ms |
| 25 | 17:48:11.995 | Sim21-Handler | Update agent | PUT /agents/8679c2a1-a38f-4f75-aef0-718c001304bd | OK | 9ms |
| 26 | 17:48:11.998 | Sim21-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 27 | 17:48:11.999 | Sim21-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 28 | 17:48:12.000 | Sim21-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 29 | 17:48:12.001 | Sim21-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 30 | 17:48:12.002 | Sim21-Handler | Agent job history | GET /agents/8679c2a1-a38f-4f75-aef0-718c001304bd/jobs | OK | 1ms |
| 31 | 17:48:12.004 | Sim21-Handler | Agent earnings | GET /agents/8679c2a1-a38f-4f75-aef0-718c001304bd/earnings | OK | 2ms |
| 32 | 17:48:12.004 | Sim21-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 33 | 17:48:12.006 | Sim21-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 34 | 17:48:12.007 | Sim21-NoAuth | Health check | GET /health | OK | 1ms |

---

## Event Details

### Event 7: Post job 2 (dispute path)
- **Error**: Validation failed

### Event 13: Duplicate bid (expect 409)
- **Note**: Expected failure: Bid already placed for this agent on this job

### Event 15: Self-deal bid (expect 403)
- **Note**: Expected failure: Cannot bid on your own job

### Event 20: Duplicate rating (expect 409)
- **Note**: Expected failure: You have already rated this job

### Event 32: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 33: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

