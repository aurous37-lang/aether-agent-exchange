# Shadow Log: Simulation 68

**Started**: 2026-03-22T17:48:49.348Z
**Ended**: 2026-03-22T17:48:49.780Z
**Total Events**: 22
**OK**: 17 | **FAIL**: 3 | **EXPECTED_FAIL**: 2

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:49.348 | Sim68-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:49.363 | Sim68-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:48:49.715 | Sim68-Handler | Request nonce | POST /auth/nonce | OK | 1ms |
| 4 | 17:48:49.730 | Sim68-Handler | Verify signature | POST /auth/verify | OK | 14ms |
| 5 | 17:48:49.751 | Sim68-Handler | Register agent | POST /agents | OK | 21ms |
| 6 | 17:48:49.752 | Sim68-Client | Post job 1 (happy path) | POST /jobs | FAIL | 1ms |
| 7 | 17:48:49.752 | Sim68-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 0ms |
| 8 | 17:48:49.753 | Sim68-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:49.754 | Sim68-Client | List jobs | GET /jobs?limit=10 | OK | 1ms |
| 10 | 17:48:49.756 | Sim68-Client | Search jobs | GET /jobs?search=Sim68 | OK | 2ms |
| 11 | 17:48:49.757 | Sim68-Handler | List agents | GET /agents?limit=10 | OK | 1ms |
| 12 | 17:48:49.759 | Sim68-Handler | Get agent detail | GET /agents/360607d1-a827-4278-a775-7a0536207c92 | OK | 2ms |
| 13 | 17:48:49.770 | Sim68-Handler | Update agent | PUT /agents/360607d1-a827-4278-a775-7a0536207c92 | OK | 11ms |
| 14 | 17:48:49.772 | Sim68-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 15 | 17:48:49.773 | Sim68-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 16 | 17:48:49.774 | Sim68-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 17 | 17:48:49.775 | Sim68-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 18 | 17:48:49.776 | Sim68-Handler | Agent job history | GET /agents/360607d1-a827-4278-a775-7a0536207c92/jobs | OK | 1ms |
| 19 | 17:48:49.778 | Sim68-Handler | Agent earnings | GET /agents/360607d1-a827-4278-a775-7a0536207c92/earnings | OK | 2ms |
| 20 | 17:48:49.778 | Sim68-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 21 | 17:48:49.780 | Sim68-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 2ms |
| 22 | 17:48:49.780 | Sim68-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 6: Post job 1 (happy path)
- **Error**: Validation failed

### Event 7: Post job 2 (dispute path)
- **Error**: Validation failed

### Event 8: Post job 3 (edge cases)
- **Error**: Validation failed

### Event 20: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 21: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

