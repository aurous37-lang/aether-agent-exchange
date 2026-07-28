# Shadow Log: Simulation 69

**Started**: 2026-03-22T17:48:50.134Z
**Ended**: 2026-03-22T17:48:50.684Z
**Total Events**: 32
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:50.134 | Sim69-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:50.151 | Sim69-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:48:50.503 | Sim69-Handler | Request nonce | POST /auth/nonce | OK | 1ms |
| 4 | 17:48:50.518 | Sim69-Handler | Verify signature | POST /auth/verify | OK | 14ms |
| 5 | 17:48:50.541 | Sim69-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:48:50.552 | Sim69-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:48:50.553 | Sim69-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 1ms |
| 8 | 17:48:50.554 | Sim69-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:50.557 | Sim69-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:50.559 | Sim69-Client | Search jobs | GET /jobs?search=Sim69 | OK | 2ms |
| 11 | 17:48:50.561 | Sim69-Client | Get job detail | GET /jobs/b64c7d2b-bdfb-434f-afc2-94a76fae572a | OK | 2ms |
| 12 | 17:48:50.572 | Sim69-Handler | Place bid on job 1 | POST /jobs/b64c7d2b-bdfb-434f-afc2-94a76fae572a/bid | OK | 11ms |
| 13 | 17:48:50.576 | Sim69-Handler | Duplicate bid (expect 409) | POST /jobs/b64c7d2b-bdfb-434f-afc2-94a76fae572a/bid | EXP_FAIL | 4ms |
| 14 | 17:48:50.597 | Sim69-Client | Register client agent for self-deal test | POST /agents | OK | 21ms |
| 15 | 17:48:50.600 | Sim69-Client | Self-deal bid (expect 403) | POST /jobs/b64c7d2b-bdfb-434f-afc2-94a76fae572a/bid | EXP_FAIL | 3ms |
| 16 | 17:48:50.610 | Sim69-Handler | Accept bid on job 1 | POST /jobs/b64c7d2b-bdfb-434f-afc2-94a76fae572a/accept | OK | 10ms |
| 17 | 17:48:50.627 | Sim69-Handler | Submit deliverable | POST /jobs/b64c7d2b-bdfb-434f-afc2-94a76fae572a/submit | OK | 17ms |
| 18 | 17:48:50.637 | Sim69-Client | Approve deliverable | POST /jobs/b64c7d2b-bdfb-434f-afc2-94a76fae572a/approve | OK | 10ms |
| 19 | 17:48:50.655 | Sim69-Client | Rate agent | POST /jobs/b64c7d2b-bdfb-434f-afc2-94a76fae572a/rate | OK | 18ms |
| 20 | 17:48:50.657 | Sim69-Client | Duplicate rating (expect 409) | POST /jobs/b64c7d2b-bdfb-434f-afc2-94a76fae572a/rate | EXP_FAIL | 2ms |
| 21 | 17:48:50.660 | Sim69-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:48:50.661 | Sim69-Handler | Get agent detail | GET /agents/3263f8f4-ca7a-4e94-ad36-34aea567b5ae | OK | 1ms |
| 23 | 17:48:50.670 | Sim69-Handler | Update agent | PUT /agents/3263f8f4-ca7a-4e94-ad36-34aea567b5ae | OK | 9ms |
| 24 | 17:48:50.673 | Sim69-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:48:50.675 | Sim69-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:48:50.677 | Sim69-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 27 | 17:48:50.679 | Sim69-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 28 | 17:48:50.680 | Sim69-Handler | Agent job history | GET /agents/3263f8f4-ca7a-4e94-ad36-34aea567b5ae/jobs | OK | 1ms |
| 29 | 17:48:50.682 | Sim69-Handler | Agent earnings | GET /agents/3263f8f4-ca7a-4e94-ad36-34aea567b5ae/earnings | OK | 2ms |
| 30 | 17:48:50.683 | Sim69-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 31 | 17:48:50.684 | Sim69-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:48:50.684 | Sim69-NoAuth | Health check | GET /health | OK | 0ms |

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

