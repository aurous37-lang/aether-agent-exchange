# Shadow Log: Simulation 73

**Started**: 2026-03-22T17:48:54.520Z
**Ended**: 2026-03-22T17:48:55.445Z
**Total Events**: 32
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:54.520 | Sim73-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:54.536 | Sim73-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:48:54.888 | Sim73-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:48:54.905 | Sim73-Handler | Verify signature | POST /auth/verify | OK | 17ms |
| 5 | 17:48:54.925 | Sim73-Handler | Register agent | POST /agents | OK | 20ms |
| 6 | 17:48:54.927 | Sim73-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:48:54.937 | Sim73-Client | Post job 2 (dispute path) | POST /jobs | OK | 10ms |
| 8 | 17:48:54.948 | Sim73-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:48:54.952 | Sim73-Client | List jobs | GET /jobs?limit=10 | OK | 4ms |
| 10 | 17:48:54.955 | Sim73-Client | Search jobs | GET /jobs?search=Sim73 | OK | 3ms |
| 11 | 17:48:54.969 | Sim73-Handler | Bid on job 2 | POST /jobs/2ffda40c-79fd-43b2-90ec-9f5e5bdd76af/bid | OK | 14ms |
| 12 | 17:48:54.982 | Sim73-Handler | Accept job 2 | POST /jobs/2ffda40c-79fd-43b2-90ec-9f5e5bdd76af/accept | OK | 13ms |
| 13 | 17:48:54.999 | Sim73-Handler | Submit deliverable job 2 | POST /jobs/2ffda40c-79fd-43b2-90ec-9f5e5bdd76af/submit | OK | 17ms |
| 14 | 17:48:55.018 | Sim73-Client | File dispute | POST /jobs/2ffda40c-79fd-43b2-90ec-9f5e5bdd76af/dispute | OK | 18ms |
| 15 | 17:48:55.028 | Sim73-Client | Submit evidence | POST /disputes/b8029544-43e8-4e50-9e3c-3d2452c5a097/evidence | OK | 10ms |
| 16 | 17:48:55.381 | Sim73-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:48:55.397 | Sim73-Arbiter1 | Verify signature | POST /auth/verify | OK | 15ms |
| 18 | 17:48:55.399 | Sim73-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/b8029544-43e8-4e50-9e3c-3d2452c5a097/vote | EXP_FAIL | 1ms |
| 19 | 17:48:55.410 | Sim73-Client | Update open job | PUT /jobs/d102c498-2956-4451-9f6b-5803c5c8d4d6 | OK | 11ms |
| 20 | 17:48:55.419 | Sim73-Client | Cancel open job | DELETE /jobs/d102c498-2956-4451-9f6b-5803c5c8d4d6 | OK | 9ms |
| 21 | 17:48:55.421 | Sim73-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 22 | 17:48:55.423 | Sim73-Handler | Get agent detail | GET /agents/86e664c1-b2c0-48b6-97e0-ec6a9d71dda6 | OK | 2ms |
| 23 | 17:48:55.431 | Sim73-Handler | Update agent | PUT /agents/86e664c1-b2c0-48b6-97e0-ec6a9d71dda6 | OK | 8ms |
| 24 | 17:48:55.434 | Sim73-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:48:55.437 | Sim73-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 26 | 17:48:55.438 | Sim73-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 27 | 17:48:55.439 | Sim73-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:48:55.441 | Sim73-Handler | Agent job history | GET /agents/86e664c1-b2c0-48b6-97e0-ec6a9d71dda6/jobs | OK | 2ms |
| 29 | 17:48:55.442 | Sim73-Handler | Agent earnings | GET /agents/86e664c1-b2c0-48b6-97e0-ec6a9d71dda6/earnings | OK | 1ms |
| 30 | 17:48:55.443 | Sim73-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 31 | 17:48:55.444 | Sim73-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:48:55.445 | Sim73-NoAuth | Health check | GET /health | OK | 1ms |

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

