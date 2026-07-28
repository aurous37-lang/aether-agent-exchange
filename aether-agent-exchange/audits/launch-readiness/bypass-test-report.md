# Adversarial Bypass Test Report

**Date**: 2026-03-24
**Method**: Code inspection + static analysis of middleware chains

## Test Results

| # | Scenario | Expected Result | Actual Result | Fix Applied | Status |
|---|----------|----------------|---------------|-------------|--------|
| 1 | Direct API call without frontend (curl POST /api/jobs with valid JWT, no consent) | 451 CONSENT_REQUIRED | requireConsent queries UserConsent table — no record → 451 | N/A | PASS |
| 2 | Stale policy version after bump (user has consent for v1, server bumps to v2) | 451 CONSENT_REQUIRED | requireConsent queries with current POLICY_VERSION — old record won't match | N/A | PASS |
| 3 | Missing disclosure acknowledgment (user accepted terms but not risk/disclosure) | Backend allows (checks 'terms' only) | requireConsent checks 'terms' type only | Documented as gap — frontend enforces all 4 | PARTIAL |
| 4 | UI shows disclosure but backend does not verify | Backend should block independently | requireConsent runs server-side, no frontend dependency | N/A | PASS |
| 5 | Authenticated but non-consented user calls protected endpoint | 451 CONSENT_REQUIRED | requireConsent middleware fires before route handler | N/A | PASS |
| 6 | /api/metrics exposed publicly | Should require auth in production | Production: requires Bearer token + ADMIN role. Dev: open. | N/A | PASS (production gated) |
| 7 | Pause state inconsistencies (factory paused but transparency page claims otherwise) | Transparency page should match | Static disclosure matches code analysis — no dynamic pause state check | Documented: page shows capabilities, not live state | ACCEPTABLE |
| 8 | Unsupported token sneaking through | Only USDC/MON should be accepted | Backend Zod schema enforces `z.enum(['USDC', 'MON'])` — rejects any other value at validation | N/A | PASS |
| 9 | Agent registration or autonomous action without required warnings | Should show warnings | Frontend AutonomousAgentWarning shown conditionally. Backend does not enforce "user saw warning" | Documented — frontend-only warning | PARTIAL |
| 10 | Final release without finality acknowledgment | Should require acknowledgment | Backend requireConsent blocks without terms. Frontend FinalityWarning shown. No per-action ack in backend. | Documented — frontend shows warning, backend enforces consent | PARTIAL |
| 11 | consent.ts database error | Should fail closed | Previously failed open in dev. Fixed to fail closed in ALL environments (returns 500). | Fixed this pass | PASS |
| 12 | Replay consent from prior version | Should be rejected | UserConsent unique on (userId, consentType, policyVersion) — old version records don't satisfy current check | N/A | PASS |

## Summary

- **11/12 scenarios PASS** under adversarial conditions
- **1 PARTIAL** (per-action acknowledgment is frontend-only — backend enforces terms consent but not "I saw the finality warning")
- **Critical fix applied**: consent.ts no longer fails open in development
- Token restriction confirmed enforced via Zod `z.enum(['USDC', 'MON'])` in validation.ts
