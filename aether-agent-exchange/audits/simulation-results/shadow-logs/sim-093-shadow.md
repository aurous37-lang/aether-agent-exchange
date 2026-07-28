# Shadow Log: Simulation 93

**Started**: 2026-03-22T17:49:17.221Z
**Ended**: 2026-03-22T17:49:17.768Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:17.221 | Sim93-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:17.237 | Sim93-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:49:17.589 | Sim93-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:49:17.606 | Sim93-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:49:17.627 | Sim93-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:49:17.639 | Sim93-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:49:17.641 | Sim93-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:49:17.642 | Sim93-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:49:17.644 | Sim93-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:49:17.646 | Sim93-Client | Search jobs | GET /jobs?search=Sim93 | OK | 2ms |
| 11 | 17:49:17.648 | Sim93-Client | Get job detail | GET /jobs/94003a16-5e04-4aec-b360-53dfaa741c3e | OK | 2ms |
| 12 | 17:49:17.659 | Sim93-Handler | Place bid on job 1 | POST /jobs/94003a16-5e04-4aec-b360-53dfaa741c3e/bid | OK | 11ms |
| 13 | 17:49:17.662 | Sim93-Handler | Duplicate bid (expect 409) | POST /jobs/94003a16-5e04-4aec-b360-53dfaa741c3e/bid | EXP_FAIL | 3ms |
| 14 | 17:49:17.682 | Sim93-Client | Register client agent for self-deal test | POST /agents | OK | 20ms |
| 15 | 17:49:17.686 | Sim93-Client | Self-deal bid (expect 403) | POST /jobs/94003a16-5e04-4aec-b360-53dfaa741c3e/bid | EXP_FAIL | 4ms |
| 16 | 17:49:17.696 | Sim93-Handler | Accept bid on job 1 | POST /jobs/94003a16-5e04-4aec-b360-53dfaa741c3e/accept | OK | 10ms |
| 17 | 17:49:17.714 | Sim93-Handler | Submit deliverable | POST /jobs/94003a16-5e04-4aec-b360-53dfaa741c3e/submit | OK | 18ms |
| 18 | 17:49:17.723 | Sim93-Client | Approve deliverable | POST /jobs/94003a16-5e04-4aec-b360-53dfaa741c3e/approve | OK | 9ms |
| 19 | 17:49:17.740 | Sim93-Client | Rate agent | POST /jobs/94003a16-5e04-4aec-b360-53dfaa741c3e/rate | OK | 17ms |
| 20 | 17:49:17.742 | Sim93-Client | Duplicate rating (expect 409) | POST /jobs/94003a16-5e04-4aec-b360-53dfaa741c3e/rate | EXP_FAIL | 2ms |
| 21 | 17:49:17.744 | Sim93-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 22 | 17:49:17.746 | Sim93-Handler | Get agent detail | GET /agents/8d64237a-aa56-47bf-9594-13e2a07a350c | OK | 2ms |
| 23 | 17:49:17.755 | Sim93-Handler | Update agent | PUT /agents/8d64237a-aa56-47bf-9594-13e2a07a350c | OK | 9ms |
| 24 | 17:49:17.759 | Sim93-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:49:17.761 | Sim93-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:49:17.762 | Sim93-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 27 | 17:49:17.763 | Sim93-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:49:17.764 | Sim93-Handler | Agent job history | GET /agents/8d64237a-aa56-47bf-9594-13e2a07a350c/jobs | OK | 1ms |
| 29 | 17:49:17.766 | Sim93-Handler | Agent earnings | GET /agents/8d64237a-aa56-47bf-9594-13e2a07a350c/earnings | OK | 2ms |
| 30 | 17:49:17.766 | Sim93-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 31 | 17:49:17.767 | Sim93-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 0ms |
| 32 | 17:49:17.768 | Sim93-NoAuth | Health check | GET /health | OK | 1ms |

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

