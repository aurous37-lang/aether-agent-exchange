# Shadow Log: Simulation 100

**Started**: 2026-03-22T17:49:24.557Z
**Ended**: 2026-03-22T17:49:24.909Z
**Total Events**: 2
**OK**: 0 | **FAIL**: 2 | **EXPECTED_FAIL**: 0

---

| # | Time | Actor | Action | Endpoint | Status | Duration |
|---|------|-------|--------|----------|--------|----------|
| 1 | 17:49:24.557 | Sim100-Client | Request nonce | POST /auth/nonce | FAIL | 1ms |
| 2 | 17:49:24.909 | Sim100-Handler | Request nonce | POST /auth/nonce | FAIL | 2ms |

---

## Event Details

### Event 1: Request nonce
- **Error**: Too many requests, please try again later.

### Event 2: Request nonce
- **Error**: Too many requests, please try again later.

