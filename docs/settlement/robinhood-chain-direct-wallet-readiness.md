# AAE Robinhood Chain Direct-Wallet Readiness

Status: code/config readiness only. This document does not authorize contract deployment, signer use, wallet payments, bridge activity, production hot-patching, or real-fund movement.

## Scope

Robinhood Chain is supported as a first-class EVM chain for native ETH direct wallet escrow. Initial production support is intentionally limited to:

- `network: "robinhood"`
- chain ID `4663`
- CAIP-2 network `eip155:4663`
- native token `ETH`
- settlement rail `standard`
- escrow contract version `native-eth`

Robinhood Chain Testnet is available for staging with `network: "robinhood-testnet"`, chain ID `46630`, and CAIP-2 network `eip155:46630`.

Do not enable Robinhood x402, px402, ERC-8183, USDC, WETH, or other ERC20 rails unless provider/token support is separately verified and explicit gates, tests, docs, and rollback steps are added.

## Public Network Metadata

Official Robinhood Chain documentation lists:

| Network | Chain ID | Native token | RPC | Explorer |
| --- | ---: | --- | --- | --- |
| Robinhood Chain | `4663` | `ETH` | `https://rpc.mainnet.chain.robinhood.com/` | `https://robinhoodchain.blockscout.com` |
| Robinhood Chain Testnet | `46630` | `ETH` | `https://rpc.testnet.chain.robinhood.com/` | `https://explorer.testnet.chain.robinhood.com` |

References:

- `https://docs.robinhood.com/chain/deploy-smart-contracts/`
- `https://docs.robinhood.com/chain/add-network-to-wallet/`
- `https://docs.robinhood.com/chain/connecting/`

## Required Code Paths

- Backend chain registry: `backend/src/config/chains.ts`
- Backend job/receipt validation: `backend/src/utils/validation.ts`, `backend/src/routes/jobs.ts`
- Backend capability discovery: `backend/src/services/stablecoinProviders.ts`, `backend/src/routes/settlementProviders.ts`
- Backend receipt/indexer chain lookup: `backend/src/services/settlementVerifier.ts`, `backend/src/services/chainIndexer.ts`
- Frontend chain registry and wallet transports: `frontend/src/lib/chains.ts`, `frontend/src/lib/wagmi.ts`
- Frontend contract/token lookup: `frontend/src/lib/contracts.ts`
- Frontend job posting: `frontend/src/pages/PostJob.tsx`

## Environment Checklist

Backend public/non-secret examples:

```bash
AAE_ACTIVE_CHAIN=robinhood
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com/
ROBINHOOD_EXPLORER_URL=https://robinhoodchain.blockscout.com
AAE_ENABLE_ROBINHOOD_MAINNET_RECEIPT_INDEXER=false
AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS=false
AAE_ROBINHOOD_NATIVE_ETH_ESCROW_FACTORY_ADDRESS=
AAE_ROBINHOOD_AGENT_REGISTRY_ADDRESS=
AAE_ROBINHOOD_FEE_COLLECTOR_ADDRESS=
AAE_ROBINHOOD_JOB_ESCROW_IMPL_ADDRESS=
AAE_ROBINHOOD_USDC_TOKEN_ADDRESS=
AAE_ROBINHOOD_WETH_TOKEN_ADDRESS=
```

Frontend public examples:

```bash
VITE_ACTIVE_CHAIN=robinhood
VITE_ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com/
VITE_ROBINHOOD_EXPLORER_URL=https://robinhoodchain.blockscout.com
VITE_ROBINHOOD_NATIVE_ETH_ESCROW_FACTORY_ADDRESS=
VITE_ROBINHOOD_FEE_COLLECTOR_ADDRESS=
VITE_ROBINHOOD_AGENT_REGISTRY_ADDRESS=
VITE_ROBINHOOD_JOB_ESCROW_IMPL_ADDRESS=
VITE_ROBINHOOD_USDC_TOKEN_ADDRESS=
VITE_ROBINHOOD_WETH_TOKEN_ADDRESS=
```

Leave ERC20/token addresses blank for Robinhood until the ERC20 path is separately approved. Native ETH direct wallet escrow uses `NATIVE_ETH_ESCROW_FACTORY_ADDRESS`, not WETH.

## Deployment Boundary

Full production readiness requires a verified Robinhood deployment of the native direct-wallet escrow stack. Stop before any transaction signing or broadcast unless the operator explicitly approves a deployment exercise.

Before approval, prepare:

- Deployer wallet address and funding plan, without printing private keys.
- Robinhood RPC health check result for `eth_chainId == 0x1237`.
- `NativeEthEscrowFactory` deployment command with `--chain-id 4663`.
- Contract verification command for Blockscout.
- Addresses for native factory, agent registry, fee collector, and implementation.
- Backend/frontend env update plan using public addresses only.
- Indexer start block and receipt indexer enablement plan.
- Rollback plan that disables `AAE_ENABLE_ROBINHOOD_MAINNET_PAID_RAILS`, clears Robinhood contract addresses from the next deploy config, and rebuilds frontend/backend from committed source.

## Verification

Readiness checks before any live Robinhood payment exercise:

```bash
cd /srv/aae/AAEHost/source/aether-agent-exchange/backend
npm run build
npm run test:all -- --skip-sim

cd ../frontend
npm run build
npm run lint

git diff --check -- backend/src/config/chains.ts backend/src/routes/jobs.ts backend/src/services/stablecoinProviders.ts backend/src/utils/validation.ts backend/test-env frontend/src frontend/.env.example backend/.env.example ../docs/settlement/robinhood-chain-direct-wallet-readiness.md
```

Optional read-only RPC probe:

```bash
curl -sS https://rpc.mainnet.chain.robinhood.com/ \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Expected mainnet result is `0x1237`.
