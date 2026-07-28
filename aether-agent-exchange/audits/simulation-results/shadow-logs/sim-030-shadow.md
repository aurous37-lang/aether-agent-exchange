# Shadow Log: Simulation 30

**Started**: 2026-03-22T17:48:22.209Z
**Ended**: 2026-03-22T17:48:22.788Z
**Total Events**: 34
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:22.209 | Sim30-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:22.225 | Sim30-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:48:22.577 | Sim30-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:22.593 | Sim30-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:48:22.615 | Sim30-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:48:22.627 | Sim30-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:22.629 | Sim30-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:48:22.641 | Sim30-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:48:22.644 | Sim30-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:22.646 | Sim30-Client | Search jobs | GET /jobs?search=Sim30 | OK | 2ms |
| 11 | 17:48:22.648 | Sim30-Client | Get job detail | GET /jobs/9a9eab20-0dec-49d4-8d57-6cc7867c8cf7 | OK | 2ms |
| 12 | 17:48:22.658 | Sim30-Handler | Place bid on job 1 | POST /jobs/9a9eab20-0dec-49d4-8d57-6cc7867c8cf7/bid | OK | 10ms |
| 13 | 17:48:22.661 | Sim30-Handler | Duplicate bid (expect 409) | POST /jobs/9a9eab20-0dec-49d4-8d57-6cc7867c8cf7/bid | EXP_FAIL | 2ms |
| 14 | 17:48:22.678 | Sim30-Client | Register client agent for self-deal test | POST /agents | OK | 17ms |
| 15 | 17:48:22.681 | Sim30-Client | Self-deal bid (expect 403) | POST /jobs/9a9eab20-0dec-49d4-8d57-6cc7867c8cf7/bid | EXP_FAIL | 3ms |
| 16 | 17:48:22.691 | Sim30-Handler | Accept bid on job 1 | POST /jobs/9a9eab20-0dec-49d4-8d57-6cc7867c8cf7/accept | OK | 10ms |
| 17 | 17:48:22.710 | Sim30-Handler | Submit deliverable | POST /jobs/9a9eab20-0dec-49d4-8d57-6cc7867c8cf7/submit | OK | 19ms |
| 18 | 17:48:22.720 | Sim30-Client | Approve deliverable | POST /jobs/9a9eab20-0dec-49d4-8d57-6cc7867c8cf7/approve | OK | 10ms |
| 19 | 17:48:22.738 | Sim30-Client | Rate agent | POST /jobs/9a9eab20-0dec-49d4-8d57-6cc7867c8cf7/rate | OK | 18ms |
| 20 | 17:48:22.741 | Sim30-Client | Duplicate rating (expect 409) | POST /jobs/9a9eab20-0dec-49d4-8d57-6cc7867c8cf7/rate | EXP_FAIL | 3ms |
| 21 | 17:48:22.750 | Sim30-Client | Update open job | PUT /jobs/fb1dff45-6460-4cd8-97d2-2728205efa1b | OK | 9ms |
| 22 | 17:48:22.760 | Sim30-Client | Cancel open job | DELETE /jobs/fb1dff45-6460-4cd8-97d2-2728205efa1b | OK | 10ms |
| 23 | 17:48:22.764 | Sim30-Handler | List agents | GET /agents?limit=10 | OK | 4ms |
| 24 | 17:48:22.766 | Sim30-Handler | Get agent detail | GET /agents/0eeb0ea0-4f55-4586-9c9b-75afb68f6881 | OK | 2ms |
| 25 | 17:48:22.776 | Sim30-Handler | Update agent | PUT /agents/0eeb0ea0-4f55-4586-9c9b-75afb68f6881 | OK | 10ms |
| 26 | 17:48:22.778 | Sim30-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 27 | 17:48:22.780 | Sim30-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 28 | 17:48:22.781 | Sim30-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 29 | 17:48:22.782 | Sim30-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 30 | 17:48:22.784 | Sim30-Handler | Agent job history | GET /agents/0eeb0ea0-4f55-4586-9c9b-75afb68f6881/jobs | OK | 2ms |
| 31 | 17:48:22.785 | Sim30-Handler | Agent earnings | GET /agents/0eeb0ea0-4f55-4586-9c9b-75afb68f6881/earnings | OK | 1ms |
| 32 | 17:48:22.786 | Sim30-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 33 | 17:48:22.788 | Sim30-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 34 | 17:48:22.788 | Sim30-NoAuth | Health check | GET /health | OK | 0ms |

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

