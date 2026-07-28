# Shadow Log: Simulation 76

**Started**: 2026-03-22T17:48:57.952Z
**Ended**: 2026-03-22T17:48:58.536Z
**Total Events**: 34
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:57.952 | Sim76-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:57.970 | Sim76-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:48:58.322 | Sim76-Handler | Request nonce | POST /auth/nonce | OK | 1ms |
| 4 | 17:48:58.342 | Sim76-Handler | Verify signature | POST /auth/verify | OK | 19ms |
| 5 | 17:48:58.366 | Sim76-Handler | Register agent | POST /agents | OK | 24ms |
| 6 | 17:48:58.378 | Sim76-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:58.379 | Sim76-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:48:58.390 | Sim76-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:48:58.392 | Sim76-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:58.395 | Sim76-Client | Search jobs | GET /jobs?search=Sim76 | OK | 3ms |
| 11 | 17:48:58.397 | Sim76-Client | Get job detail | GET /jobs/48985016-0981-4dc0-b21d-9aa67f92a5de | OK | 2ms |
| 12 | 17:48:58.409 | Sim76-Handler | Place bid on job 1 | POST /jobs/48985016-0981-4dc0-b21d-9aa67f92a5de/bid | OK | 12ms |
| 13 | 17:48:58.413 | Sim76-Handler | Duplicate bid (expect 409) | POST /jobs/48985016-0981-4dc0-b21d-9aa67f92a5de/bid | EXP_FAIL | 4ms |
| 14 | 17:48:58.430 | Sim76-Client | Register client agent for self-deal test | POST /agents | OK | 17ms |
| 15 | 17:48:58.433 | Sim76-Client | Self-deal bid (expect 403) | POST /jobs/48985016-0981-4dc0-b21d-9aa67f92a5de/bid | EXP_FAIL | 3ms |
| 16 | 17:48:58.441 | Sim76-Handler | Accept bid on job 1 | POST /jobs/48985016-0981-4dc0-b21d-9aa67f92a5de/accept | OK | 8ms |
| 17 | 17:48:58.460 | Sim76-Handler | Submit deliverable | POST /jobs/48985016-0981-4dc0-b21d-9aa67f92a5de/submit | OK | 18ms |
| 18 | 17:48:58.470 | Sim76-Client | Approve deliverable | POST /jobs/48985016-0981-4dc0-b21d-9aa67f92a5de/approve | OK | 10ms |
| 19 | 17:48:58.488 | Sim76-Client | Rate agent | POST /jobs/48985016-0981-4dc0-b21d-9aa67f92a5de/rate | OK | 18ms |
| 20 | 17:48:58.491 | Sim76-Client | Duplicate rating (expect 409) | POST /jobs/48985016-0981-4dc0-b21d-9aa67f92a5de/rate | EXP_FAIL | 3ms |
| 21 | 17:48:58.500 | Sim76-Client | Update open job | PUT /jobs/495dad3e-9f4d-45ae-a8e8-a5b284b14137 | OK | 9ms |
| 22 | 17:48:58.509 | Sim76-Client | Cancel open job | DELETE /jobs/495dad3e-9f4d-45ae-a8e8-a5b284b14137 | OK | 9ms |
| 23 | 17:48:58.511 | Sim76-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 24 | 17:48:58.514 | Sim76-Handler | Get agent detail | GET /agents/4b6eaef8-337e-43cf-84d1-d74733a58884 | OK | 3ms |
| 25 | 17:48:58.523 | Sim76-Handler | Update agent | PUT /agents/4b6eaef8-337e-43cf-84d1-d74733a58884 | OK | 9ms |
| 26 | 17:48:58.526 | Sim76-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 27 | 17:48:58.528 | Sim76-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 28 | 17:48:58.529 | Sim76-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 29 | 17:48:58.531 | Sim76-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 30 | 17:48:58.532 | Sim76-Handler | Agent job history | GET /agents/4b6eaef8-337e-43cf-84d1-d74733a58884/jobs | OK | 1ms |
| 31 | 17:48:58.534 | Sim76-Handler | Agent earnings | GET /agents/4b6eaef8-337e-43cf-84d1-d74733a58884/earnings | OK | 2ms |
| 32 | 17:48:58.534 | Sim76-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 33 | 17:48:58.536 | Sim76-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 34 | 17:48:58.536 | Sim76-NoAuth | Health check | GET /health | OK | 0ms |

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

