# Shadow Log: Simulation 8

**Started**: 2026-03-22T17:47:57.918Z
**Ended**: 2026-03-22T17:47:58.826Z
**Total Events**: 30
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:47:57.918 | Sim8-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:47:57.935 | Sim8-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:47:58.289 | Sim8-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:47:58.307 | Sim8-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:47:58.330 | Sim8-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:47:58.332 | Sim8-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:47:58.344 | Sim8-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:47:58.345 | Sim8-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:47:58.347 | Sim8-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:47:58.350 | Sim8-Client | Search jobs | GET /jobs?search=Sim8 | OK | 3ms |
| 11 | 17:47:58.362 | Sim8-Handler | Bid on job 2 | POST /jobs/d30c4a44-403a-405a-b6c6-e238c2071c85/bid | OK | 12ms |
| 12 | 17:47:58.374 | Sim8-Handler | Accept job 2 | POST /jobs/d30c4a44-403a-405a-b6c6-e238c2071c85/accept | OK | 12ms |
| 13 | 17:47:58.393 | Sim8-Handler | Submit deliverable job 2 | POST /jobs/d30c4a44-403a-405a-b6c6-e238c2071c85/submit | OK | 19ms |
| 14 | 17:47:58.413 | Sim8-Client | File dispute | POST /jobs/d30c4a44-403a-405a-b6c6-e238c2071c85/dispute | OK | 20ms |
| 15 | 17:47:58.423 | Sim8-Client | Submit evidence | POST /disputes/b5383272-83e9-4276-b4f7-4501cdcf67ba/evidence | OK | 10ms |
| 16 | 17:47:58.777 | Sim8-Arbiter1 | Request nonce | POST /auth/nonce | OK | 3ms |
| 17 | 17:47:58.793 | Sim8-Arbiter1 | Verify signature | POST /auth/verify | OK | 15ms |
| 18 | 17:47:58.794 | Sim8-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/b5383272-83e9-4276-b4f7-4501cdcf67ba/vote | EXP_FAIL | 1ms |
| 19 | 17:47:58.796 | Sim8-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 20 | 17:47:58.798 | Sim8-Handler | Get agent detail | GET /agents/bfefb023-aa93-4e7f-8024-a11da2917e05 | OK | 2ms |
| 21 | 17:47:58.808 | Sim8-Handler | Update agent | PUT /agents/bfefb023-aa93-4e7f-8024-a11da2917e05 | OK | 10ms |
| 22 | 17:47:58.811 | Sim8-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 23 | 17:47:58.814 | Sim8-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 24 | 17:47:58.815 | Sim8-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 25 | 17:47:58.817 | Sim8-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 26 | 17:47:58.819 | Sim8-Handler | Agent job history | GET /agents/bfefb023-aa93-4e7f-8024-a11da2917e05/jobs | OK | 2ms |
| 27 | 17:47:58.822 | Sim8-Handler | Agent earnings | GET /agents/bfefb023-aa93-4e7f-8024-a11da2917e05/earnings | OK | 3ms |
| 28 | 17:47:58.823 | Sim8-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 29 | 17:47:58.826 | Sim8-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 3ms |
| 30 | 17:47:58.826 | Sim8-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 6: Post job 1 (happy path)
- **Error**: Validation failed

### Event 8: Post job 3 (edge cases)
- **Error**: Validation failed

### Event 18: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 28: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 29: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

