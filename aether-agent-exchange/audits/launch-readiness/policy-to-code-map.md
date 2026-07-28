# Policy-to-Code Coverage Map

**Date**: 2026-03-24
**Policy Version**: 2026-03-23
**Source**: `on_chain_agent_marketplace_policy_2026-03-23.docx`

## Map

| # | Requirement | Policy Source | Required Behavior | Backend Endpoint(s) | Middleware | Frontend Route/Component | Audit Event(s) | Status |
|---|-------------|--------------|-------------------|---------------------|------------|--------------------------|-----------------|--------|
| 1 | Terms acceptance | Sec 1, 6, 13 | Users must accept current policy before transacting | POST /auth/accept-terms | requireAuth | ConsentGate | TERMS_ACCEPTED | PASS |
| 2 | Fee disclosure | Sec 4, 8, App B | 1.7% fee visible at every value-transfer boundary | GET /auth/platform-info | - | FeeDisclosure, BidFeeDisclosure, FinalityWarning, Transparency | - | PASS |
| 3 | Risk disclosure | Sec 7 | Blockchain/contract/token risks disclosed before commitment | - | - | RiskDisclosure page, FinalityWarning, EscrowFundingWarning | - | PASS |
| 4 | Platform-role disclosure | Sec 5 | Facilitator/conduit statement visible | GET /auth/platform-info | - | PlatformRoleNotice, Terms page, Transparency page | - | PASS |
| 5 | Autonomous agent warning | Sec 3 | Users warned when accepting autonomous agent work | - | - | AutonomousAgentWarning (conditional in JobDetail) | - | PASS |
| 6 | Finality warning | Sec 7, 11 | Irreversibility disclosed before approval/release | - | - | FinalityWarning (JobDetail approve) | - | PASS |
| 7 | Dispute disclosure | Sec 11 | Mechanisms are procedural, not guarantees | - | - | DisputeDisclosure (JobDetail dispute form) | - | PASS |
| 8 | Supported token restriction | Sec 4 | Only MON and USDC accepted | POST /jobs | validate(createJobSchema) — z.enum(['USDC','MON']) | PostJob token selector | - | PASS |
| 9 | Non-issuer statement | Sec 5 | Platform does not issue/guarantee stablecoins | GET /auth/platform-info | - | Terms page, Transparency page, PlatformRoleNotice | - | PASS |
| 10 | Admin powers disclosure | Sec 8, App B | All admin/pause capabilities publicly listed | GET /auth/platform-info | - | Transparency page (4 contracts, 13 functions) | - | PASS |
| 11 | Pause capability disclosure | Sec 8, App B | Users know contracts can be paused | - | - | Transparency page (Pausable badges per contract) | - | PASS |
| 12 | Audit logging | Sec 11, App B | Critical actions create tamper-evident records | All protected endpoints | - | - | 14 event types in PlatformAuditLog | PASS |
| 13 | Policy versioning | Sec 13 | Version tracked, stale consent detected | POST /auth/accept-terms, GET /auth/consent-status | requireConsent | ConsentGate | TERMS_ACCEPTED (includes version) | PASS |
| 14 | Prohibited uses | Sec 9 | Content moderation framework | POST /reports/jobs/:id/report | requireAuth, validate | - | JOB_REPORTED | PASS |
| 15 | No yield statement | Sec 5 | Platform does not pay interest/yield | - | - | Terms page | - | PASS |
| 16 | Handler accountability | Sec 3, 6 | Handler responsible for agent conduct | - | - | AutonomousAgentWarning, AgentDetail badge | - | PASS |
| 17 | Data/IP responsibility | Sec 10 | Users responsible for submitted content | - | - | Terms page, PostJob terms link | - | PASS |
| 18 | Tax responsibility | Sec 6 | Users responsible for own tax treatment | - | - | Terms page | - | PASS |
| 19 | Wallet security | Sec 6 | Users responsible for keys/signatures | - | - | Terms page, Privacy page | - | PASS |
| 20 | Output review | Sec 6, 10 | Users must review outputs before relying on them | - | - | Terms page | - | PASS |
| 21 | No dark patterns | Sec 3 | No deceptive UI design | - | - | Design review (no forced opt-ins, no hidden actions) | - | PASS |
| 22 | Consent backend enforcement | App B | Every money-touching endpoint independently verifies consent | All POST/PUT/DELETE on jobs, agents, disputes | requireConsent | - | - | PASS |
