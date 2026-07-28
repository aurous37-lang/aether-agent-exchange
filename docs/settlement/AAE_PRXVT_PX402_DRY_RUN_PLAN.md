# AAE PRXVT / px402 Dry-Run Plan

Timestamp: 2026-06-22 MDT
Mode: PRXVT/px402 dry-run design only. No PRXVT deposits, no note generation with funds, no signing, no live PRXVT payment, no payment profile creation.

Current launch note: plain x402 is now a mainnet-ready launch rail under `docs/settlement/mainnet-x402-launch-readiness.md`. This document remains the PRXVT/px402 dry-run and privacy-probe plan. PRXVT deposits, notes, note material, and private payment execution remain separately scoped even when explicit `x402` or `px402` `PaymentLedger` rails are present.
Sources: PRXVT SDK public repository/documentation and Coinbase x402 public documentation.

## Goal

Add a safe AAE dry-run layer for paid agent-service probes so AAE can discover and display x402/px402 payment requirements without spending, signing, or exposing secrets.

Privacy posture:

- PRXVT/px402 is optional, not mandatory.
- Users can choose standard transparent escrow, plain x402, px402 preferred, or px402 required for paid probes.
- On-chain transaction transparency remains intact for escrow, fees, receipts, and settlement events.
- Proprietary agent configuration, prompt structure, tool routing, model mix, API call traces, and private runtime details are not required public disclosures.
- Public marketplace profiles should expose enough information for client selection, reputation, dispute handling, and compliance, without forcing handlers to publish the configuration that forms their business model.

Preferred rail order:

1. ERC-8183 escrow for larger jobs and final settlement.
2. PRXVT/px402 for private low-cost probes/previews/API-like calls.
3. Plain x402 fallback only when PRXVT is incompatible or explicitly selected.
4. No paid probe when the handler disables probe payments or the endpoint policy fails.

## Public PRXVT SDK facts observed

Package/repo:

- GitHub: `https://github.com/PRXVT/sdk`
- Package: `@prxvt/sdk`
- Project name: px402
- License: MIT
- Public description: privacy SDK for x402 payments using zero-knowledge proofs.

Main class/API:

- `PrivacySDK`
- constructor config includes:
  - `chain`: `'base' | 'polygon'`, default `'base'`
  - `bundlerUrl`
  - `bundlerApiKey`
  - `rpcUrl`

Methods/utilities listed publicly:

- `deposit(amount, privateKey)`
- `depositFast(amount, privateKey)`
- `makePayment(note, recipient, amount)`
- `wrapFetch(fetch)`
- `setNote(note)`
- `getUpdatedNote()`
- `encryptNote(note, password)` using AES-256-GCM
- `decryptNote(encrypted, password)`
- `isEncryptedNote(str)`
- `getNoteBalance(note)`
- `hasEnoughBalance(note, amount)`
- `formatUSDCAmount(microUsdc)`
- `parseUSDCAmount(usdc)`
- `isCrossChain(depositChain, paymentChain)`
- `getChainEid(chain)`

Safety interpretation:

- `deposit`, `depositFast`, `makePayment`, `wrapFetch` with a loaded note are live/payment-capable and must remain disabled in first AAE branch.
- Notes are bearer-like secrets. Treat them like wallet material: never print, commit, log, put in browser localStorage, store raw in DB, or show to subagents.

## Dry-run adapter shape

Create an adapter that can be unit-tested without network spending:

```ts
export type PaymentRail = 'x402' | 'px402';

export interface X402RequirementSummary {
  endpoint: string;
  method: string;
  status: 402 | number;
  scheme?: string;
  network?: string;
  chainId?: number;
  currency?: string;
  amount?: string;
  amountAtomic?: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
  rawHeaderPresent: boolean;
  redaction: 'raw-payment-header-omitted';
}

export interface Px402Policy {
  mode: 'dry-run';
  allowedNetworks: string[];
  maxProbeUsd: string;
  allowPlainX402Fallback: boolean;
  endpointAllowlist: string[];
}

export async function discoverX402Requirements(input: {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<X402RequirementSummary>;

export function canUsePx402(requirements: X402RequirementSummary, policy: Px402Policy): {
  ok: boolean;
  reasons: string[];
};

export function buildPx402DryRunPlan(requirements: X402RequirementSummary, policy: Px402Policy): {
  rail: 'px402' | 'x402' | 'unsupported';
  executeDisabled: true;
  requiredApprovals: string[];
  redactedReceipt: Record<string, string | number | boolean | null>;
};
```

## Discovery behavior

Allowed in dry-run:

- Send unauthenticated request to a candidate endpoint to receive HTTP `402 Payment Required` metadata.
- Parse public/non-secret `Payment-Required` / x402 challenge metadata.
- Normalize endpoint, amount, token, chain/network, pay-to address, facilitator/scheme names, and expiration if exposed.
- Store only redacted summaries.

Blocked in dry-run:

- No `Authorization` payment headers.
- No `PAYMENT-SIGNATURE` or equivalent payment header.
- No PRXVT note loading.
- No wallet private key input.
- No `deposit`, `depositFast`, `makePayment`, or payment-capable `wrapFetch` call.
- No paid retry after a 402 challenge.
- No raw payment header storage.

## AAE data model additions

### Agent profile metadata

Add nullable fields or related config table:

- `x402EndpointUrl`
- `px402Supported`
- `paymentPrivacyMode`: `standard | x402 | px402-preferred | px402-required`
- `configDisclosureMode`: `public | summary | private`
- `modelDisclosureMode`: `public | private`
- `apiCallDisclosureMode`: `summary | hashes | private`
- `publicConfigSummary`
- `probePriceUsd`
- `probeDescription`
- `probeMethod`
- `probeSchemaHash`

Disclosure boundaries:

- `public`: handler affirmatively exposes details in the profile.
- `summary`: handler exposes a buyer-facing summary while retaining private implementation details.
- `private`: AAE stores or uses only the minimum operational data needed for marketplace function and does not publish raw internals.
- `hashes`: AAE may expose stable hashes or receipt IDs proving that an action occurred without exposing the raw request/response payload.
- These settings are independent of settlement transparency; they do not hide public transaction data, escrow state, fees, dispute outcomes, or receipts that are safe to disclose.

### Job/bid metadata

- `selectedProbeRail`: `none | x402 | px402`
- `probeReceiptId`
- `paidPreviewUrl` or `previewArtifactHash`
- `probeStatus`: `not_requested | quoted | skipped | paid | failed`

### Payment ledger

Use a separate `PaymentLedger` table rather than overloading `Job`.

Minimum fields:

- `rail`: `erc8183 | x402 | px402`
- `mode`: `probe | escrow | milestone | settlement`
- `network`, `chainId`, `token`, `amount`
- `payerWallet`, `payeeWallet` when safe/public
- `endpoint`
- `status`
- `txHash` / `receiptHash` when applicable
- `redactedPaymentReference`
- `createdAt`, `updatedAt`

Never store:

- PRXVT notes
- raw x402 payment headers
- private keys
- seeds
- signer material
- raw `.env`
- browser wallet storage
- raw proprietary prompts, hidden routing logic, unredacted API call bodies, or full private agent configuration unless a handler explicitly stores them in a purpose-built encrypted vault outside the public marketplace profile

## Receipt format for dry-run probes

Dry-run receipt may include:

```json
{
  "timestamp": "ISO-8601",
  "mode": "dry-run",
  "endpoint": "https://example.invalid/resource",
  "method": "GET",
  "httpStatus": 402,
  "railCandidate": "px402",
  "network": "base",
  "chainId": 84532,
  "currency": "USDC",
  "amount": "0.01",
  "payToPresent": true,
  "rawPaymentHeaderStored": false,
  "executeDisabled": true,
  "nextAction": "operator/test-wallet approval required before live payment"
}
```

No full JSON receipts should be printed in chat; write them to disk when live wallet work eventually begins.

## Test plan

### Unit tests with fixtures

- Parse valid x402 402 challenge fixture.
- Reject malformed challenge.
- Reject unsupported network.
- Reject amount above cap.
- Reject non-allowlisted endpoint.
- Verify raw payment header is omitted from stored receipt.
- Verify execute mode cannot be enabled through request body alone.
- Verify no private key/note fields appear in logs or returned summary.

### Integration dry-run tests

- Call a local mock endpoint returning 402 challenge metadata.
- Confirm no second paid request is sent.
- Confirm no payment/signature headers are present.
- Confirm redacted summary is written to `PaymentLedger` or dry-run report table.

### Policy tests

- `px402-required` endpoint with unsupported requirements should fail closed.
- `px402-preferred` endpoint may fall back to plain x402 only if policy allows and operator later approves live mode.
- No recurring/uncapped paid calls.
- Standard escrow mode must continue to work when px402 is disabled.
- Public agent responses must redact model/config details when the handler selected private disclosure.
- Private disclosure settings must not suppress on-chain settlement receipts or dispute evidence required to resolve a job.

## Placement recommendation

Short term:

- Put dry-run discovery in backend or a shared package, not frontend-only.
- Frontend can display quote/rail metadata, but should not handle PRXVT notes for Herman unattended operation.

Medium term:

- For autonomous Herman/subagent paid probes, place live note/wallet handling outside AAE app DB in a Herman-controlled vault/runner, with AAE receiving only redacted receipts.

## Blockers before live px402 testing

1. JS tooling currently cannot run TypeScript builds because `tsc` executable shims are missing.
2. No dry-run adapter exists yet.
3. No PaymentLedger/receipt storage exists yet.
4. No endpoint allowlist/cap policy exists yet.
5. No testnet wallet/note policy has been assigned for AAE.
6. PRXVT support for Base Sepolia specifically must be verified; public SDK docs emphasize `base`/`polygon`, not necessarily every testnet path.
7. Concurrency behavior for note updates must be designed before multi-agent workers use the same note.

## Live-mode gate for later cycle

Only after explicit operator assignment of testnet wallets:

- verify PRXVT supports the intended Base Sepolia or test environment;
- create/fund test-only note under Herman/operator control, not Pi agents;
- set per-call and per-day caps;
- use endpoint allowlist;
- run exactly one capped test call;
- write receipt to disk;
- keep Pi/subagents away from notes, signers, deposits, and payment execution.
