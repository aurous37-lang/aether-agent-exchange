# Endpoint Verification Matrix

**Date**: 2026-03-24
**Scope**: All backend POST/PUT/DELETE endpoints

## Legend

- AUTH: requireAuth middleware present
- CONSENT: requireConsent middleware present (checks UserConsent for current policy version, returns 451 if missing)
- AUDIT: auditLog() call present
- VALIDATE: Zod schema validation present

## Money-Touching / State-Changing Endpoints

| # | Endpoint | Method | AUTH | CONSENT | AUDIT | VALIDATE | Status |
|---|----------|--------|------|---------|-------|----------|--------|
| 1 | /api/jobs | POST | Y | Y | JOB_CREATED | createJobSchema | PASS |
| 2 | /api/jobs/:id | PUT | Y | Y | - | updateJobSchema | PASS (no audit — low risk, OPEN jobs only) |
| 3 | /api/jobs/:id | DELETE | Y | Y | JOB_CANCELLED | - | PASS |
| 4 | /api/jobs/:id/accept | POST | Y | Y | BID_ACCEPTED | - | PASS |
| 5 | /api/jobs/:id/bid | POST | Y | Y | BID_PLACED | bidSchema | PASS |
| 6 | /api/jobs/:id/submit | POST | Y | Y | DELIVERABLE_SUBMITTED | submitDeliverableSchema | PASS |
| 7 | /api/jobs/:id/approve | POST | Y | Y | JOB_APPROVED | - | PASS |
| 8 | /api/jobs/:id/dispute | POST | Y | Y | DISPUTE_OPENED | disputeSchema | PASS |
| 9 | /api/jobs/:id/rate | POST | Y | Y | AGENT_RATED | ratingSchema | PASS |
| 10 | /api/agents | POST | Y | Y | AGENT_REGISTERED | registerAgentSchema | PASS |
| 11 | /api/agents/:id | PUT | Y | Y | - | - | PASS (no audit — metadata only) |
| 12 | /api/disputes/:id/evidence | POST | Y | Y | EVIDENCE_SUBMITTED | disputeEvidenceSchema | PASS |
| 13 | /api/disputes/:id/vote | POST | Y | Y + requireRole | ARBITER_VOTED, DISPUTE_RESOLVED | arbiterVoteSchema | PASS |

## Non-Money-Touching Endpoints (Consent Not Required)

| # | Endpoint | Method | AUTH | CONSENT | Justification |
|---|----------|--------|------|---------|---------------|
| 14 | /api/auth/nonce | POST | N | N | Pre-auth — generates nonce |
| 15 | /api/auth/verify | POST | N | N | Pre-auth — authenticates wallet |
| 16 | /api/auth/accept-terms | POST | Y | N | IS the consent endpoint |
| 17 | /api/handler/notifications/read | PUT | Y | N | UI state only — marks notifications read |
| 18 | /api/agents/:id/api-keys | POST | Y | N | Key management — no funds |
| 19 | /api/agents/:id/api-keys/:keyId | DELETE | Y | N | Key management — no funds |
| 20 | /api/reports/jobs/:id/report | POST | Y | N | Reporting should work for all authed users |

## Agent API Endpoints (Separate Auth Path)

| # | Endpoint | Method | AUTH | CONSENT | AUDIT | Gap? |
|---|----------|--------|------|---------|-------|------|
| 21 | /api/agent-api/jobs/:id/accept | POST | API key | N | Action log | GAP: No per-user consent check. Handler accepted at registration time. |
| 22 | /api/agent-api/jobs/:id/submit | POST | API key | N | Action log | GAP: Same as above. |

## Gaps Found and Fixed This Pass

| Gap | Severity | Fix Applied |
|-----|----------|-------------|
| PUT /jobs/:id missing consent | HIGH | Added requireConsent |
| DELETE /jobs/:id missing consent | HIGH | Added requireConsent |
| POST /jobs/:id/rate missing consent | MEDIUM | Added requireConsent |
| PUT /agents/:id missing consent | MEDIUM | Added requireConsent |
| POST /disputes/:id/evidence missing consent | HIGH | Added requireConsent |
| POST /disputes/:id/vote missing consent | HIGH | Added requireConsent |
| DELETE /jobs/:id missing audit | MEDIUM | Added JOB_CANCELLED |
| POST /jobs/:id/submit missing audit | HIGH | Added DELIVERABLE_SUBMITTED |
| POST /jobs/:id/rate missing audit | MEDIUM | Added AGENT_RATED |
| POST /disputes/:id/evidence missing audit | MEDIUM | Added EVIDENCE_SUBMITTED |
| POST /disputes/:id/vote missing audit | HIGH | Added ARBITER_VOTED + DISPUTE_RESOLVED |
| POST /agents missing audit | MEDIUM | Added AGENT_REGISTERED |
| consent.ts fail-open in dev | CRITICAL | Changed to fail-closed in ALL environments |

## Remaining Gaps (Documented, Not Blocking)

1. **Agent API consent**: Agent API endpoints use API key auth, not wallet auth. The handler accepted terms at agent registration. Per-action consent is not checked for autonomous agent operations. This is an architectural decision — agents operate on delegated authority.
2. **PUT /jobs/:id no audit**: Job update (title/description changes on OPEN jobs) is not audited. Low risk — only the job owner can modify, and only while OPEN.
3. **PUT /agents/:id no audit**: Agent metadata update is not audited. Low risk.
