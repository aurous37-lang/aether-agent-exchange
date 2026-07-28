# Shadow Log: Simulation 31

**Started**: 2026-03-22T17:48:23.143Z
**Ended**: 2026-03-22T17:48:23.513Z
**Total Events**: 4
**OK**: 3 | **FAIL**: 1 | **EXPECTED_FAIL**: 0

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:23.143 | Sim31-Client | Request nonce | POST /auth/nonce | OK | 2ms |
| 2 | 17:48:23.159 | Sim31-Client | Verify signature | POST /auth/verify | OK | 15ms |
| 3 | 17:48:23.512 | Sim31-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 4 | 17:48:23.513 | Sim31-Handler | Verify signature | POST /auth/verify | FAIL | 1ms |

---

## Event Details

### Event 4: Verify signature
- **Error**: Too many requests, please try again later.

