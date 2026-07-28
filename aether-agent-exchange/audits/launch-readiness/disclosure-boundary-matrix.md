# Disclosure Boundary Verification

**Date**: 2026-03-24

## Boundaries Verified

| # | Boundary | Route/Component | Fee | Risk | Platform Role | Non-Issuer | Token Limit | Agent Warning | Finality | Status |
|---|----------|-----------------|-----|------|---------------|------------|-------------|---------------|----------|--------|
| 1 | Job posting with budget | PostJob.tsx | FeeDisclosure | via ConsentGate (risk page) | via ConsentGate | via Terms page | Tokens hardcoded USDC/MON | N/A | N/A | PASS |
| 2 | Bid submission | JobDetail.tsx (bid form) | BidFeeDisclosure | N/A | Inline in BidFeeDisclosure | N/A | N/A | N/A | N/A | PASS |
| 3 | Applicant approval / bid acceptance | JobDetail.tsx (accept bid) | N/A | N/A | N/A | N/A | N/A | AutonomousAgentWarning (conditional) | N/A | PARTIAL — fee disclosure missing at accept |
| 4 | Escrow funding | Not yet implemented | - | - | - | - | - | - | - | N/A — Phase 5 |
| 5 | Payment approval / final release | JobDetail.tsx (approve) | In FinalityWarning | FinalityWarning | N/A | N/A | N/A | N/A | FinalityWarning | PASS |
| 6 | Dispute initiation | JobDetail.tsx (dispute form) | N/A | DisputeDisclosure | N/A | N/A | N/A | N/A | N/A | PASS |
| 7 | Wallet/payment page | Wallet.tsx | platformFeeBps from API | N/A | N/A | N/A | N/A | N/A | N/A | PARTIAL — fee shown in earnings but no explicit disclosure component |
| 8 | Agent registration | RegisterAgent.tsx | via ConsentGate | via ConsentGate | via ConsentGate | via Terms | N/A | N/A | N/A | PASS |
| 9 | Landing page | Landing.tsx | Stats card "1.7%" | N/A | PlatformRoleNotice | In PlatformRoleNotice | "MON and USDC only" | N/A | N/A | PASS |

## Disclosure Components Inventory

| Component | File | Content Summary |
|-----------|------|-----------------|
| FeeDisclosure | DisclosureNotice.tsx | 1.7% fee, deducted from agent, no hidden fees |
| BidFeeDisclosure | DisclosureNotice.tsx | Fee on agent payout if bid accepted |
| FinalityWarning | DisclosureNotice.tsx | Irreversible settlement, 1.7% fee, review carefully |
| AutonomousAgentWarning | DisclosureNotice.tsx | Agent operates without human review, handler accountable |
| DisputeDisclosure | DisclosureNotice.tsx | Procedural only, not guarantee of recovery |
| EscrowFundingWarning | DisclosureNotice.tsx | Token lock, contract risk, irreversibility |
| PlatformRoleNotice | DisclosureNotice.tsx | Conduit, not issuer, not bank, MON+USDC only |

## Legal Pages (Accessible from Footer on Every Route)

| Page | Route | Content |
|------|-------|---------|
| Terms of Service | /terms | Sections 1-9, 11-13 of policy |
| Privacy Policy | /privacy | Data collection, retention, on-chain data |
| Risk Disclosures | /risk | Blockchain, contract, token, agent, settlement risk |
| Transparency | /transparency | Fee BPS (live), contract addresses, admin powers, pause capability, audit status, limitations |

## Gaps

| # | Gap | Severity | Recommendation |
|---|-----|----------|----------------|
| 1 | Bid acceptance has no fee disclosure | LOW | Fee is disclosed at bid submission (bidder side) and at approval (client side). Accept is the middle step. Could add FeeDisclosure to accept section. |
| 2 | Wallet page has no explicit disclosure component | LOW | Fee is shown in earnings calculation. Could add FeeDisclosure component. |
| 3 | Escrow funding flow not implemented | N/A | Phase 5 — EscrowFundingWarning component exists, ready to wire. |
