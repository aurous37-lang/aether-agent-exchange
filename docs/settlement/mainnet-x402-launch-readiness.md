# AAE Mainnet x402 Launch Readiness

Status: readiness implementation only. This document does not authorize Base mainnet writes, live x402 payments, production custody, public deployment, credential rotation, or real-fund movement.

## Scope

AAE supports a mainnet-ready x402 launch rail while keeping the default product path offchain. Explicit paid jobs may use `settlementRail: "x402"` or `settlementRail: "px402"` on Base Sepolia or Base only after policy, cap, network, approval, and receipt gates pass.

Robinhood Chain is intentionally out of scope for this x402/px402 readiness track. Robinhood Chain support starts with native ETH direct wallet escrow only; do not add Robinhood x402/px402 or stablecoin rails without separate provider/token verification, explicit gates, regression tests, and a new runbook.

The first provider adapter is Coinbase CDP x402 facilitator:

- Facilitator base URL: `https://api.cdp.coinbase.com/platform/v2/x402`
- Verify endpoint: `POST /v2/x402/verify`
- Settle endpoint: `POST /v2/x402/settle`
- Base CAIP-2 networks: `eip155:8453` for Base, `eip155:84532` for Base Sepolia

## Implementation Map

- Chain config: `backend/src/config/chains.ts`, `frontend/src/lib/chains.ts`, `contracts/foundry.toml`
- Job rail validation: `backend/src/utils/validation.ts`, `backend/src/routes/jobs.ts`
- Completion gate: `backend/src/services/settlement.ts`
- Base receipt verifier: `backend/src/services/settlementVerifier.ts`
- x402 provider adapter and ledger verifier: `backend/src/services/x402.ts`
- Seller requirement route: `GET /api/px402/x402/seller/resources/:resourceId`
- Seller protected resource route: `GET /api/px402/x402/seller/resources/:resourceId/access`
- Buyer approval intent route: `POST /api/px402/x402/buyer/intents`
- x402 ingestion route: `POST /api/px402/x402/settlement-receipts`
- Job detail evidence surface: `frontend/src/pages/JobDetail.tsx`

## Environment Matrix

Defaults stay non-mainnet and non-executing.

| Variable | Local default | Readiness use |
| --- | --- | --- |
| `AAE_ACTIVE_CHAIN` | `base-sepolia` | Set `base` only for explicit mainnet-readiness config checks. |
| `BASE_RPC_URL` / `VITE_BASE_RPC_URL` | public Base RPC example | Required for read-only Base mainnet RPC checks. |
| `AAE_ENABLE_BASE_SEPOLIA_RECEIPT_INDEXER` | `false` | Enable only for scoped Base Sepolia receipt-indexer tests. |
| `AAE_ENABLE_BASE_MAINNET_RECEIPT_INDEXER` | `false` | Enable only for separately approved Base mainnet receipt indexing. |
| `X402_PROVIDER` | `coinbase-cdp` | Adapter selection. |
| `X402_FACILITATOR_URL` | CDP x402 URL | CDP facilitator base URL. |
| `X402_ALLOWED_NETWORKS` | `eip155:84532` | Add `eip155:8453` only for approved mainnet readiness/exercise. |
| `X402_ENDPOINT_ALLOWLIST` | localhost origins | Buyer endpoint allowlist. |
| `X402_MAX_PAYMENT_USD` | `0` | Must be a positive cap before any settlement is accepted. |
| `X402_MAX_RETRY_COUNT` | `1` | Buyer retry cap. |
| `AAE_ENABLE_X402_SELLER` | `false` | Seller middleware remains disabled unless selected routes are scoped. |
| `AAE_ENABLE_X402_BUYER` | `false` | Buyer payment execution remains disabled unless scoped. |
| `AAE_ENABLE_X402_MAINNET` | `false` | Required before Base mainnet paid rails or receipt indexing. |
| `X402_SELLER_RESOURCE_IDS` | `agent-resource` | Comma-separated seller resource ids that may return x402 requirements. |
| `X402_SELLER_NETWORK` | `eip155:84532` | Seller payment network; Base mainnet also requires `AAE_ENABLE_X402_MAINNET=true`. |
| `X402_SELLER_PRICE_USD` | `0.01` | USDC dollar-string price for selected seller resources. |
| `X402_SELLER_PAY_TO` | unset | Required receiving wallet before seller resources can return payment requirements. |

Do not commit RPC URLs beyond public examples, API keys, facilitator credentials, wallet keys, raw x402 headers, signatures, signed payloads, PRXVT notes, or UCAN secrets.

## Go / No-Go

Go criteria for readiness:

- Local job creation still defaults to `settlementRail: "offchain"`.
- Base mainnet chain metadata is present but not the default.
- `x402` and `px402` jobs are rejected on non-Base networks and gated on Base mainnet by `AAE_ENABLE_X402_MAINNET=true`.
- Robinhood Chain jobs reject `x402` and `px402`; Robinhood starts as native ETH direct-wallet escrow only.
- x402/px402 completion requires a matching settled `PaymentLedger` row.
- Creating a settled x402/px402 ledger row does not directly complete a job.
- Seller resources return x402 requirements only when `AAE_ENABLE_X402_SELLER=true`, a resource id is allowlisted, a receiving wallet is configured, and the price is under cap. Protected resource access additionally requires a settled `x402` or `px402` `PaymentLedger` row with verified facilitator evidence.
- Buyer intents require `AAE_ENABLE_X402_BUYER=true`, endpoint allowlist, network allowlist, cap checks, and explicit approval input; payment header generation remains disabled without a separate wallet-signer exercise.
- Facilitator evidence is stored only as redacted references, hashes, amount, token, network, tx hash, receipt hash, payer/payee, endpoint hash, timestamps, and status.
- Raw `X-PAYMENT`, `PAYMENT-SIGNATURE`, authorization headers, private keys, wallet signatures, signed payloads, PRXVT notes, and UCAN secrets are rejected or omitted.

No-go conditions:

- Missing or unbounded `X402_MAX_PAYMENT_USD`.
- `X402_ALLOWED_NETWORKS` does not match the intended chain.
- Base mainnet flags are enabled without a bounded operator approval.
- Any payment evidence includes raw payment headers, signatures, private keys, or signed payloads.
- Ledger evidence is missing a public tx hash for settled x402/px402 payment.
- A job completes directly from receipt ingestion without approval, dispute resolution, or scheduler lifecycle gates.

## Rollback

1. Set `AAE_ENABLE_X402_SELLER=false`, `AAE_ENABLE_X402_BUYER=false`, and `AAE_ENABLE_X402_MAINNET=false`.
2. Remove `eip155:8453` from `X402_ALLOWED_NETWORKS`.
3. Set `X402_MAX_PAYMENT_USD=0`.
4. Disable `AAE_ENABLE_BASE_MAINNET_RECEIPT_INDEXER`.
5. Leave existing settled ledgers immutable; reverse only through normal dispute/operator accounting records, not destructive database edits.

## Observability

Track:

- `X402_SETTLEMENT_RECEIPT_RECORDED` audit events.
- `PaymentLedger` rows with `rail in ("x402", "px402")`.
- Duplicate `txHash`, `receiptHash`, or facilitator reference rejection.
- Mainnet-gate rejections involving `AAE_ENABLE_X402_MAINNET`.
- Job approval failures from missing settled `PaymentLedger` receipts.

## Verification

Expected local checks after x402/mainnet-readiness changes:

```bash
cd aether-agent-exchange/backend
npm run build
npx prisma validate
DATABASE_URL='postgresql://user:password@localhost:5432/aae' npx prisma validate --schema prisma/schema.postgres.prisma
npm run test:px402
npm run test:all -- --skip-sim

cd ../frontend
npm run build

cd ../contracts
forge test
```

Do not run Foundry `--broadcast` for Base mainnet from this readiness doc.
