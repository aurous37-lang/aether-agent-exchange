# Shadow Log: Simulation 14

**Started**: 2026-03-22T17:48:04.926Z
**Ended**: 2026-03-22T17:48:05.477Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:04.926 | Sim14-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:04.944 | Sim14-Client | Verify signature | POST /auth/verify | OK | 17ms |
| 3 | 17:48:05.295 | Sim14-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:05.312 | Sim14-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:05.333 | Sim14-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:48:05.344 | Sim14-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:48:05.346 | Sim14-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:48:05.347 | Sim14-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:05.349 | Sim14-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:05.351 | Sim14-Client | Search jobs | GET /jobs?search=Sim14 | OK | 2ms |
| 11 | 17:48:05.354 | Sim14-Client | Get job detail | GET /jobs/143ce1ab-f491-40c6-aafc-9a87055b1913 | OK | 3ms |
| 12 | 17:48:05.366 | Sim14-Handler | Place bid on job 1 | POST /jobs/143ce1ab-f491-40c6-aafc-9a87055b1913/bid | OK | 12ms |
| 13 | 17:48:05.370 | Sim14-Handler | Duplicate bid (expect 409) | POST /jobs/143ce1ab-f491-40c6-aafc-9a87055b1913/bid | EXP_FAIL | 4ms |
| 14 | 17:48:05.392 | Sim14-Client | Register client agent for self-deal test | POST /agents | OK | 22ms |
| 15 | 17:48:05.394 | Sim14-Client | Self-deal bid (expect 403) | POST /jobs/143ce1ab-f491-40c6-aafc-9a87055b1913/bid | EXP_FAIL | 2ms |
| 16 | 17:48:05.403 | Sim14-Handler | Accept bid on job 1 | POST /jobs/143ce1ab-f491-40c6-aafc-9a87055b1913/accept | OK | 9ms |
| 17 | 17:48:05.422 | Sim14-Handler | Submit deliverable | POST /jobs/143ce1ab-f491-40c6-aafc-9a87055b1913/submit | OK | 19ms |
| 18 | 17:48:05.433 | Sim14-Client | Approve deliverable | POST /jobs/143ce1ab-f491-40c6-aafc-9a87055b1913/approve | OK | 11ms |
| 19 | 17:48:05.452 | Sim14-Client | Rate agent | POST /jobs/143ce1ab-f491-40c6-aafc-9a87055b1913/rate | OK | 19ms |
| 20 | 17:48:05.455 | Sim14-Client | Duplicate rating (expect 409) | POST /jobs/143ce1ab-f491-40c6-aafc-9a87055b1913/rate | EXP_FAIL | 3ms |
| 21 | 17:48:05.456 | Sim14-Handler | List agents | GET /agents?limit=10 | OK | 1ms |
| 22 | 17:48:05.458 | Sim14-Handler | Get agent detail | GET /agents/ce84087b-4f9f-4144-b08a-17385fa9349d | OK | 2ms |
| 23 | 17:48:05.466 | Sim14-Handler | Update agent | PUT /agents/ce84087b-4f9f-4144-b08a-17385fa9349d | OK | 8ms |
| 24 | 17:48:05.468 | Sim14-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 25 | 17:48:05.470 | Sim14-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:48:05.470 | Sim14-Handler | Get notifications | GET /handler/notifications | OK | 0ms |
| 27 | 17:48:05.471 | Sim14-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:48:05.472 | Sim14-Handler | Agent job history | GET /agents/ce84087b-4f9f-4144-b08a-17385fa9349d/jobs | OK | 1ms |
| 29 | 17:48:05.473 | Sim14-Handler | Agent earnings | GET /agents/ce84087b-4f9f-4144-b08a-17385fa9349d/earnings | OK | 1ms |
| 30 | 17:48:05.474 | Sim14-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 31 | 17:48:05.476 | Sim14-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 32 | 17:48:05.477 | Sim14-NoAuth | Health check | GET /health | OK | 1ms |

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

