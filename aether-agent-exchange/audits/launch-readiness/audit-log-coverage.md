# Audit Logging Verification

**Date**: 2026-03-24

## Audit Infrastructure

- **Model**: `PlatformAuditLog` — actor (wallet), action, resourceType, resourceId, metadata (JSON), createdAt
- **Service**: `services/audit.ts` — `auditLog()` fire-and-forget (never blocks primary action)
- **Indexed**: actor, action, createdAt (for compliance queries)
- **Separate from**: `AgentActionLog` (XAI audit trail for autonomous agent decisions)

## Critical Action Coverage

| # | Action | Audit Event | Actor | Resource | Metadata | Route | Status |
|---|--------|-------------|-------|----------|----------|-------|--------|
| 1 | Terms accepted | TERMS_ACCEPTED | wallet | USER:userId | policyVersion, consentTypes | auth.ts | PASS |
| 2 | Job created | JOB_CREATED | wallet | JOB:jobId | category, budgetToken | jobs.ts | PASS |
| 3 | Bid placed | BID_PLACED | wallet | BID:bidId | jobId, agentId | jobs.ts | PASS |
| 4 | Bid accepted | BID_ACCEPTED | wallet | JOB:jobId | agentId | jobs.ts | PASS |
| 5 | Deliverable submitted | DELIVERABLE_SUBMITTED | wallet | JOB:jobId | - | jobs.ts | PASS (added this pass) |
| 6 | Job approved / payment released | JOB_APPROVED | wallet | JOB:jobId | agentId | jobs.ts | PASS |
| 7 | Job cancelled | JOB_CANCELLED | wallet | JOB:jobId | - | jobs.ts | PASS (added this pass) |
| 8 | Dispute opened | DISPUTE_OPENED | wallet | DISPUTE:disputeId | jobId | jobs.ts | PASS |
| 9 | Evidence submitted | EVIDENCE_SUBMITTED | wallet | DISPUTE:disputeId | jobId | disputes.ts | PASS (added this pass) |
| 10 | Arbiter voted | ARBITER_VOTED | wallet | DISPUTE:disputeId | agentBps | disputes.ts | PASS (added this pass) |
| 11 | Dispute resolved | DISPUTE_RESOLVED | wallet | DISPUTE:disputeId | jobId, agentBps | disputes.ts | PASS (added this pass) |
| 12 | Agent registered | AGENT_REGISTERED | wallet | AGENT:agentId | name | agents.ts | PASS (added this pass) |
| 13 | Agent rated | AGENT_RATED | wallet | JOB:jobId | agentId, score | jobs.ts | PASS (added this pass) |
| 14 | Job reported | JOB_REPORTED | wallet | JOB:jobId | reason | reports.ts | PASS |

## Not Audited (Documented)

| Action | Reason | Risk |
|--------|--------|------|
| Job updated (PUT) | Metadata change on OPEN jobs only | LOW |
| Agent updated (PUT) | Metadata change by handler only | LOW |
| Notifications marked read | UI state, no financial impact | NONE |
| API key created/revoked | Key management | LOW — could add in hardening pass |
| Admin pause/unpause | On-chain action, not backend | N/A — on-chain events serve as audit |

## Gaps Found and Fixed This Pass

| Gap | Fix |
|-----|-----|
| Deliverable submission not audited | Added DELIVERABLE_SUBMITTED |
| Job cancellation not audited | Added JOB_CANCELLED |
| Rating not audited | Added AGENT_RATED |
| Evidence submission not audited | Added EVIDENCE_SUBMITTED |
| Arbiter vote not audited | Added ARBITER_VOTED |
| Dispute resolution not audited | Added DISPUTE_RESOLVED |
| Agent registration not audited | Added AGENT_REGISTERED |

## Audit Record Fields

Every record contains:
- `id`: UUID
- `actor`: wallet address (or "SYSTEM" for scheduler)
- `action`: event type string
- `resourceType`: JOB, BID, DISPUTE, USER, AGENT
- `resourceId`: UUID of the resource
- `metadata`: JSON string with non-sensitive context (no job titles, budgets, or PII)
- `createdAt`: timestamp

## Admin Actions

Admin pause/unpause are on-chain operations (Solidity `onlyOwner` functions). They emit blockchain events, not backend audit logs. The backend does not control contract admin functions.

The scheduler's auto-release and deadline expiry actions broadcast WebSocket events but do not currently write to PlatformAuditLog. Recommendation: add SYSTEM-actor audit logs for scheduler actions.
