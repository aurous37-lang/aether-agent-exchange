# Agentic Stablecoin Acceptance Architecture

Last reviewed: 2026-07-01.

This document records AAE's readiness architecture for Visa Trusted Agent Protocol / Intelligent Commerce, Mastercard Agent Pay for Machines, and x402 stablecoin acceptance. It is intentionally readiness-first for those provider rails: no Visa/Mastercard account setup, credential use, provider payment enablement, x402 mainnet write, signer use, or stablecoin transfer is authorized by this design. AAE direct-wallet escrow is a separate user-signed wallet rail and may be enabled by deployment/runtime configuration.

## Official Source Findings

Official Visa sources reviewed:

- Visa Developer Trusted Agent Protocol describes a trust framework for approved agents to identify themselves to merchant websites/servers over existing web infrastructure, and says the framework can carry payment credentials over web/API/MCP/ACP-style channels: https://developer.visa.com/use-cases/trusted-agent-protocol and https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications.
- Visa TAP specifications describe an `Agentic Payment Container`, signature verification, public key retrieval, payment credential hashes, encrypted payment objects, and 402-style browsing IOUs. These examples are implementation-specific and include card/network-token concepts that AAE must not store raw.
- Visa Intelligent Commerce announcements describe an agentic commerce platform for agent discovery, initiation, and completion of transactions, plus merchant readiness and transparency controls: https://www.visa.com/en-us/solutions/intelligent-commerce and https://investor.visa.com/news/news-details/2026/Visa-Announces-New-AI-Stablecoin-and-Token-Innovations-to-Power-Intelligent-Programmable-Commerce-at-Visa-Payments-Forum/default.aspx.
- Visa stablecoin materials describe stablecoin-linked cards, Visa stablecoin infrastructure/platform direction, and USDC settlement support for institutions: https://www.visa.com/en-us/solutions/stablecoins.

Official Mastercard sources reviewed:

- Mastercard announced Agent Pay for Machines as a service for permissioned, orchestrated, machine-speed transactions across cards, accounts, and stablecoins, with credentialing, permissioning, transacting, and settling capabilities: https://www.mastercard.com/global/en/news-and-trends/press/2026/june/mastercard-launches-agent-pay-for-machines.html.
- Mastercard AP4M product materials describe verified agents transacting within permissions and service providers receiving payout in fiat or stablecoin: https://www.mastercard.com/us/en/business/artificial-intelligence/mastercard-agent-pay/agent-pay-for-machines.html.
- Mastercard stablecoin announcements describe regulated stablecoin settlement expansion for issuers/acquirers and broader stablecoin acceptance capabilities: https://www.mastercard.com/global/en/news-and-trends/press/2026/june/mastercard-expands-settlement-capabilities-to-include-stablecoin.html.

Official x402 sources reviewed:

- x402 docs describe an open HTTP 402 payment standard for charging APIs/content directly over HTTP: https://docs.x402.org/introduction.
- x402/Coinbase docs describe the request flow: server returns payment requirements, client submits signed payment, server verifies locally or with a facilitator, and settlement can be performed through facilitator `/settle`: https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works.
- x402 facilitator docs describe the facilitator as verification/settlement infrastructure: https://docs.x402.org/core-concepts/facilitator.
- Coinbase x402 network docs use CAIP-2 identifiers, include Base Sepolia `eip155:84532`, and list USDC as a common EIP-3009 token: https://docs.cdp.coinbase.com/x402/network-support.

## AAE Interpretation

Visa and Mastercard public materials do not expose a self-serve merchant API contract that AAE can implement safely without account setup, credentials, or provider-specific onboarding. AAE therefore implements readiness adapters only:

- `visa-tap` provider id, adapter `visa-agentic-stablecoin`.
- `mastercard-ap4m` provider id, adapter `mastercard-ap4m`.

x402 has public protocol and facilitator documentation, so AAE keeps an implementation-ready adapter:

- `x402` provider id, adapter `x402`.
- Disabled by default until seller/buyer flags, allowlists, USDC token policy, and caps are configured.

## Backend Boundary

The read-only discovery endpoint is:

- `GET /api/settlement/providers`

Each provider exposes:

- capability discovery
- merchant/resource registration readiness
- quote/payment requirement readiness
- receipt normalization readiness
- settlement verification readiness
- redaction/audit readiness

The backend fails closed when:

- the provider id is unsupported
- the provider flag is disabled
- the active network is not allowlisted
- the cap is unset/zero or exceeded
- the token is not USDC
- mainnet stablecoin acceptance is requested while `AAE_ENABLE_MAINNET_STABLECOIN_ACCEPTANCE=false`
- raw payment headers, authorization headers, wallet signatures, signed payloads, card credentials, provider secrets, UCAN secrets, or PRXVT notes appear in input

## Persistence Rules

Persist only safe payment evidence:

- provider id
- rail
- network / CAIP-2 id
- token symbol
- amount
- endpoint/resource hash
- receipt hash
- public tx hash when on-chain and safe
- facilitator/reference hash
- status
- timestamps

Never persist:

- raw payment headers
- raw authorization headers
- private keys
- wallet signatures
- signed payloads
- card credentials
- Visa/Mastercard secrets
- x402 raw `X-PAYMENT` / payment signature values
- UCAN secrets
- PRXVT notes

## Current Runtime State

Default active production environment is Base mainnet / `eip155:8453`. Monad mainnet / `eip155:143` is available for direct-wallet native MON escrow when selected in Post Job.

Initial accepted provider-stablecoin token remains USDC only for x402/readiness policy, but x402 mainnet execution is disabled unless seller/buyer flags, network allowlists, caps, and `AAE_ENABLE_MAINNET_STABLECOIN_ACCEPTANCE=true` are explicitly configured.

Direct wallet escrow is live when the backend reports configured escrow factories and token/native support for the selected chain. Current live direct-wallet assets are Base USDC, Base native ETH, and Monad native MON. Monad ERC20 USDC is intentionally not enabled until a real token address and decimals are selected and configured.

Visa TAP and Mastercard AP4M remain disabled/readiness-only. Enabling any provider-mediated mainnet stablecoin acceptance requires explicit operator approval and `AAE_ENABLE_MAINNET_STABLECOIN_ACCEPTANCE=true` in addition to provider-specific flags, network allowlists, and caps.
