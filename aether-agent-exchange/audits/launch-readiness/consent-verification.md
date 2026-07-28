# Consent State Hardening Verification

**Date**: 2026-03-24

## Consent Architecture

- **Model**: `UserConsent` — per-user, per-type, per-version records
- **Types**: terms, privacy, risk, disclosure (4 independent consent types)
- **Middleware**: `requireConsent` checks for 'terms' consent at current POLICY_VERSION
- **Storage**: Prisma/SQLite (dev), PostgreSQL (prod)
- **Unique constraint**: `@@unique([userId, consentType, policyVersion])` — prevents duplicate records

## Verification Results

### 1. Consent is versioned
**STATUS: PASS**
- `POLICY_VERSION` read from `process.env.POLICY_VERSION || '2026-03-23'`
- `UserConsent.policyVersion` field stores the version at acceptance time
- `requireConsent` middleware queries for exact version match

### 2. Consent is stored per user/wallet context
**STATUS: PASS**
- `UserConsent.userId` links to the authenticated user
- `requireConsent` uses `req.auth.userId` from JWT (derived from wallet signature)
- Cannot accept terms for another user — JWT is wallet-bound

### 3. Stale policy versions block protected actions
**STATUS: PASS**
- If `POLICY_VERSION` env var changes from `2026-03-23` to `2026-04-01`, all existing consent records become stale
- `requireConsent` queries for `policyVersion: POLICY_VERSION` (current) — old records won't match
- Returns HTTP 451 with `code: 'CONSENT_REQUIRED'` and `currentVersion` field

### 4. Action-specific acknowledgments are distinct from general terms
**STATUS: PARTIAL**
- Backend enforces `terms` consent type only via `requireConsent` middleware
- Frontend `ConsentGate` requires all 4 types (terms, privacy, risk, disclosure) before allowing action
- Per-action acknowledgments (e.g., "I understand this release is final") exist as frontend-only disclosure components
- **Gap**: No backend-enforced per-action acknowledgment records. The backend checks "has user accepted terms for this version?" but not "did user see the finality warning for this specific approve action?"
- **Mitigation**: All money-touching endpoints are consent-gated at the backend. Frontend disclosures are additional safety, not the only layer.

### 5. Backend middleware does not rely on frontend flags
**STATUS: PASS**
- `requireConsent` queries `UserConsent` table directly via Prisma
- No reference to `localStorage`, cookies, or frontend state
- Completely independent of `ConsentGate` component

### 6. Failure case: consent.ts error handling
**STATUS: PASS (fixed this pass)**
- **Before**: Catch block called `next()` in development (fail-open)
- **After**: Catch block returns 500 in ALL environments (fail-closed)
- A database error during consent check now blocks the action, not silently allows it

## Failure Case Test Scenarios

| # | Scenario | Expected | Verified |
|---|----------|----------|----------|
| 1 | User never accepted terms | 451 CONSENT_REQUIRED | By code inspection: `findUnique` returns null → 451 |
| 2 | User accepted old version, POLICY_VERSION bumped | 451 CONSENT_REQUIRED | Query includes `policyVersion: POLICY_VERSION` — old record won't match |
| 3 | User accepted terms but not risk/disclosure | Backend allows (checks 'terms' only); frontend ConsentGate blocks | Partial — backend should enforce all 4 types for full compliance |
| 4 | Direct API call via curl (no frontend) | 451 if no consent, 401 if no auth | Backend enforces independently |
| 5 | Partially-complete consent state | Frontend shows missing types; backend checks 'terms' only | Partial |
| 6 | Malformed wallet/user linkage | JWT validation fails → 401 | requireAuth catches this before requireConsent |
| 7 | Replay with prior consent state | Prior version records don't match current POLICY_VERSION | By design — version is part of the unique key |

## Recommendations

1. **Upgrade requireConsent to check all 4 types** — currently only checks 'terms'. Should verify all of: terms, privacy, risk, disclosure. This is a straightforward change but would break existing users who only accepted 'terms'.
2. **Add per-action acknowledgment records** — for the most critical actions (approve/release, fund escrow), consider requiring a backend-verified acknowledgment record.
