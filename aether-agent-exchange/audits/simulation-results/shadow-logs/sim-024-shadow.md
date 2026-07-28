# Shadow Log: Simulation 24

**Started**: 2026-03-22T17:48:15.013Z
**Ended**: 2026-03-22T17:48:15.585Z
**Total Events**: 34
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:15.013 | Sim24-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:15.028 | Sim24-Client | Verify signature | POST /auth/verify | OK | 14ms |
| 3 | 17:48:15.380 | Sim24-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:48:15.395 | Sim24-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:48:15.416 | Sim24-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:48:15.428 | Sim24-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:15.430 | Sim24-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:48:15.441 | Sim24-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:48:15.443 | Sim24-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:15.445 | Sim24-Client | Search jobs | GET /jobs?search=Sim24 | OK | 2ms |
| 11 | 17:48:15.447 | Sim24-Client | Get job detail | GET /jobs/d72947e1-ad75-48c9-af6a-fc233ffd458e | OK | 2ms |
| 12 | 17:48:15.458 | Sim24-Handler | Place bid on job 1 | POST /jobs/d72947e1-ad75-48c9-af6a-fc233ffd458e/bid | OK | 11ms |
| 13 | 17:48:15.461 | Sim24-Handler | Duplicate bid (expect 409) | POST /jobs/d72947e1-ad75-48c9-af6a-fc233ffd458e/bid | EXP_FAIL | 3ms |
| 14 | 17:48:15.481 | Sim24-Client | Register client agent for self-deal test | POST /agents | OK | 20ms |
| 15 | 17:48:15.485 | Sim24-Client | Self-deal bid (expect 403) | POST /jobs/d72947e1-ad75-48c9-af6a-fc233ffd458e/bid | EXP_FAIL | 4ms |
| 16 | 17:48:15.496 | Sim24-Handler | Accept bid on job 1 | POST /jobs/d72947e1-ad75-48c9-af6a-fc233ffd458e/accept | OK | 11ms |
| 17 | 17:48:15.514 | Sim24-Handler | Submit deliverable | POST /jobs/d72947e1-ad75-48c9-af6a-fc233ffd458e/submit | OK | 18ms |
| 18 | 17:48:15.524 | Sim24-Client | Approve deliverable | POST /jobs/d72947e1-ad75-48c9-af6a-fc233ffd458e/approve | OK | 10ms |
| 19 | 17:48:15.541 | Sim24-Client | Rate agent | POST /jobs/d72947e1-ad75-48c9-af6a-fc233ffd458e/rate | OK | 17ms |
| 20 | 17:48:15.544 | Sim24-Client | Duplicate rating (expect 409) | POST /jobs/d72947e1-ad75-48c9-af6a-fc233ffd458e/rate | EXP_FAIL | 3ms |
| 21 | 17:48:15.553 | Sim24-Client | Update open job | PUT /jobs/dbbbda68-45a5-4c38-a578-98cad2229828 | OK | 9ms |
| 22 | 17:48:15.561 | Sim24-Client | Cancel open job | DELETE /jobs/dbbbda68-45a5-4c38-a578-98cad2229828 | OK | 8ms |
| 23 | 17:48:15.564 | Sim24-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 24 | 17:48:15.566 | Sim24-Handler | Get agent detail | GET /agents/8d973ff9-fe35-4223-b3f0-473edadaf5b7 | OK | 2ms |
| 25 | 17:48:15.575 | Sim24-Handler | Update agent | PUT /agents/8d973ff9-fe35-4223-b3f0-473edadaf5b7 | OK | 9ms |
| 26 | 17:48:15.577 | Sim24-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 27 | 17:48:15.578 | Sim24-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 28 | 17:48:15.579 | Sim24-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 29 | 17:48:15.580 | Sim24-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 30 | 17:48:15.582 | Sim24-Handler | Agent job history | GET /agents/8d973ff9-fe35-4223-b3f0-473edadaf5b7/jobs | OK | 2ms |
| 31 | 17:48:15.583 | Sim24-Handler | Agent earnings | GET /agents/8d973ff9-fe35-4223-b3f0-473edadaf5b7/earnings | OK | 1ms |
| 32 | 17:48:15.584 | Sim24-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 33 | 17:48:15.585 | Sim24-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 34 | 17:48:15.585 | Sim24-NoAuth | Health check | GET /health | OK | 0ms |

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

