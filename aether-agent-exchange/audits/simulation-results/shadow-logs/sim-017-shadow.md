# Shadow Log: Simulation 17

**Started**: 2026-03-22T17:48:07.935Z
**Ended**: 2026-03-22T17:48:08.521Z
**Total Events**: 34
**OK**: 28 | **FAIL**: 1 | **EXPECTED_FAIL**: 5

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:07.935 | Sim17-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:07.951 | Sim17-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:48:08.305 | Sim17-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:48:08.322 | Sim17-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:08.345 | Sim17-Handler | Register agent | POST /agents | OK | 23ms |
| 6 | 17:48:08.356 | Sim17-Client | Post job 1 (happy path) | POST /jobs | OK | 11ms |
| 7 | 17:48:08.358 | Sim17-Client | Post job 2 (dispute path) | POST /jobs | FAIL | 2ms |
| 8 | 17:48:08.369 | Sim17-Client | Post job 3 (edge cases) | POST /jobs | OK | 11ms |
| 9 | 17:48:08.372 | Sim17-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:08.376 | Sim17-Client | Search jobs | GET /jobs?search=Sim17 | OK | 4ms |
| 11 | 17:48:08.378 | Sim17-Client | Get job detail | GET /jobs/969f8174-bd3f-4781-9196-eb57dbf1c19e | OK | 2ms |
| 12 | 17:48:08.390 | Sim17-Handler | Place bid on job 1 | POST /jobs/969f8174-bd3f-4781-9196-eb57dbf1c19e/bid | OK | 12ms |
| 13 | 17:48:08.395 | Sim17-Handler | Duplicate bid (expect 409) | POST /jobs/969f8174-bd3f-4781-9196-eb57dbf1c19e/bid | EXP_FAIL | 5ms |
| 14 | 17:48:08.413 | Sim17-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:48:08.415 | Sim17-Client | Self-deal bid (expect 403) | POST /jobs/969f8174-bd3f-4781-9196-eb57dbf1c19e/bid | EXP_FAIL | 2ms |
| 16 | 17:48:08.424 | Sim17-Handler | Accept bid on job 1 | POST /jobs/969f8174-bd3f-4781-9196-eb57dbf1c19e/accept | OK | 9ms |
| 17 | 17:48:08.442 | Sim17-Handler | Submit deliverable | POST /jobs/969f8174-bd3f-4781-9196-eb57dbf1c19e/submit | OK | 18ms |
| 18 | 17:48:08.451 | Sim17-Client | Approve deliverable | POST /jobs/969f8174-bd3f-4781-9196-eb57dbf1c19e/approve | OK | 9ms |
| 19 | 17:48:08.469 | Sim17-Client | Rate agent | POST /jobs/969f8174-bd3f-4781-9196-eb57dbf1c19e/rate | OK | 18ms |
| 20 | 17:48:08.472 | Sim17-Client | Duplicate rating (expect 409) | POST /jobs/969f8174-bd3f-4781-9196-eb57dbf1c19e/rate | EXP_FAIL | 3ms |
| 21 | 17:48:08.483 | Sim17-Client | Update open job | PUT /jobs/f2a77afd-ab65-4da8-879a-fb79c4b512aa | OK | 11ms |
| 22 | 17:48:08.492 | Sim17-Client | Cancel open job | DELETE /jobs/f2a77afd-ab65-4da8-879a-fb79c4b512aa | OK | 9ms |
| 23 | 17:48:08.495 | Sim17-Handler | List agents | GET /agents?limit=10 | OK | 3ms |
| 24 | 17:48:08.497 | Sim17-Handler | Get agent detail | GET /agents/d53f3519-8cf7-42b4-ace2-b5cf3e747859 | OK | 2ms |
| 25 | 17:48:08.506 | Sim17-Handler | Update agent | PUT /agents/d53f3519-8cf7-42b4-ace2-b5cf3e747859 | OK | 9ms |
| 26 | 17:48:08.509 | Sim17-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 27 | 17:48:08.512 | Sim17-Handler | Handler agents list | GET /handler/agents | OK | 3ms |
| 28 | 17:48:08.513 | Sim17-Handler | Get notifications | GET /handler/notifications | OK | 1ms |
| 29 | 17:48:08.514 | Sim17-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 1ms |
| 30 | 17:48:08.516 | Sim17-Handler | Agent job history | GET /agents/d53f3519-8cf7-42b4-ace2-b5cf3e747859/jobs | OK | 2ms |
| 31 | 17:48:08.518 | Sim17-Handler | Agent earnings | GET /agents/d53f3519-8cf7-42b4-ace2-b5cf3e747859/earnings | OK | 2ms |
| 32 | 17:48:08.519 | Sim17-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 33 | 17:48:08.520 | Sim17-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 34 | 17:48:08.521 | Sim17-NoAuth | Health check | GET /health | OK | 1ms |

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

