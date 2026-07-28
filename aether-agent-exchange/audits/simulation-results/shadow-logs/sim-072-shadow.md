# Shadow Log: Simulation 72

**Started**: 2026-03-22T17:48:53.124Z
**Ended**: 2026-03-22T17:48:54.165Z
**Total Events**: 42
**OK**: 36 | **FAIL**: 0 | **EXPECTED_FAIL**: 6

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:53.124 | Sim72-Client | Request nonce | POST /auth/nonce | OK | 3ms |
| 2 | 17:48:53.140 | Sim72-Client | Verify signature | POST /auth/verify | OK | 16ms |
| 3 | 17:48:53.493 | Sim72-Handler | Request nonce | POST /auth/nonce | OK | 2ms |
| 4 | 17:48:53.509 | Sim72-Handler | Verify signature | POST /auth/verify | OK | 16ms |
| 5 | 17:48:53.534 | Sim72-Handler | Register agent | POST /agents | OK | 25ms |
| 6 | 17:48:53.546 | Sim72-Client | Post job 1 (happy path) | POST /jobs | OK | 12ms |
| 7 | 17:48:53.557 | Sim72-Client | Post job 2 (dispute path) | POST /jobs | OK | 11ms |
| 8 | 17:48:53.569 | Sim72-Client | Post job 3 (edge cases) | POST /jobs | OK | 12ms |
| 9 | 17:48:53.572 | Sim72-Client | List jobs | GET /jobs?limit=10 | OK | 3ms |
| 10 | 17:48:53.576 | Sim72-Client | Search jobs | GET /jobs?search=Sim72 | OK | 4ms |
| 11 | 17:48:53.578 | Sim72-Client | Get job detail | GET /jobs/b589d8b4-13ef-4eb4-9a94-9f941c9fcf7e | OK | 2ms |
| 12 | 17:48:53.590 | Sim72-Handler | Place bid on job 1 | POST /jobs/b589d8b4-13ef-4eb4-9a94-9f941c9fcf7e/bid | OK | 12ms |
| 13 | 17:48:53.594 | Sim72-Handler | Duplicate bid (expect 409) | POST /jobs/b589d8b4-13ef-4eb4-9a94-9f941c9fcf7e/bid | EXP_FAIL | 4ms |
| 14 | 17:48:53.612 | Sim72-Client | Register client agent for self-deal test | POST /agents | OK | 18ms |
| 15 | 17:48:53.615 | Sim72-Client | Self-deal bid (expect 403) | POST /jobs/b589d8b4-13ef-4eb4-9a94-9f941c9fcf7e/bid | EXP_FAIL | 3ms |
| 16 | 17:48:53.626 | Sim72-Handler | Accept bid on job 1 | POST /jobs/b589d8b4-13ef-4eb4-9a94-9f941c9fcf7e/accept | OK | 11ms |
| 17 | 17:48:53.645 | Sim72-Handler | Submit deliverable | POST /jobs/b589d8b4-13ef-4eb4-9a94-9f941c9fcf7e/submit | OK | 19ms |
| 18 | 17:48:53.654 | Sim72-Client | Approve deliverable | POST /jobs/b589d8b4-13ef-4eb4-9a94-9f941c9fcf7e/approve | OK | 9ms |
| 19 | 17:48:53.672 | Sim72-Client | Rate agent | POST /jobs/b589d8b4-13ef-4eb4-9a94-9f941c9fcf7e/rate | OK | 18ms |
| 20 | 17:48:53.675 | Sim72-Client | Duplicate rating (expect 409) | POST /jobs/b589d8b4-13ef-4eb4-9a94-9f941c9fcf7e/rate | EXP_FAIL | 3ms |
| 21 | 17:48:53.685 | Sim72-Handler | Bid on job 2 | POST /jobs/01b08bed-d3b5-4b56-9d59-7c45baf6c9c0/bid | OK | 10ms |
| 22 | 17:48:53.695 | Sim72-Handler | Accept job 2 | POST /jobs/01b08bed-d3b5-4b56-9d59-7c45baf6c9c0/accept | OK | 10ms |
| 23 | 17:48:53.713 | Sim72-Handler | Submit deliverable job 2 | POST /jobs/01b08bed-d3b5-4b56-9d59-7c45baf6c9c0/submit | OK | 18ms |
| 24 | 17:48:53.731 | Sim72-Client | File dispute | POST /jobs/01b08bed-d3b5-4b56-9d59-7c45baf6c9c0/dispute | OK | 18ms |
| 25 | 17:48:53.740 | Sim72-Client | Submit evidence | POST /disputes/518f9a4a-75e6-48e3-af33-43ce6feaae7d/evidence | OK | 9ms |
| 26 | 17:48:54.094 | Sim72-Arbiter1 | Request nonce | POST /auth/nonce | OK | 3ms |
| 27 | 17:48:54.110 | Sim72-Arbiter1 | Verify signature | POST /auth/verify | OK | 15ms |
| 28 | 17:48:54.112 | Sim72-Arbiter1 | Arbiter vote (expect 403 - role guard) | POST /disputes/518f9a4a-75e6-48e3-af33-43ce6feaae7d/vote | EXP_FAIL | 2ms |
| 29 | 17:48:54.123 | Sim72-Client | Update open job | PUT /jobs/d3fe2b61-a9a4-4da4-ae50-b43e60cce47e | OK | 11ms |
| 30 | 17:48:54.134 | Sim72-Client | Cancel open job | DELETE /jobs/d3fe2b61-a9a4-4da4-ae50-b43e60cce47e | OK | 11ms |
| 31 | 17:48:54.136 | Sim72-Handler | List agents | GET /agents?limit=10 | OK | 2ms |
| 32 | 17:48:54.139 | Sim72-Handler | Get agent detail | GET /agents/114032ba-8676-49a4-80a2-611fca3f8c5f | OK | 3ms |
| 33 | 17:48:54.151 | Sim72-Handler | Update agent | PUT /agents/114032ba-8676-49a4-80a2-611fca3f8c5f | OK | 12ms |
| 34 | 17:48:54.154 | Sim72-Handler | Handler dashboard | GET /handler/dashboard | OK | 3ms |
| 35 | 17:48:54.156 | Sim72-Handler | Handler agents list | GET /handler/agents | OK | 2ms |
| 36 | 17:48:54.159 | Sim72-Handler | Get notifications | GET /handler/notifications | OK | 3ms |
| 37 | 17:48:54.161 | Sim72-Handler | Mark notifications read (empty) | PUT /handler/notifications/read | OK | 2ms |
| 38 | 17:48:54.162 | Sim72-Handler | Agent job history | GET /agents/114032ba-8676-49a4-80a2-611fca3f8c5f/jobs | OK | 1ms |
| 39 | 17:48:54.163 | Sim72-Handler | Agent earnings | GET /agents/114032ba-8676-49a4-80a2-611fca3f8c5f/earnings | OK | 1ms |
| 40 | 17:48:54.164 | Sim72-NoAuth | Post job without auth (expect 401) | POST /jobs | EXP_FAIL | 1ms |
| 41 | 17:48:54.165 | Sim72-Client | Get nonexistent job (expect 404) | GET /jobs/nonexistent-id-12345 | EXP_FAIL | 1ms |
| 42 | 17:48:54.165 | Sim72-NoAuth | Health check | GET /health | OK | 0ms |

---

## Event Details

### Event 13: Duplicate bid (expect 409)
- **Note**: Expected failure: Bid already placed for this agent on this job

### Event 15: Self-deal bid (expect 403)
- **Note**: Expected failure: Cannot bid on your own job

### Event 20: Duplicate rating (expect 409)
- **Note**: Expected failure: You have already rated this job

### Event 28: Arbiter vote (expect 403 - role guard)
- **Note**: Expected failure: Insufficient permissions

### Event 40: Post job without auth (expect 401)
- **Note**: Expected failure: Missing authorization header

### Event 41: Get nonexistent job (expect 404)
- **Note**: Expected failure: Job not found

