# Shadow Log: Simulation 67

**Started**: 2026-03-22T17:48:48.623Z
**Ended**: 2026-03-22T17:48:48.994Z
**Total Events**: 3
**OK**: 2 | **FAIL**: 1 | **EXPECTED_FAIL**: 0

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:48:48.623 | Sim67-Client | Request nonce | POST /auth/nonce | FAIL | 2ms |
| 2 | 17:48:48.976 | Sim67-Handler | Request nonce | POST /auth/nonce | OK | 3ms |
| 3 | 17:48:48.994 | Sim67-Handler | Verify signature | POST /auth/verify | OK | 18ms |

---

## Event Details

### Event 1: Request nonce
- **Error**: Too many requests, please try again later.

