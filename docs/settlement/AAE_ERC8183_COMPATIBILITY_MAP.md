# AAE ERC-8183 Compatibility Map

Timestamp: 2026-06-22 MDT
Mode: read-only/test mode; compatibility assessment only.
Primary source: ERC-8183 draft at `https://eips.ethereum.org/EIPS/eip-8183` plus local AAE contracts/backend/frontend inspection.

## ERC-8183 core model

ERC-8183 defines a minimal agentic commerce job escrow:

- Roles: `client`, `provider`, `evaluator`
- State machine: `Open -> Funded -> Submitted -> Completed | Rejected | Expired`
- Client creates job and funds escrow.
- Provider submits deliverable.
- Evaluator alone completes or rejects after submission.
- Evaluator may reject while funded before submission.
- Client may reject only while open.
- After expiry, client can claim refund.
- Optional hook supports extensions such as bidding/reputation without forcing them into the core escrow.
- Required data includes client, provider, evaluator, description, budget, expiry, status, optional hook.

## AAE current contract model

Local files inspected:

- `contracts/src/AgentRegistry.sol`
- `contracts/src/EscrowFactory.sol`
- `contracts/src/JobEscrow.sol`
- `contracts/src/FeeCollector.sol`
- `contracts/test/AetherExchange.t.sol`
- `contracts/script/Deploy.s.sol`
- `contracts/script/TestnetSmoke.s.sol`

AAE current state machine in `JobEscrow.sol`:

```text
UNFUNDED -> FUNDED -> IN_PROGRESS -> PENDING_REVIEW -> COMPLETED
                 |          |              |
                 |          -> DISPUTED -> RESOLVED
                 -> CANCELLED
```

AAE current roles/concepts:

- `client`: escrow creator/funder/approver/canceller
- `agentWallet` / `agentId`: selected worker after `startWork(agentId)`
- `handler`: may act for an agent
- `arbiters`: one or more dispute arbiters; vote split basis points in disputes
- `feeCollector`: receives platform fee on payout
- `agentRegistry`: registers agents and records reputation
- `factory`: clones per-job escrow and authorizes each clone as reputation updater

## Role mapping

| ERC-8183 | Current AAE equivalent | Fit | Gap / action |
|---|---|---:|---|
| `client` | `JobEscrow.client`, `Job.client` | Strong | Keep. Need explicit ERC-8183 event/interface naming in adapter/kernel. |
| `provider` | `agentWallet`/`agentId`; provider selected via `startWork(agentId)` after funding | Partial | ERC-8183 supports provider at create or later via `setProvider` before funding. AAE assigns after funding and after marketplace bid acceptance. Add provider-later compatibility path or adapter that maps selected bid to provider before fund. |
| `evaluator` | client approves in happy path; arbiters resolve disputes | Weak | ERC-8183 requires a single evaluator who alone completes/rejects after submission. Add evaluator role. Option: evaluator = client for simple jobs; arbiter panel remains AAE extension/hook. |
| `hook` | AAE marketplace, bids, reputation, notifications, policy engine | Strong as off-chain/app layer | Add optional on-chain hook or record hook metadata. Do not force all AAE policy into core escrow. |
| `description` | backend `Job.description`, `deliverables`, `acceptanceCriteria`; contract only has `jobId` | Partial | ERC-8183 expects description in job data. Use content hash/URI or description hash to avoid on-chain bloat. |
| `budget` | `escrowAmount`, `budgetAmount`, `budgetToken` | Strong | Add expected-budget checks and canonical ERC-8183 `setBudget/fund` semantics if implementing interface. |
| `expiredAt` | `deadline` and `reviewDeadline`; no universal escrow expiry | Weak | Add explicit `expiredAt` and `claimRefund` for Funded/Submitted stuck jobs. Review deadline currently auto-releases to provider, not refund. |

## Function/transition map

| ERC-8183 function/transition | Current AAE function/path | Compatibility | Required fix |
|---|---|---:|---|
| `createJob(provider,evaluator,expiredAt,description,hook)` | `EscrowFactory.createEscrow(jobId, client, token, amount, reviewPeriod)` | Partial | Add ERC-8183 create path with provider/evaluator/expiry/description/hook fields, or build adapter contract wrapping current clone factory. |
| `setProvider(jobId, provider)` | Backend bid acceptance; contract `startWork(agentId)` after `FUNDED` | Not compatible | Add provider selection before funding or adapter state that locks accepted provider before fund. |
| `setBudget(jobId, amount)` | amount fixed at escrow initialization | Partial | Current fixed amount is acceptable for simple jobs, but not ERC-8183 negotiation semantics. Implement optional budget setting in new kernel. |
| `fund(jobId, expectedBudget)` | `JobEscrow.fund()` pulls `escrowAmount` from client | Partial | Add expected-budget arg/protection and ensure provider is set before fund if following ERC-8183. |
| `submit(jobId, deliverable)` | `submitDeliverable(bytes32 deliverableHash)` | Strong | Add canonical name/event and ability to submit structured deliverable/reason hash. |
| evaluator `complete(jobId, reason)` | client `approve()` | Weak | Add single evaluator role and reason/attestation hash. Backend must not mark completed without tx receipt. |
| evaluator `reject(jobId, reason)` while Funded/Submitted | `dispute()` + `resolve()` panel; client `cancel()` only when FUNDED | Weak | Add evaluator rejection/refund path separate from disputes. Keep panel as product extension for contested jobs. |
| client `reject()` while Open | `cancel()` while FUNDED; no Open state with unfunded job semantics | Partial | Add Open state to ERC-8183 kernel; current `UNFUNDED` is not exposed as client reject path except pre-fund no money. |
| `claimRefund(jobId)` after expiry | none; `autoRelease()` pays provider after review deadline | Missing | Add `expiredAt` and refund semantics for Funded/Submitted stale jobs. Do not reuse review auto-release as refund. |

## Event/data compatibility

Current `JobEscrow` events:

- `EscrowFunded`
- `WorkStarted`
- `DeliverableSubmitted`
- `JobApproved`
- `JobAutoReleased`
- `DisputeOpened`
- `DisputeResolved`
- `ArbiterVoteCast`
- `ArbiterAdded`
- `JobCancelled`

Needed ERC-8183-compatible event surface:

- job created with provider/evaluator/expiry/description/hook metadata
- budget set/updated
- funded with expected budget/token
- provider set
- submitted with deliverable hash/URI
- completed with evaluator and reason/attestation
- rejected with evaluator/client and reason
- expired/refund claimed

## Backend/data model map

Local files inspected:

- `backend/prisma/schema.prisma`
- `backend/src/routes/jobs.ts`
- `backend/src/routes/agents.ts`
- `backend/src/routes/auth.ts`
- `backend/src/services/audit.ts`
- `backend/test-env/run-all.ts`

Current backend models relevant to ERC-8183:

- `User`: clients/handlers/arbiters
- `Agent`: provider profile and wallet identity
- `Job`: job metadata, budget, status, `escrowAddress`
- `Bid`: provider proposals
- `Submission`: deliverable hash and notes
- `Dispute`, `DisputeEvidence`, `ArbiterVote`: dispute panel extension
- `PlatformAuditLog`, `AgentActionLog`: audit trails

Missing backend concepts for ERC-8183 readiness:

1. `PaymentLedger` / settlement receipt table.
2. `Job.settlementRail`: `legacy-aae | erc8183 | x402 | px402`.
3. `Job.network` / `chainId` / `tokenAddress` / `escrowContractVersion`.
4. `Job.evaluatorWallet` and evaluator policy source.
5. `Job.expiredAt` distinct from `deadline` and `reviewPeriod`.
6. Settlement evidence fields: `txHash`, `receiptHash`, `settlementStatus`, `completedByEvaluatorAt`.
7. Redaction rules: no raw payment headers, notes, private keys, seeds, signer material, raw `.env`.

Important current gap:

- `backend/src/routes/jobs.ts` `POST /:id/approve` updates `status: COMPLETED` and writes `JOB_APPROVED` audit log without requiring an on-chain settlement receipt. This must be fixed before wallet-funded testnet jobs.

## Frontend map

Local files inspected:

- `frontend/src/lib/wagmi.ts`
- `frontend/src/lib/contracts.ts`

Current frontend:

- Hardcodes `monadTestnet` chain id `10143`, MON native currency, Monad RPC/explorer.
- `createConfig` includes only Monad testnet.
- Contract ABI includes existing `EscrowFactory.createEscrow`, `JobEscrow.fund`, `approve`, state/details views, ERC20 approve/balance/allowance.

Needed frontend changes:

- Add Base Sepolia chain config and environment-driven active chain.
- Display selected settlement rail and network.
- Display escrow state separately from app job state.
- Add evaluator/expiry/refund state labels for ERC-8183 jobs.
- Never display or store PRXVT notes or raw payment headers.

## Recommendation

Do not force ERC-8183 into the current audited `JobEscrow` in-place on the first Base Sepolia branch. Safer path:

1. Keep existing contracts passing as `legacy-aae` settlement.
2. Add a new `ERC8183JobEscrow` or `ERC8183Adapter` with explicit ERC-8183 roles/states/events.
3. Add Foundry compatibility tests that assert ERC-8183 transitions and failure cases.
4. Use AAE marketplace/bidding/reputation/dispute panel as app-layer and optional hook extensions.
5. Require backend receipt evidence before `COMPLETED` for ERC-8183-settled jobs.

## Minimum ERC-8183 tests before Base Sepolia wallet assignment

- Create job with provider/evaluator/expiry/description.
- Create provider-later job, set provider, then fund.
- Reject open job by client.
- Fund with expected budget mismatch reverts.
- Provider submits only after funded.
- Non-provider submit reverts.
- Evaluator completes submitted job and provider receives funds.
- Non-evaluator complete/reject reverts.
- Evaluator rejects submitted job and client refund is available/sent.
- Expired funded/submitted job can be refunded to client.
- Hook path does not bypass escrow invariants.
- Platform fee accounting matches expected basis points.
