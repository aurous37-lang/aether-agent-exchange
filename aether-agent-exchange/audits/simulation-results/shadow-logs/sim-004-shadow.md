# Shadow Log: Simulation 4

**Started**: 2026-03-22T17:47:52.609Z
**Ended**: 2026-03-22T17:47:53.552Z
**Total Events**: 32
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:47:52.609 | Sim4-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:47:52.625 | Sim4-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:47:52.977 | Sim4-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:47:52.994 | Sim4-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:47:53.019 | Sim4-Handler | Register agent | POST /agents | OK | 25ms |
| 6 | 17:47:53.021 | Sim4-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:47:53.033 | Sim4-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:47:53.045 | Sim4-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:47:53.048 | Sim4-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:47:53.050 | Sim4-Client | Search jobs | GET /jobs?search=Sim4 | OK | 2ms |
| 11 | 17:47:53.062 | Sim4-Handler | Bid on job 2 | POST /jobs/3678999b-da64-48c3-8afd-67137f503b49/bid | OK | 12ms |
| 12 | 17:47:53.073 | Sim4-Handler | Accept job 2 | POST /jobs/3678999b-da64-48c3-8afd-67137f503b49/accept | OK | 11ms |
| 13 | 17:47:53.092 | Sim4-Handler | Submit deliverable job 2 | POST /jobs/3678999b-da64-48c3-8afd-67137f503b49/submit | OK | 19ms |
| 14 | 17:47:53.111 | Sim4-Client | File dispute | POST /jobs/3678999b-da64-48c3-8afd-67137f503b49/dispute | OK | 19ms |
| 15 | 17:47:53.122 | Sim4-Client | Submit evidence | POST /disputes/8263f1cf-e515-405d-bd34-7c2eb92d832e/evidence | OK | 11ms |
| 16 | 17:47:53.476 | Sim4-Arbiter1 | Request nonce | POST /auth/nonce | OK | 3ms |
| 17 | 17:47:53.494 | Sim4-Arbiter1 | Verify signature | POST /auth/verify | OK | 17ms |
| 18 | 17:47:53.495 | Sim4-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/8263f1cf-e515-405d-bd34-7c2eb92d832e/vote | EXP_FAIL | 1ms |
| 19 | 17:47:53.506 | Sim4-Client | Update open job | PUT /jobs/faf9336c-e033-427c-b5dc-b06a43ceb899 | OK | 11ms |
| 20 | 17:47:53.519 | Sim4-Client | Cancel open job | DELETE /jobs/faf9336c-e033-427c-b5dc-b06a43ceb899 | OK | 13ms |
| 21 | 17:47:53.522 | Sim4-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:47:53.526 | Sim4-Handler | Get agent detail | GET /agents/e9c1dc8a-060e-4a2b-9a31-29d4a6efcef4 | OK | 4ms |
| 23 | 17:47:53.538 | Sim4-Handler | Update agent | PUT /agents/e9c1dc8a-060e-4a2b-9a31-29d4a6efcef4 | OK | 12ms |
| 24 | 17:47:53.541 | Sim4-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:47:53.542 | Sim4-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 26 | 17:47:53.544 | Sim4-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 27 | 17:47:53.545 | Sim4-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:47:53.547 | Sim4-Handler | Agent job history | GET /agents/e9c1dc8a-060e-4a2b-9a31-29d4a6efcef4/jobs | OK | 2ms |
| 29 | 17:47:53.549 | Sim4-Handler | Agent earnings | GET /agents/e9c1dc8a-060e-4a2b-9a31-29d4a6efcef4/earnings | OK | 2ms |
| 30 | 17:47:53.550 | Sim4-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 31 | 17:47:53.551 | Sim4-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:47:53.552 | Sim4-NoAuth | Health check | GET /health | OK | 1ms |

---

## Event Details

### Event 6: Post job 1 (happy path)
- **Error**: Validation failed

### Event 18: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 30: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 31: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

