# Shadow Log: Simulation 28

**Started**: 2026-03-22T17:48:19.578Z
**Ended**: 2026-03-22T17:48:20.470Z
**Total Events**: 30
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:19.578 | Sim28-Client | Request nonce | POST /auth/nonce | OK | 1ms |
| 2 | 17:48:19.594 | Sim28-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:48:19.946 | Sim28-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:19.962 | Sim28-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:19.983 | Sim28-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:48:19.985 | Sim28-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:48:19.995 | Sim28-Client | Post job 2 (dispute path) | POST /jobs | OK | 10ms |
| 8 | 17:48:19.997 | Sim28-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 2ms |
| 9 | 17:48:19.999 | Sim28-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:20.001 | Sim28-Client | Search jobs | GET /jobs?search=Sim28 | OK | 2ms |
| 11 | 17:48:20.012 | Sim28-Handler | Bid on job 2 | POST /jobs/58bc3359-cc2c-4a23-abb9-a477834c10f4/bid | OK | 11ms |
| 12 | 17:48:20.024 | Sim28-Handler | Accept job 2 | POST /jobs/58bc3359-cc2c-4a23-abb9-a477834c10f4/accept | OK | 12ms |
| 13 | 17:48:20.043 | Sim28-Handler | Submit deliverable job 2 | POST /jobs/58bc3359-cc2c-4a23-abb9-a477834c10f4/submit | OK | 19ms |
| 14 | 17:48:20.062 | Sim28-Client | File dispute | POST /jobs/58bc3359-cc2c-4a23-abb9-a477834c10f4/dispute | OK | 19ms |
| 15 | 17:48:20.073 | Sim28-Client | Submit evidence | POST /disputes/6634ef40-eafe-42a1-bad1-888cfde5c13b/evidence | OK | 11ms |
| 16 | 17:48:20.424 | Sim28-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:48:20.439 | Sim28-Arbiter1 | Verify signature | POST /auth/verify | OK | 14ms |
| 18 | 17:48:20.442 | Sim28-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/6634ef40-eafe-42a1-bad1-888cfde5c13b/vote | EXP_FAIL | 2ms |
| 19 | 17:48:20.444 | Sim28-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 20 | 17:48:20.446 | Sim28-Handler | Get agent detail | GET /agents/846aceb2-cbc2-42e6-9f0b-b0ea86f8bd03 | OK | 2ms |
| 21 | 17:48:20.456 | Sim28-Handler | Update agent | PUT /agents/846aceb2-cbc2-42e6-9f0b-b0ea86f8bd03 | OK | 10ms |
| 22 | 17:48:20.459 | Sim28-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 23 | 17:48:20.461 | Sim28-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 24 | 17:48:20.463 | Sim28-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 25 | 17:48:20.464 | Sim28-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 26 | 17:48:20.466 | Sim28-Handler | Agent job history | GET /agents/846aceb2-cbc2-42e6-9f0b-b0ea86f8bd03/jobs | OK | 2ms |
| 27 | 17:48:20.467 | Sim28-Handler | Agent earnings | GET /agents/846aceb2-cbc2-42e6-9f0b-b0ea86f8bd03/earnings | OK | 1ms |
| 28 | 17:48:20.468 | Sim28-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 29 | 17:48:20.469 | Sim28-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 30 | 17:48:20.470 | Sim28-NoAuth | Health check | GET /health | OK | 1ms |

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

