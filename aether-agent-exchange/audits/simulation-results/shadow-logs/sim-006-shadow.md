# Shadow Log: Simulation 6

**Started**: 2026-03-22T17:47:55.309Z
**Ended**: 2026-03-22T17:47:56.308Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:47:55.309 | Sim6-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:47:55.326 | Sim6-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:47:55.679 | Sim6-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:47:55.696 | Sim6-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:47:55.718 | Sim6-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:47:55.731 | Sim6-Client | Post job 1 (happy path) | POST /jobs | OK | 13ms |
| 7 | 17:47:55.745 | Sim6-Client | Post job 2 (dispute path) | POST /jobs | OK | 14ms |
| 8 | 17:47:55.747 | Sim6-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:47:55.749 | Sim6-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:47:55.750 | Sim6-Client | Search jobs | GET /jobs?search=Sim6 | OK | 1ms |
| 11 | 17:47:55.752 | Sim6-Client | Get job detail | GET /jobs/6350ce44-46c6-4367-b59a-5753d9ea8998 | OK | 2ms |
| 12 | 17:47:55.764 | Sim6-Handler | Place bid on job 1 | POST /jobs/6350ce44-46c6-4367-b59a-5753d9ea8998/bid | OK | 12ms |
| 13 | 17:47:55.767 | Sim6-Handler | Duplicate bid (expect 409) | POST /jobs/6350ce44-46c6-4367-b59a-5753d9ea8998/bid | EXP_FAIL | 3ms |
| 14 | 17:47:55.783 | Sim6-Client | Register client agent for self-deal test | POST /agents | OK | 16ms |
| 15 | 17:47:55.787 | Sim6-Client | Self-deal bid (expect 403) | POST /jobs/6350ce44-46c6-4367-b59a-5753d9ea8998/bid | EXP_FAIL | 4ms |
| 16 | 17:47:55.796 | Sim6-Handler | Accept bid on job 1 | POST /jobs/6350ce44-46c6-4367-b59a-5753d9ea8998/accept | OK | 9ms |
| 17 | 17:47:55.815 | Sim6-Handler | Submit deliverable | POST /jobs/6350ce44-46c6-4367-b59a-5753d9ea8998/submit | OK | 19ms |
| 18 | 17:47:55.825 | Sim6-Client | Approve deliverable | POST /jobs/6350ce44-46c6-4367-b59a-5753d9ea8998/approve | OK | 10ms |
| 19 | 17:47:55.843 | Sim6-Client | Rate agent | POST /jobs/6350ce44-46c6-4367-b59a-5753d9ea8998/rate | OK | 18ms |
| 20 | 17:47:55.846 | Sim6-Client | Duplicate rating (expect 409) | POST /jobs/6350ce44-46c6-4367-b59a-5753d9ea8998/rate | EXP_FAIL | 3ms |
| 21 | 17:47:55.855 | Sim6-Handler | Bid on job 2 | POST /jobs/cd514173-631b-4578-901c-de6108b2494e/bid | OK | 9ms |
| 22 | 17:47:55.866 | Sim6-Handler | Accept job 2 | POST /jobs/cd514173-631b-4578-901c-de6108b2494e/accept | OK | 11ms |
| 23 | 17:47:55.884 | Sim6-Handler | Submit deliverable job 2 | POST /jobs/cd514173-631b-4578-901c-de6108b2494e/submit | OK | 18ms |
| 24 | 17:47:55.902 | Sim6-Client | File dispute | POST /jobs/cd514173-631b-4578-901c-de6108b2494e/dispute | OK | 18ms |
| 25 | 17:47:55.913 | Sim6-Client | Submit evidence | POST /disputes/c7c95526-a2f8-4154-84c3-af2bb19dd906/evidence | OK | 11ms |
| 26 | 17:47:56.265 | Sim6-Arbiter1 | Request nonce | POST /auth/nonce | OK | 3ms |
| 27 | 17:47:56.280 | Sim6-Arbiter1 | Verify signature | POST /auth/verify | OK | 14ms |
| 28 | 17:47:56.282 | Sim6-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/c7c95526-a2f8-4154-84c3-af2bb19dd906/vote | EXP_FAIL | 2ms |
| 29 | 17:47:56.284 | Sim6-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 30 | 17:47:56.286 | Sim6-Handler | Get agent detail | GET /agents/c827c52e-104a-40f8-a6ce-04a24e56bd9e | OK | 2ms |
| 31 | 17:47:56.298 | Sim6-Handler | Update agent | PUT /agents/c827c52e-104a-40f8-a6ce-04a24e56bd9e | OK | 12ms |
| 32 | 17:47:56.300 | Sim6-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 33 | 17:47:56.301 | Sim6-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 34 | 17:47:56.302 | Sim6-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 35 | 17:47:56.303 | Sim6-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 36 | 17:47:56.304 | Sim6-Handler | Agent job history | GET /agents/c827c52e-104a-40f8-a6ce-04a24e56bd9e/jobs | OK | 1ms |
| 37 | 17:47:56.306 | Sim6-Handler | Agent earnings | GET /agents/c827c52e-104a-40f8-a6ce-04a24e56bd9e/earnings | OK | 2ms |
| 38 | 17:47:56.307 | Sim6-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:47:56.307 | Sim6-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 0ms |
| 40 | 17:47:56.308 | Sim6-NoAuth | Health check | GET /health | OK | 1ms |

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

