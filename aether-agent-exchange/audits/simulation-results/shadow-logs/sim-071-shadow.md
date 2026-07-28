# Shadow Log: Simulation 71

**Started**: 2026-03-22T17:48:51.871Z
**Ended**: 2026-03-22T17:48:52.769Z
**Total Events**: 30
**OK**: 25 | **FAIL**: 2 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:51.871 | Sim71-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:51.890 | Sim71-Client | Verify signature | POST /auth/verify | OK | 18ms |
| 3 | 17:48:52.242 | Sim71-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:52.260 | Sim71-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:48:52.284 | Sim71-Handler | Register agent | POST /agents | OK | 24ms |
| 6 | 17:48:52.287 | Sim71-Client | Post job 1 (happy path) | POST /jobs | FAIL | 3ms |
| 7 | 17:48:52.297 | Sim71-Client | Post job 2 (dispute path) | POST /jobs | OK | 10ms |
| 8 | 17:48:52.298 | Sim71-Client | Post job 3 (edge cases) | POST /jobs | FAIL | 1ms |
| 9 | 17:48:52.300 | Sim71-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:52.302 | Sim71-Client | Search jobs | GET /jobs?search=Sim71 | OK | 2ms |
| 11 | 17:48:52.313 | Sim71-Handler | Bid on job 2 | POST /jobs/36772b9b-265a-4e84-a9b8-0fb7b2266555/bid | OK | 11ms |
| 12 | 17:48:52.325 | Sim71-Handler | Accept job 2 | POST /jobs/36772b9b-265a-4e84-a9b8-0fb7b2266555/accept | OK | 12ms |
| 13 | 17:48:52.343 | Sim71-Handler | Submit deliverable job 2 | POST /jobs/36772b9b-265a-4e84-a9b8-0fb7b2266555/submit | OK | 17ms |
| 14 | 17:48:52.362 | Sim71-Client | File dispute | POST /jobs/36772b9b-265a-4e84-a9b8-0fb7b2266555/dispute | OK | 19ms |
| 15 | 17:48:52.373 | Sim71-Client | Submit evidence | POST /disputes/aa872b90-e331-4724-9c2d-bc327fe7d8f4/evidence | OK | 11ms |
| 16 | 17:48:52.726 | Sim71-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:48:52.743 | Sim71-Arbiter1 | Verify signature | POST /auth/verify | OK | 16ms |
| 18 | 17:48:52.744 | Sim71-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/aa872b90-e331-4724-9c2d-bc327fe7d8f4/vote | EXP_FAIL | 1ms |
| 19 | 17:48:52.746 | Sim71-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 20 | 17:48:52.748 | Sim71-Handler | Get agent detail | GET /agents/8654b4f7-7146-4549-ad48-00e4064ac0f3 | OK | 2ms |
| 21 | 17:48:52.760 | Sim71-Handler | Update agent | PUT /agents/8654b4f7-7146-4549-ad48-00e4064ac0f3 | OK | 12ms |
| 22 | 17:48:52.762 | Sim71-Handler | Handler dashboard | GET /handler/dashboard | OK | 2ms |
| 23 | 17:48:52.763 | Sim71-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 24 | 17:48:52.764 | Sim71-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 25 | 17:48:52.765 | Sim71-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 26 | 17:48:52.766 | Sim71-Handler | Agent job history | GET /agents/8654b4f7-7146-4549-ad48-00e4064ac0f3/jobs | OK | 1ms |
| 27 | 17:48:52.767 | Sim71-Handler | Agent earnings | GET /agents/8654b4f7-7146-4549-ad48-00e4064ac0f3/earnings | OK | 1ms |
| 28 | 17:48:52.767 | Sim71-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 0ms |
| 29 | 17:48:52.768 | Sim71-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 30 | 17:48:52.769 | Sim71-NoAuth | Health check | GET /health | OK | 1ms |

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

