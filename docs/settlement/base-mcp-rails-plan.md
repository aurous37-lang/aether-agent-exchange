# Base MCP Rails Pilot Plan

Timestamp: 2026-06-26 MDT
Mode: controlled Base Sepolia pilot documentation only. No mainnet writes, live wallet delegation, signing, PRXVT deposits, PRXVT notes, automatic payment headers, or paid x402 retries.

## Scope

The Base MCP provider is available only as a controlled Base Sepolia rail pilot:

- Provider endpoint: `https://mcp.base.org/`
- Provider id: `base-mcp`
- Network: `base-sepolia`
- Chain ID: `84532`
- Native gas token: `ETH`
- Mainnet writes: disabled

Default AAE job creation must remain `settlementRail: "offchain"` unless a flow explicitly creates paid-chain escrow metadata and records a matching settled `PaymentLedger` receipt. Base MCP metadata, provider status, tool catalogs, prepared requests, and receipts are evidence inputs only; they do not complete jobs by themselves.

## Environment Flags

Base MCP execution is disabled by default. Operators may enable only scoped testnet preparation after a planner-approved Base Sepolia process:

- `BASE_MCP_ENDPOINT`: optional provider endpoint override. Default must remain `https://mcp.base.org/`.
- `AAE_ENABLE_MCP_CATALOG_READ`: controls local/catalog read surfaces and may default on for metadata-only reads.
- `AAE_ENABLE_MCP_LIVE_DISCOVERY`: controls live MCP discovery in the service path and must default off.
- `AAE_ENABLE_MCP_WRITES`: controls MCP write preparation in the service path and must default off.
- `AAE_ENABLE_MCP_WRITE_EXECUTION`: controls policy approval for write execution requests and must default off.
- `AAE_ENABLE_MCP_X402_EXECUTION`: controls policy approval for x402 execution requests and must default off.
- `AAE_ENABLE_MCP_MAINNET`: must remain false for this pilot.

Use the existing px402 policy variables consistently for Base MCP x402 discovery and dry-run quote checks:

- `PX402_ENDPOINT_ALLOWLIST`
- `PX402_ALLOWED_NETWORKS`
- `PX402_MAX_PROBE_USD`
- `PX402_ALLOW_PLAIN_X402_FALLBACK`

Policy defaults must fail closed in production if allowlists are empty or do not include the intended Base Sepolia endpoint. Plain x402 fallback must stay disabled unless an operator explicitly sets `PX402_ALLOW_PLAIN_X402_FALLBACK=true` for a bounded test.

## Tool Categories

Base MCP tools should be classified and displayed with policy warnings:

- `discovered`: provider/catalog entries observed locally or through live discovery. Store only hashes, category metadata, status, and redacted references.
- `read`: read-only Base Sepolia account, chain, and contract queries. These may be available without write flags but still must not carry private authorization headers.
- `write`: Base Sepolia write preparation such as `send` or `send_calls`. Writes require network `base-sepolia`, chain ID `84532`, valid target addresses, amount-cap evaluation when value is present, and disabled-by-default execution flags.
- `x402`: payment-required quote or approval metadata. x402 remains dry-run or externally approved only; AAE must not generate payment headers, retry paid requests, or store raw payment material.

Warnings shown to operators and users should include:

- Base MCP is testnet-only in this phase.
- Write and x402 execution are disabled unless explicit operator flags are set.
- Mainnet requests, Base mainnet chain ID `8453`, and non-Base-Sepolia networks are blocked.
- Signing, private key, delegation, UCAN-secret, raw calldata, raw signature, PRXVT note, and raw payment-header tools are blocked.
- x402 amounts must be evaluated against `PX402_MAX_PROBE_USD`.

## Storage And Redaction

Persist only redacted operational metadata:

- provider id, endpoint reference/hash, network, chain ID, category, tool name, status, and schema hashes;
- request ids, idempotency hashes, request/params/metadata hashes, sanitized key lists, redacted references, and policy decisions;
- receipt status, transaction hash, receipt hash, redacted reference, redacted reference hash, and sanitized result summaries;
- settled `PaymentLedger` fields required for settlement matching.

Never persist, log, return, or commit:

- private keys, seed phrases, mnemonic material, signer paths, raw wallet signatures, raw typed-data signatures, or raw signed transactions;
- raw calldata, serialized transactions, automatic payment headers, `X-PAYMENT` headers, raw x402 payment headers, or payment signatures;
- PRXVT notes, PRXVT private note material, paid retry payloads, or live payment credentials;
- raw UCAN secrets, raw GitLawb private keys, unredacted delegation secrets, or raw provider webhook signatures.

If a provider receipt or request contains sensitive material, store a hash/redacted reference and reject or omit the raw field. Redacted receipts should make `rawReceiptStored: false`, `rawPaymentHeaderStored: false`, and `rawSignaturesStored: false` explicit where possible.

## PaymentLedger Gate

Base MCP settled-ledger creation uses the Base Sepolia receipt verifier documented in `docs/settlement/base-sepolia-receipt-verifier.md`. Confirmed receipts must provide either fixture proof in local/test mode or pass the explicitly enabled Base Sepolia RPC indexer before a settled `PaymentLedger` row is created.

Confirmed Base MCP receipts can be normalized into settled `PaymentLedger` records when they satisfy all settlement checks:

- receipt kind is a confirmed `send`, confirmed `send_calls`, or approved/paid `x402_payment`;
- network is `base-sepolia` and chain ID is `84532`;
- rail maps to a supported ledger rail such as `standard`, `erc8183`, or `px402-dry-run`;
- amount, token, tx hash, receipt hash, payer/payee or escrow recipient, contract version, and job id match the job settlement record;
- public onchain event proof or contract-state proof confirms the claimed funding/payment/release condition;
- receipt payload is reduced to redacted references and hashes before persistence.

A settled `PaymentLedger` record is necessary for paid-chain completion, but it is not sufficient by itself. Paid job completion must still pass the existing AAE approval, dispute-resolution, scheduler, review-period, and auto-release gates. Provider execution, x402 approval, a GitHub/GitLawb merge, or a Base MCP receipt may update evidence and settlement state only; none of those events may directly bypass the AAE job lifecycle.

## Rollback Rules

Rollback is configuration-first:

1. Set `AAE_ENABLE_MCP_WRITES=false`, `AAE_ENABLE_MCP_WRITE_EXECUTION=false`, and `AAE_ENABLE_MCP_X402_EXECUTION=false`.
2. Set `AAE_ENABLE_MCP_LIVE_DISCOVERY=false` if provider discovery is unstable.
3. Keep `AAE_ENABLE_MCP_MAINNET=false` and remove any non-Base-Sepolia entries from `PX402_ALLOWED_NETWORKS`.
4. Clear or narrow `PX402_ENDPOINT_ALLOWLIST` to local/test endpoints only.
5. Stop recording new Base MCP receipts; retain existing redacted ledger rows and audit events for reconciliation.
6. Do not delete settled `PaymentLedger` records during rollback. If a receipt is later found invalid, add a corrective audit/settlement note and use the existing dispute or manual remediation process.

Rollback must not introduce private-key handling, live wallet delegation, raw receipt storage, or mainnet writes as a workaround.

## Verification Commands

Run the full controlled suite before handing off settlement, chain, contract, MCP, or px402 changes:

```powershell
cd aether-agent-exchange\backend
npm run build
npx prisma validate
$env:DATABASE_URL='postgresql://user:password@localhost:5432/aae'; npx prisma validate --schema prisma\schema.postgres.prisma
npm run test:px402
npm run test:all
$env:AAE_ENABLE_WORKSPACE_CONTRACT_TESTS='true'; npm run test:all -- --skip-sim

cd ..\frontend
npm run build

cd ..\contracts
forge test
```

For a docs-only change, at minimum verify the documentation diff and do not claim runtime validation unless the commands above were actually run.
