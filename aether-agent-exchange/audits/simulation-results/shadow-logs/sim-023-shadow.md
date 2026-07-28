# Shadow Log: Simulation 23

**Started**: 2026-03-22T17:48:13.648Z
**Ended**: 2026-03-22T17:48:14.660Z
**Total Events**: 40
**OK**: 33 | **FAIL**: 1 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:13.648 | Sim23-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:13.666 | Sim23-Client | Verify signature | POST /auth/verify | OK | 18ms |
| 3 | 17:48:14.019 | Sim23-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:48:14.035 | Sim23-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:14.057 | Sim23-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:48:14.069 | Sim23-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:14.081 | Sim23-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:48:14.083 | Sim23-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:48:14.086 | Sim23-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:14.089 | Sim23-Client | Search jobs | GET /jobs?search=Sim23 | OK | 3ms |
| 11 | 17:48:14.092 | Sim23-Client | Get job detail | GET /jobs/c9f162d1-7b7d-4c72-a0c3-26a90a3b8f79 | OK | 3ms |
| 12 | 17:48:14.104 | Sim23-Handler | Place bid on job 1 | POST /jobs/c9f162d1-7b7d-4c72-a0c3-26a90a3b8f79/bid | OK | 12ms |
| 13 | 17:48:14.108 | Sim23-Handler | Duplicate bid (expect 409) | POST /jobs/c9f162d1-7b7d-4c72-a0c3-26a90a3b8f79/bid | EXP_FAIL | 4ms |
| 14 | 17:48:14.125 | Sim23-Client | Register client agent for self-deal test | POST /agents | OK | 17ms |
| 15 | 17:48:14.128 | Sim23-Client | Self-deal bid (expect 403) | POST /jobs/c9f162d1-7b7d-4c72-a0c3-26a90a3b8f79/bid | EXP_FAIL | 3ms |
| 16 | 17:48:14.138 | Sim23-Handler | Accept bid on job 1 | POST /jobs/c9f162d1-7b7d-4c72-a0c3-26a90a3b8f79/accept | OK | 10ms |
| 17 | 17:48:14.156 | Sim23-Handler | Submit deliverable | POST /jobs/c9f162d1-7b7d-4c72-a0c3-26a90a3b8f79/submit | OK | 18ms |
| 18 | 17:48:14.166 | Sim23-Client | Approve deliverable | POST /jobs/c9f162d1-7b7d-4c72-a0c3-26a90a3b8f79/approve | OK | 10ms |
| 19 | 17:48:14.184 | Sim23-Client | Rate agent | POST /jobs/c9f162d1-7b7d-4c72-a0c3-26a90a3b8f79/rate | OK | 18ms |
| 20 | 17:48:14.187 | Sim23-Client | Duplicate rating (expect 409) | POST /jobs/c9f162d1-7b7d-4c72-a0c3-26a90a3b8f79/rate | EXP_FAIL | 3ms |
| 21 | 17:48:14.199 | Sim23-Handler | Bid on job 2 | POST /jobs/1be1cfd4-6b50-41b0-ba19-7d43570041a1/bid | OK | 12ms |
| 22 | 17:48:14.210 | Sim23-Handler | Accept job 2 | POST /jobs/1be1cfd4-6b50-41b0-ba19-7d43570041a1/accept | OK | 11ms |
| 23 | 17:48:14.228 | Sim23-Handler | Submit deliverable job 2 | POST /jobs/1be1cfd4-6b50-41b0-ba19-7d43570041a1/submit | OK | 18ms |
| 24 | 17:48:14.246 | Sim23-Client | File dispute | POST /jobs/1be1cfd4-6b50-41b0-ba19-7d43570041a1/dispute | OK | 18ms |
| 25 | 17:48:14.256 | Sim23-Client | Submit evidence | POST /disputes/40596c89-0a62-4b30-8744-87d81317ca6c/evidence | OK | 10ms |
| 26 | 17:48:14.608 | Sim23-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 27 | 17:48:14.628 | Sim23-Arbiter1 | Verify signature | POST /auth/verify | OK | 18ms |
| 28 | 17:48:14.630 | Sim23-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/40596c89-0a62-4b30-8744-87d81317ca6c/vote | EXP_FAIL | 2ms |
| 29 | 17:48:14.632 | Sim23-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 30 | 17:48:14.635 | Sim23-Handler | Get agent detail | GET /agents/0f74d6fa-3299-44fe-b13b-b503a834a429 | OK | 3ms |
| 31 | 17:48:14.646 | Sim23-Handler | Update agent | PUT /agents/0f74d6fa-3299-44fe-b13b-b503a834a429 | OK | 11ms |
| 32 | 17:48:14.649 | Sim23-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 33 | 17:48:14.651 | Sim23-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 34 | 17:48:14.652 | Sim23-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 35 | 17:48:14.654 | Sim23-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 36 | 17:48:14.655 | Sim23-Handler | Agent job history | GET /agents/0f74d6fa-3299-44fe-b13b-b503a834a429/jobs | OK | 1ms |
| 37 | 17:48:14.657 | Sim23-Handler | Agent earnings | GET /agents/0f74d6fa-3299-44fe-b13b-b503a834a429/earnings | OK | 2ms |
| 38 | 17:48:14.658 | Sim23-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 39 | 17:48:14.659 | Sim23-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 40 | 17:48:14.660 | Sim23-NoAuth | Health check | GET /health | OK | 1ms |

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

