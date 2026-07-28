# Shadow Log: Simulation 16

**Started**: 2026-03-22T17:48:06.660Z
**Ended**: 2026-03-22T17:48:07.581Z
**Total Events**: 32
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:06.660 | Sim16-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:06.676 | Sim16-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:48:07.029 | Sim16-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:07.041 | Sim16-Handler | Verify signature | POST /auth/verify | OK | 12ms |
| 5 | 17:48:07.063 | Sim16-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:48:07.065 | Sim16-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:48:07.077 | Sim16-Client | Post job 2 (dispute path) | POST /jobs | OK | 12ms |
| 8 | 17:48:07.088 | Sim16-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:48:07.090 | Sim16-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:07.092 | Sim16-Client | Search jobs | GET /jobs?search=Sim16 | OK | 2ms |
| 11 | 17:48:07.101 | Sim16-Handler | Bid on job 2 | POST /jobs/9fd74b9e-0f5e-4e1d-823e-0b396c3e610e/bid | OK | 9ms |
| 12 | 17:48:07.111 | Sim16-Handler | Accept job 2 | POST /jobs/9fd74b9e-0f5e-4e1d-823e-0b396c3e610e/accept | OK | 10ms |
| 13 | 17:48:07.129 | Sim16-Handler | Submit deliverable job 2 | POST /jobs/9fd74b9e-0f5e-4e1d-823e-0b396c3e610e/submit | OK | 18ms |
| 14 | 17:48:07.148 | Sim16-Client | File dispute | POST /jobs/9fd74b9e-0f5e-4e1d-823e-0b396c3e610e/dispute | OK | 19ms |
| 15 | 17:48:07.157 | Sim16-Client | Submit evidence | POST /disputes/0f6a6e55-b1f7-4bac-93f8-f9979da5f93f/evidence | OK | 9ms |
| 16 | 17:48:07.509 | Sim16-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:48:07.524 | Sim16-Arbiter1 | Verify signature | POST /auth/verify | OK | 14ms |
| 18 | 17:48:07.525 | Sim16-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/0f6a6e55-b1f7-4bac-93f8-f9979da5f93f/vote | EXP_FAIL | 1ms |
| 19 | 17:48:07.539 | Sim16-Client | Update open job | PUT /jobs/5c39b9be-6e2d-4a5b-9480-ebf7cf94b4b6 | OK | 13ms |
| 20 | 17:48:07.551 | Sim16-Client | Cancel open job | DELETE /jobs/5c39b9be-6e2d-4a5b-9480-ebf7cf94b4b6 | OK | 12ms |
| 21 | 17:48:07.554 | Sim16-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:48:07.556 | Sim16-Handler | Get agent detail | GET /agents/1ecfec39-d3e2-439e-8ca6-9f6ae81fdd6b | OK | 2ms |
| 23 | 17:48:07.567 | Sim16-Handler | Update agent | PUT /agents/1ecfec39-d3e2-439e-8ca6-9f6ae81fdd6b | OK | 11ms |
| 24 | 17:48:07.570 | Sim16-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:48:07.571 | Sim16-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 26 | 17:48:07.573 | Sim16-Handler | Get notifications | GET /handler/notifications | OK | 2ms |
| 27 | 17:48:07.576 | Sim16-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 3ms |
| 28 | 17:48:07.577 | Sim16-Handler | Agent job history | GET /agents/1ecfec39-d3e2-439e-8ca6-9f6ae81fdd6b/jobs | OK | 1ms |
| 29 | 17:48:07.579 | Sim16-Handler | Agent earnings | GET /agents/1ecfec39-d3e2-439e-8ca6-9f6ae81fdd6b/earnings | OK | 2ms |
| 30 | 17:48:07.580 | Sim16-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 31 | 17:48:07.581 | Sim16-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:48:07.581 | Sim16-NoAuth | Health check | GET /health | OK | 0ms |

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

