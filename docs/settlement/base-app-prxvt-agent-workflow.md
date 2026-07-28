# Base App + PRXVT Agent Workflow

This workflow is a dry-run, job-detail-first build for Base Sepolia testing. AAE remains the policy, job, evidence, and settlement gate. Base App/Base Account is the future human approval surface. PRXVT/px402 is the private quote and payment evidence layer.

Launch-scope update: plain x402 is now tracked separately as a mainnet-ready launch rail in `docs/settlement/mainnet-x402-launch-readiness.md`. This workflow still does not authorize PRXVT deposits, PRXVT notes, raw payment headers, wallet delegation, or Base mainnet writes.

Live wallet execution is out of scope for this phase. Do not add PRXVT deposits, PRXVT notes, raw payment headers, automatic payment headers, paid x402 retries, signing, delegation, private-key handling, or Base mainnet writes.

## Workflow

1. A handler registers an agent with `paymentPrivacyMode`, `x402EndpointUrl`, `px402Supported`, and probe metadata. The default job path still creates jobs with `settlementRail: "offchain"`.
2. A client creates and accepts a normal AAE job. The job remains Base Sepolia `84532` and offchain unless a separate paid-chain escrow flow is explicitly scoped.
3. From the job detail page, the client runs a PRXVT/px402 dry-run quote. AAE probes the x402 endpoint once, parses the 402 challenge, enforces allowlist, network, chain, and cap policy, and stores only redacted quote evidence.
4. AAE links the quote to the job through a `PaymentLedger` row with `rail: "px402-dry-run"`. The quote keeps `railCandidate` as `px402`, `x402`, or `unsupported`.
5. AAE may prepare a Base MCP x402 request record using the redacted quote reference, but execution remains policy-blocked unless operator flags are later enabled in a separately approved pilot.
6. Job completion stays unchanged: workspace evidence, deliverables, approval, disputes, and paid-chain `PaymentLedger` gates still control lifecycle state.

## Operating Model

- Base App/Base Account is the future approval surface.
- AAE is the policy, job, evidence, and settlement gate.
- Base MCP remains provider-agnostic and Base Sepolia only for this pilot.
- Job-linked dry-run quotes may create redacted `PaymentLedger` evidence, but they must not complete a job.
- Paid-chain rails (`standard`, `erc8183`) still require a matching settled receipt before approval, dispute resolution, or auto-release can move a job to `COMPLETED`.

## Backend Contract

- `POST /api/px402/dry-run` accepts optional `jobId`.
- When `jobId` is present, the caller must be the job client or assigned handler.
- Job-linked dry-runs require `network: "base-sepolia"` and `chainId: 84532`.
- The linked ledger row uses `rail: "px402-dry-run"` and `mode: "probe"`.
- The quote object keeps `railCandidate` as `px402`, `x402`, or `unsupported`.
- Raw payment headers, signatures, PRXVT notes, private keys, calldata, wallet delegation material, and automatic payment headers must be rejected or redacted before persistence.
- `POST /api/mcp/base/requests/prepare` continues to use `action: "x402"`, `category: "x402"`, `jobId`, and `x402Reference` for redacted request records.

## Frontend Contract

- The job detail Base MCP panel is the primary surface.
- The panel may trigger a compact PRXVT/px402 dry-run quote action for assigned Base Sepolia jobs.
- On quote success, reload the job so the redacted `PaymentLedger` evidence appears in the existing receipt list.
- Show `Base App approval not enabled` unless `AAE_ENABLE_MCP_X402_EXECUTION=true` and the quote/request passes policy.
- Keep the UI operational and warning-forward. Do not turn this into a marketing page or live-wallet flow.

## Blocked Live-Payment Actions

The following remain blocked in this phase:

- PRXVT deposits, notes, note material, or SDK live payment calls.
- Raw x402 or px402 payment headers.
- Automatic payment headers or paid x402 retries.
- Wallet signing, delegation, signer storage, private keys, seed phrases, or UCAN secrets.
- Raw calldata, raw signatures, raw transactions, or serialized transactions.
- Base mainnet writes or non-Base-Sepolia MCP write paths.
- Any job completion shortcut based on a quote, provider merge, CI result, reconciliation event, or receipt record alone.

## Operator Checklist

1. Keep `AAE_ACTIVE_CHAIN=base-sepolia` and chain ID `84532`.
2. Keep `AAE_ENABLE_MCP_WRITES=false`, `AAE_ENABLE_MCP_WRITE_EXECUTION=false`, `AAE_ENABLE_MCP_X402_EXECUTION=false`, and `AAE_ENABLE_MCP_MAINNET=false` for the first pass.
3. Configure `PX402_ENDPOINT_ALLOWLIST`, `PX402_ALLOWED_NETWORKS`, `PX402_MAX_PROBE_USD`, and `PX402_ALLOW_PLAIN_X402_FALLBACK` deliberately.
4. Verify default job creation remains `settlementRail: "offchain"`.
5. Run only read-only or dry-run px402 probes until a separate paid-chain escrow experiment is approved.
6. Record official testnet results in `docs/testnet/` or `docs/settlement/`.

## Rollback Rules

- If quote parsing, allowlist checks, chain validation, or cap enforcement behaves unexpectedly, disable the job-detail quote action and keep Base MCP read-only.
- If a raw header, signature, PRXVT note, private key, delegation secret, or calldata field is accepted by any new path, treat it as a release blocker and revert the path before testing further.
- If a dry-run quote can move a job to `COMPLETED`, revert the lifecycle change immediately. Quotes are evidence only.
- If Base mainnet or non-Base-Sepolia writes become reachable, disable the MCP route or flags and document the rollback in `docs/testnet/` or `docs/settlement/`.

## Verification

Run these validation checks after settlement, chain, contract, MCP, or px402 changes:

```powershell
cd aether-agent-exchange/backend
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

References: Base MCP, Base custom plugins, Base x402 payments, PRXVT docs, and x402 protocol docs.
