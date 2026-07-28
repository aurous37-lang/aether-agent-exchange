# Base Sepolia Receipt Verifier

Timestamp: 2026-06-29 MDT
Mode: controlled Base Sepolia settlement verification. No mainnet writes, wallet delegation, live x402/px402 execution, PRXVT notes, raw payment headers, or raw calldata persistence.

## Purpose

AAE now has a persistent verifier/indexer path before creating settled `PaymentLedger` records for Base Sepolia paid-chain receipts. A ledger row remains the settlement gate for app completion, but the ledger row itself is created only after verifier proof passes.

The verifier validates:

- network `base-sepolia` and chain ID `84532`;
- job rail and escrow contract version;
- token/native ETH amount in expected atomic units and decimals;
- escrow or recipient address against the job settlement address;
- contract-emitted onchain job id against `Job.onchainJobId` when the event exposes a `jobId`;
- valid tx hash and receipt hash with idempotent uniqueness;
- successful onchain receipt status;
- matching public event proof or contract-state proof for the claimed condition;
- replay resistance through exact job, escrow, chain, rail, tx, and receipt matching.

## Persistence

`PaymentLedger` stays the source used by approval, dispute resolution, scheduler auto-release, and paid-chain completion checks.

`SettlementReceiptVerification` stores verifier attempts and sanitized proof summaries:

- `PASSED` records are linked to the created `PaymentLedger` row.
- `FAILED` records store tx/receipt/job metadata and a short failure reason for auditability.
- Proof summaries store public hashes, event names, log indexes, state names, chain/rail/address/amount metadata, and explicit `raw*Stored: false` flags.
- Raw private keys, signatures, calldata, signed transactions, payment headers, PRXVT notes, UCAN secrets, and credentials are not accepted or persisted.

## Providers

The verifier uses a provider abstraction:

- `fixture`: local/test fixture proof for normal automated tests and local dry-run work. In production this is disabled unless `AAE_ENABLE_SETTLEMENT_FIXTURE_VERIFIER=true` is deliberately set for a trusted verifier/indexer writer.
- `base-sepolia-rpc`: optional live Base Sepolia RPC receipt lookup. It is enabled only when `AAE_ENABLE_BASE_SEPOLIA_RECEIPT_INDEXER=true` and `BASE_SEPOLIA_RPC_URL` is configured.

Inline `verificationProof` payloads are always fixture proof and must use provider `fixture`. Live RPC indexing is selected by omitting fixture proof and explicitly enabling the Base Sepolia receipt indexer flag.

Normal tests do not require live network calls. Live RPC indexing remains an explicit operator-scoped testnet exercise.

## Ingestion Paths

The following settled-ledger paths now pass through the verifier:

- `POST /api/jobs/:id/settlement-receipts`
- confirmed Base MCP `send`, `send_calls`, and approved x402-style receipt normalization before `PaymentLedger` creation

px402 dry-run quote rows remain non-settled evidence and do not use this verifier path.

Creating or verifying a ledger row does not complete a job. Paid-chain completion still requires the existing AAE lifecycle gate: client approval, dispute resolution, or scheduler auto-release plus a matching settled `PaymentLedger` row.

## Fixture Proof Shape

Fixture proof is intentionally sanitized. It contains public receipt summaries only:

```json
{
  "provider": "fixture",
  "network": "base-sepolia",
  "chainId": 84532,
  "txHash": "0x...",
  "receiptHash": "0x...",
  "status": "success",
  "to": "0xescrow...",
  "value": "0",
  "condition": "funding",
  "logs": [
    {
      "address": "0xescrow...",
      "eventName": "EscrowFunded",
      "args": {
        "aaeJobId": "job-id",
        "amount": "10000000"
      },
      "logIndex": 0
    }
  ],
  "contractState": {
    "address": "0xescrow...",
    "state": "FUNDED",
    "escrowAmount": "10000000"
  }
}
```

For native ETH receipts, `value` and `escrowAmount` must be wei units and the proof must not include ERC20 `Transfer` evidence or token addresses. For ERC20 receipts, native `value` must be zero, and any configured token address must match the job.

Contract-state proof must include exact amount evidence through `escrowAmount`, `balance`, or `nativeBalance`. State-only proof without amount evidence is rejected.

Live Base Sepolia RPC event parsing uses the ABI input list to recover named ethers v6 event args from numeric result positions. This is required for native `EscrowFunded(bytes32 indexed jobId, address indexed client, uint256 amount)` logs, where the verifier must compare the event `jobId` to `Job.onchainJobId` and the event `amount` to the expected native ETH wei amount.

## Live Indexer Exercise

On 2026-06-29, the controlled Stage 5 live receipt-indexer exercise passed against a fresh Base Sepolia native ETH escrow funding receipt. The local test run enabled `AAE_ENABLE_BASE_SEPOLIA_RECEIPT_INDEXER=true` and a local `BASE_SEPOLIA_RPC_URL` only in process env, omitted `verificationProof`, and verified the receipt through provider `base-sepolia-rpc`.

The live verification result created a settled `PaymentLedger` row and a linked `SettlementReceiptVerification` row with:

- provider: `base-sepolia-rpc`;
- proof type: `event`;
- event name: `EscrowFunded`;
- network: `base-sepolia`;
- chain ID: `84532`;
- rail: `standard`;
- escrow contract version: `native-eth`.

The settled ledger did not directly complete the job. The test then completed the job through the normal client approval gate using the matching settled ledger row.

## Verification

Focused verifier coverage is in `backend/test-env/test-settlement-verifier.ts` and is included in the controlled backend runner. It covers:

- success;
- wrong chain;
- wrong amount;
- native ETH/ERC20 confusion;
- wrong escrow/recipient proof;
- duplicate tx/receipt idempotency and conflict;
- failed receipt;
- replay across jobs through shared escrow;
- missing event/state proof;
- preservation of lifecycle gates after ledger creation.

Run after settlement, chain, Prisma, MCP, or px402 changes:

```powershell
cd aether-agent-exchange\backend
npm run build
npx prisma validate
$env:DATABASE_URL='postgresql://user:password@localhost:5432/aae'; npx prisma validate --schema prisma\schema.postgres.prisma
npm run test:px402
npm run test:all
$env:AAE_ENABLE_WORKSPACE_CONTRACT_TESTS='true'; npm run test:all -- --skip-sim
```
