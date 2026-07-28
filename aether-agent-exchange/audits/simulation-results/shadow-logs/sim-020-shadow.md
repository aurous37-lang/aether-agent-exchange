# Shadow Log: Simulation 20

**Started**: 2026-03-22T17:48:10.507Z
**Ended**: 2026-03-22T17:48:11.068Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:10.507 | Sim20-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:10.525 | Sim20-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:48:10.877 | Sim20-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:10.892 | Sim20-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:48:10.913 | Sim20-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:48:10.924 | Sim20-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:48:10.926 | Sim20-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:48:10.927 | Sim20-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:10.929 | Sim20-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:10.932 | Sim20-Client | Search jobs | GET /jobs?search=Sim20 | OK | 3ms |
| 11 | 17:48:10.936 | Sim20-Client | Get job detail | GET /jobs/9ce52662-052b-4936-a03f-153190d17c86 | OK | 4ms |
| 12 | 17:48:10.949 | Sim20-Handler | Place bid on job 1 | POST /jobs/9ce52662-052b-4936-a03f-153190d17c86/bid | OK | 13ms |
| 13 | 17:48:10.952 | Sim20-Handler | Duplicate bid (expect 409) | POST /jobs/9ce52662-052b-4936-a03f-153190d17c86/bid | EXP_FAIL | 3ms |
| 14 | 17:48:10.970 | Sim20-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:48:10.974 | Sim20-Client | Self-deal bid (expect 403) | POST /jobs/9ce52662-052b-4936-a03f-153190d17c86/bid | EXP_FAIL | 4ms |
| 16 | 17:48:10.985 | Sim20-Handler | Accept bid on job 1 | POST /jobs/9ce52662-052b-4936-a03f-153190d17c86/accept | OK | 11ms |
| 17 | 17:48:11.004 | Sim20-Handler | Submit deliverable | POST /jobs/9ce52662-052b-4936-a03f-153190d17c86/submit | OK | 19ms |
| 18 | 17:48:11.014 | Sim20-Client | Approve deliverable | POST /jobs/9ce52662-052b-4936-a03f-153190d17c86/approve | OK | 10ms |
| 19 | 17:48:11.030 | Sim20-Client | Rate agent | POST /jobs/9ce52662-052b-4936-a03f-153190d17c86/rate | OK | 16ms |
| 20 | 17:48:11.034 | Sim20-Client | Duplicate rating (expect 409) | POST /jobs/9ce52662-052b-4936-a03f-153190d17c86/rate | EXP_FAIL | 4ms |
| 21 | 17:48:11.036 | Sim20-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 22 | 17:48:11.038 | Sim20-Handler | Get agent detail | GET /agents/c2113809-16c3-4158-a121-6c29bebbcb10 | OK | 2ms |
| 23 | 17:48:11.047 | Sim20-Handler | Update agent | PUT /agents/c2113809-16c3-4158-a121-6c29bebbcb10 | OK | 9ms |
| 24 | 17:48:11.050 | Sim20-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:48:11.053 | Sim20-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 26 | 17:48:11.056 | Sim20-Handler | Get notifications | GET /handler/notifications | OK | 3ms |
| 27 | 17:48:11.058 | Sim20-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 28 | 17:48:11.059 | Sim20-Handler | Agent job history | GET /agents/c2113809-16c3-4158-a121-6c29bebbcb10/jobs | OK | 1ms |
| 29 | 17:48:11.064 | Sim20-Handler | Agent earnings | GET /agents/c2113809-16c3-4158-a121-6c29bebbcb10/earnings | OK | 5ms |
| 30 | 17:48:11.065 | Sim20-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 31 | 17:48:11.067 | Sim20-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 32 | 17:48:11.068 | Sim20-NoAuth | Health check | GET /health | OK | 1ms |

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

