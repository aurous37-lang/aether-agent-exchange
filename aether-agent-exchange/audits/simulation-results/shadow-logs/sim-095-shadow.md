# Shadow Log: Simulation 95

**Started**: 2026-03-22T17:49:19.022Z
**Ended**: 2026-03-22T17:49:19.953Z
**Total Events**: 32
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:19.022 | Sim95-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:49:19.040 | Sim95-Client | Verify signature | POST /auth/verify | OK | 18ms |
| 3 | 17:49:19.393 | Sim95-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:49:19.410 | Sim95-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:49:19.431 | Sim95-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:49:19.433 | Sim95-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:49:19.444 | Sim95-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:49:19.454 | Sim95-Client | Post job 3 (edge cases) | POST /jobs | OK | 10ms |
| 9 | 17:49:19.457 | Sim95-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:49:19.460 | Sim95-Client | Search jobs | GET /jobs?search=Sim95 | OK | 3ms |
| 11 | 17:49:19.472 | Sim95-Handler | Bid on job 2 | POST /jobs/c705ae6a-af4c-4056-b227-5dd3013a2377/bid | OK | 12ms |
| 12 | 17:49:19.484 | Sim95-Handler | Accept job 2 | POST /jobs/c705ae6a-af4c-4056-b227-5dd3013a2377/accept | OK | 12ms |
| 13 | 17:49:19.502 | Sim95-Handler | Submit deliverable job 2 | POST /jobs/c705ae6a-af4c-4056-b227-5dd3013a2377/submit | OK | 18ms |
| 14 | 17:49:19.519 | Sim95-Client | File dispute | POST /jobs/c705ae6a-af4c-4056-b227-5dd3013a2377/dispute | OK | 17ms |
| 15 | 17:49:19.529 | Sim95-Client | Submit evidence | POST /disputes/d5190644-56a7-4f3f-b4cc-eac9d15305e5/evidence | OK | 10ms |
| 16 | 17:49:19.881 | Sim95-Arbiter1 | Request nonce | POST /auth/nonce | OK | 1ms |
| 17 | 17:49:19.898 | Sim95-Arbiter1 | Verify signature | POST /auth/verify | OK | 16ms |
| 18 | 17:49:19.899 | Sim95-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/d5190644-56a7-4f3f-b4cc-eac9d15305e5/vote | EXP_FAIL | 1ms |
| 19 | 17:49:19.910 | Sim95-Client | Update open job | PUT /jobs/aa31b5f8-ea3f-42c7-8f80-b0a411951240 | OK | 11ms |
| 20 | 17:49:19.921 | Sim95-Client | Cancel open job | DELETE /jobs/aa31b5f8-ea3f-42c7-8f80-b0a411951240 | OK | 11ms |
| 21 | 17:49:19.924 | Sim95-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:49:19.926 | Sim95-Handler | Get agent detail | GET /agents/d3ee4cb5-b07e-434f-8867-45c54cc9ab36 | OK | 2ms |
| 23 | 17:49:19.938 | Sim95-Handler | Update agent | PUT /agents/d3ee4cb5-b07e-434f-8867-45c54cc9ab36 | OK | 12ms |
| 24 | 17:49:19.941 | Sim95-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:49:19.943 | Sim95-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 26 | 17:49:19.946 | Sim95-Handler | Get notifications | GET /handler/notifications | OK | 3ms |
| 27 | 17:49:19.948 | Sim95-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 28 | 17:49:19.950 | Sim95-Handler | Agent job history | GET /agents/d3ee4cb5-b07e-434f-8867-45c54cc9ab36/jobs | OK | 2ms |
| 29 | 17:49:19.951 | Sim95-Handler | Agent earnings | GET /agents/d3ee4cb5-b07e-434f-8867-45c54cc9ab36/earnings | OK | 1ms |
| 30 | 17:49:19.952 | Sim95-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 31 | 17:49:19.953 | Sim95-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:49:19.953 | Sim95-NoAuth | Health check | GET /health | OK | 0ms |

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

