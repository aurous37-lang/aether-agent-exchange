# Shadow Log: Simulation 87

**Started**: 2026-03-22T17:49:10.207Z
**Ended**: 2026-03-22T17:49:10.752Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:10.207 | Sim87-Client | Request nonce | POST /auth/nonce | OK | 1ms |
| 2 | 17:49:10.223 | Sim87-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:49:10.575 | Sim87-Handler | Request nonce | POST /auth/nonce | OK | 1ms |
| 4 | 17:49:10.590 | Sim87-Handler | Verify signature | POST /auth/verify | OK | 14ms |
| 5 | 17:49:10.612 | Sim87-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:49:10.623 | Sim87-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:49:10.624 | Sim87-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:49:10.625 | Sim87-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:49:10.627 | Sim87-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:10.629 | Sim87-Client | Search jobs | GET /jobs?search=Sim87 | OK | 2ms |
| 11 | 17:49:10.631 | Sim87-Client | Get job detail | GET /jobs/bf854417-85c8-4326-aa61-806dc2bd08af | OK | 2ms |
| 12 | 17:49:10.642 | Sim87-Handler | Place bid on job 1 | POST /jobs/bf854417-85c8-4326-aa61-806dc2bd08af/bid | OK | 11ms |
| 13 | 17:49:10.646 | Sim87-Handler | Duplicate bid (expect 409) | POST /jobs/bf854417-85c8-4326-aa61-806dc2bd08af/bid | EXP_FAIL | 4ms |
| 14 | 17:49:10.666 | Sim87-Client | Register client agent for self-deal test | POST /agents | OK | 20ms |
| 15 | 17:49:10.669 | Sim87-Client | Self-deal bid (expect 403) | POST /jobs/bf854417-85c8-4326-aa61-806dc2bd08af/bid | EXP_FAIL | 3ms |
| 16 | 17:49:10.680 | Sim87-Handler | Accept bid on job 1 | POST /jobs/bf854417-85c8-4326-aa61-806dc2bd08af/accept | OK | 10ms |
| 17 | 17:49:10.697 | Sim87-Handler | Submit deliverable | POST /jobs/bf854417-85c8-4326-aa61-806dc2bd08af/submit | OK | 17ms |
| 18 | 17:49:10.708 | Sim87-Client | Approve deliverable | POST /jobs/bf854417-85c8-4326-aa61-806dc2bd08af/approve | OK | 10ms |
| 19 | 17:49:10.725 | Sim87-Client | Rate agent | POST /jobs/bf854417-85c8-4326-aa61-806dc2bd08af/rate | OK | 17ms |
| 20 | 17:49:10.729 | Sim87-Client | Duplicate rating (expect 409) | POST /jobs/bf854417-85c8-4326-aa61-806dc2bd08af/rate | EXP_FAIL | 4ms |
| 21 | 17:49:10.732 | Sim87-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:49:10.734 | Sim87-Handler | Get agent detail | GET /agents/9fb3991d-94bc-4956-bbcf-4f76466a9a61 | OK | 2ms |
| 23 | 17:49:10.743 | Sim87-Handler | Update agent | PUT /agents/9fb3991d-94bc-4956-bbcf-4f76466a9a61 | OK | 8ms |
| 24 | 17:49:10.745 | Sim87-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 25 | 17:49:10.747 | Sim87-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:49:10.747 | Sim87-Handler | Get notifications | GET /handler/notifications | OK | 0ms |
| 27 | 17:49:10.748 | Sim87-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:49:10.749 | Sim87-Handler | Agent job history | GET /agents/9fb3991d-94bc-4956-bbcf-4f76466a9a61/jobs | OK | 1ms |
| 29 | 17:49:10.750 | Sim87-Handler | Agent earnings | GET /agents/9fb3991d-94bc-4956-bbcf-4f76466a9a61/earnings | OK | 1ms |
| 30 | 17:49:10.750 | Sim87-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 31 | 17:49:10.751 | Sim87-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:49:10.752 | Sim87-NoAuth | Health check | GET /health | OK | 1ms |

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

