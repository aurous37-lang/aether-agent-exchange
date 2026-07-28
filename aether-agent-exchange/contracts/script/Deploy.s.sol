// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/FeeCollector.sol";
import "../src/AgentRegistry.sol";
import "../src/JobEscrow.sol";
import "../src/EscrowFactory.sol";

/// @title DeployScript - Deploys all Aether Agent Exchange contracts to an EVM testnet
/// @notice Deployment order: FeeCollector -> AgentRegistry -> JobEscrow (impl) -> EscrowFactory
/// @dev Usage:
///   BASE_SEPOLIA_RPC_URL=https://... BASESCAN_API_KEY=... PRIVATE_KEY=0x... forge script script/Deploy.s.sol \
///     --rpc-url base_sepolia \
///     --broadcast --verify --chain-id 84532
///   Ethereum mainnet:
///     ETHEREUM_RPC_URL=https://... ETHERSCAN_API_KEY=... PRIVATE_KEY=0x... forge script script/Deploy.s.sol \
///       --rpc-url ethereum \
///       --broadcast --verify --chain-id 1
///   Ethereum Sepolia:
///     ETHEREUM_SEPOLIA_RPC_URL=https://... ETHERSCAN_API_KEY=... PRIVATE_KEY=0x... forge script script/Deploy.s.sol \
///       --rpc-url ethereum_sepolia \
///       --broadcast --verify --chain-id 11155111
///
///   Legacy Monad:
///   PRIVATE_KEY=0x... forge script script/Deploy.s.sol \
///     --rpc-url https://testnet-rpc.monad.xyz \
///     --broadcast --verify --chain-id 10143
///
///   Optional env vars:
///     ARBITER_ADDRESS  - default dispute arbiter (defaults to deployer)
contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address arbiter = vm.envOr("ARBITER_ADDRESS", deployer);

        console.log("=== Aether Agent Exchange - Deployment ===");
        console.log("Deployer:        ", deployer);
        console.log("Default Arbiter: ", arbiter);
        console.log("Chain ID:        ", block.chainid);
        console.log("");

        vm.startBroadcast(deployerKey);

        // ──────────────────────────────────────────────────────────────
        // Step 1: Deploy FeeCollector (platform treasury)
        //   - Receives 1.7% fees from escrow disbursements
        //   - Owner can withdraw collected fees
        // ──────────────────────────────────────────────────────────────
        FeeCollector feeCollector = new FeeCollector(deployer);
        console.log("[1/4] FeeCollector:  ", address(feeCollector));

        // ──────────────────────────────────────────────────────────────
        // Step 2: Deploy AgentRegistry (on-chain agent identity)
        //   - Agents register with wallet + handler + metadata
        //   - Reputation updated by authorized escrow clones
        // ──────────────────────────────────────────────────────────────
        AgentRegistry agentRegistry = new AgentRegistry(deployer);
        console.log("[2/4] AgentRegistry: ", address(agentRegistry));

        // ──────────────────────────────────────────────────────────────
        // Step 3: Deploy JobEscrow implementation (template for clones)
        //   - Not used directly — serves as EIP-1167 minimal proxy impl
        //   - Each job gets a clone via EscrowFactory.createEscrow()
        // ──────────────────────────────────────────────────────────────
        JobEscrow escrowImpl = new JobEscrow();
        console.log("[3/4] EscrowImpl:    ", address(escrowImpl));

        // ──────────────────────────────────────────────────────────────
        // Step 4: Deploy EscrowFactory (creates per-job escrow clones)
        //   - References: escrowImpl, feeCollector, agentRegistry
        //   - Default arbiter used for single-arbiter escrow creation
        // ──────────────────────────────────────────────────────────────
        EscrowFactory factory =
            new EscrowFactory(deployer, address(escrowImpl), address(feeCollector), address(agentRegistry), arbiter);
        console.log("[4/4] EscrowFactory: ", address(factory));

        // Wire the factory into the registry so every createEscrow call can
        // auto-authorize its new clone as a reputation updater. Without this
        // step approve() reverts inside the disbursement path.
        agentRegistry.setFactory(address(factory));
        console.log("[post] Registered factory on AgentRegistry");

        vm.stopBroadcast();

        // ──────────────────────────────────────────────────────────────
        // Post-deployment notes
        // ──────────────────────────────────────────────────────────────
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("Post-deployment steps:");
        console.log("  (The factory is now registered on AgentRegistry so every");
        console.log("   new escrow clone is auto-authorized as a reputation updater.)");
        console.log("  1. Copy deployed addresses to backend/.env:");
        console.log("     ESCROW_FACTORY_ADDRESS=<factory>");
        console.log("     JOB_ESCROW_IMPL_ADDRESS=<escrowImpl>");
        console.log("     AGENT_REGISTRY_ADDRESS=<agentRegistry>");
        console.log("     FEE_COLLECTOR_ADDRESS=<feeCollector>");
        console.log("  2. Verify contracts on block explorer if --verify was not used.");

        // Sanity checks (read-only, won't revert on testnet)
        console.log("");
        console.log("=== Verification ===");
        console.log("Factory.escrowImplementation: ", factory.escrowImplementation());
        console.log("Factory.feeCollector:         ", factory.feeCollector());
        console.log("Factory.agentRegistry:        ", factory.agentRegistry());
        console.log("Factory.defaultArbiter:       ", factory.defaultArbiter());
        console.log("FeeCollector.owner:           ", feeCollector.owner());
        console.log("AgentRegistry.owner:          ", agentRegistry.owner());
    }
}
