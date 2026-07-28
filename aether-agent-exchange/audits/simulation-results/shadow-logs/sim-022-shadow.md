# Shadow Log: Simulation 22

**Started**: 2026-03-22T17:48:12.361Z
**Ended**: 2026-03-22T17:48:13.293Z
**Total Events**: 32
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 3

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:12.361 | Sim22-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:12.381 | Sim22-Client | Verify signature | POST /auth/verify | OK | 19ms |
| 3 | 17:48:12.733 | Sim22-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:12.749 | Sim22-Handler | Verify signature | POST /auth/verify | OK | 15ms |
| 5 | 17:48:12.771 | Sim22-Handler | Register agent | POST /agents | OK | 22ms |
| 6 | 17:48:12.773 | Sim22-Client | Post job 1 (happy path) | POST /jobs | FAIL | 2ms |
| 7 | 17:48:12.784 | Sim22-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:48:12.796 | Sim22-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:48:12.798 | Sim22-Client | List jobs | GET /jobs?limit=10 | OK | 2ms |
| 10 | 17:48:12.801 | Sim22-Client | Search jobs | GET /jobs?search=Sim22 | OK | 3ms |
| 11 | 17:48:12.814 | Sim22-Handler | Bid on job 2 | POST /jobs/bae35276-6623-4849-8963-9c7a9d3aed59/bid | OK | 13ms |
| 12 | 17:48:12.825 | Sim22-Handler | Accept job 2 | POST /jobs/bae35276-6623-4849-8963-9c7a9d3aed59/accept | OK | 11ms |
| 13 | 17:48:12.843 | Sim22-Handler | Submit deliverable job 2 | POST /jobs/bae35276-6623-4849-8963-9c7a9d3aed59/submit | OK | 18ms |
| 14 | 17:48:12.862 | Sim22-Client | File dispute | POST /jobs/bae35276-6623-4849-8963-9c7a9d3aed59/dispute | OK | 19ms |
| 15 | 17:48:12.872 | Sim22-Client | Submit evidence | POST /disputes/d232e4d1-15c5-4f07-bb4c-23eff355d459/evidence | OK | 10ms |
| 16 | 17:48:13.225 | Sim22-Arbiter1 | Request nonce | POST /auth/nonce | OK | 2ms |
| 17 | 17:48:13.241 | Sim22-Arbiter1 | Verify signature | POST /auth/verify | OK | 16ms |
| 18 | 17:48:13.242 | Sim22-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/d232e4d1-15c5-4f07-bb4c-23eff355d459/vote | EXP_FAIL | 1ms |
| 19 | 17:48:13.255 | Sim22-Client | Update open job | PUT /jobs/d07b9de2-5e0b-4b68-9958-23476ec7b6ed | OK | 13ms |
| 20 | 17:48:13.266 | Sim22-Client | Cancel open job | DELETE /jobs/d07b9de2-5e0b-4b68-9958-23476ec7b6ed | OK | 11ms |
| 21 | 17:48:13.269 | Sim22-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 22 | 17:48:13.271 | Sim22-Handler | Get agent detail | GET /agents/a078c7ea-e913-4894-991d-f282730cf398 | OK | 2ms |
| 23 | 17:48:13.283 | Sim22-Handler | Update agent | PUT /agents/a078c7ea-e913-4894-991d-f282730cf398 | OK | 12ms |
| 24 | 17:48:13.286 | Sim22-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 25 | 17:48:13.287 | Sim22-Handler | Handler agents list | GET /handler/agents | OK | 1ms |
| 26 | 17:48:13.288 | Sim22-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 27 | 17:48:13.289 | Sim22-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 28 | 17:48:13.290 | Sim22-Handler | Agent job history | GET /agents/a078c7ea-e913-4894-991d-f282730cf398/jobs | OK | 1ms |
| 29 | 17:48:13.291 | Sim22-Handler | Agent earnings | GET /agents/a078c7ea-e913-4894-991d-f282730cf398/earnings | OK | 1ms |
| 30 | 17:48:13.292 | Sim22-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 31 | 17:48:13.293 | Sim22-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 32 | 17:48:13.293 | Sim22-NoAuth | Health check | GET /health | OK | 0ms |

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

