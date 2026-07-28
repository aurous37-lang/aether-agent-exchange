// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/mocks/MockERC20.sol";
import "../src/EscrowFactory.sol";
import "../src/JobEscrow.sol";
import "../src/AgentRegistry.sol";
import "../src/FeeCollector.sol";

/// @notice Optional smoke tooling for controlled EVM testnet deployments.
///
/// This script is not a current-phase operator runbook and does not enable
/// live wallet delegation, paid retries, PRXVT handling, or app-level job
/// completion. Use it only as disposable testnet smoke tooling after a
/// deployment is already available.
///
/// Dry-run simulation example, intentionally without --broadcast:
///
///   Set local Foundry env vars PRIVATE_KEY, FACTORY, AGENT_REGISTRY, and
///   BASE_SEPOLIA_RPC_URL, then run:
///
///   forge script script/TestnetSmoke.s.sol --rpc-url base_sepolia --chain-id 84532
///
/// Broadcast use is intentionally omitted from this header. If an operator
/// deliberately broadcasts this script in a controlled testnet environment,
/// they must supply their own approved process and ephemeral testnet-only key.
///
/// Exercises:
///   1. Deploys a fresh MockERC20 (test USDC) so we don't depend on any
///      pre-existing token.
///   2. Mints balance to the deployer (= client).
///   3. Creates an escrow via the already-deployed EscrowFactory.
///   4. Funds the escrow (client to escrow ERC20 transfer).
///   5. Registers a test agent in the already-deployed AgentRegistry.
///   6. Prints the on-chain state at each step so we can verify success.
contract TestnetSmokeScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        EscrowFactory factory = EscrowFactory(vm.envAddress("FACTORY"));
        AgentRegistry registry = AgentRegistry(vm.envAddress("AGENT_REGISTRY"));

        console.log("=== AAE Testnet Smoke ===");
        console.log("Deployer:       ", deployer);
        console.log("Factory:        ", address(factory));
        console.log("AgentRegistry:  ", address(registry));
        console.log("");

        vm.startBroadcast(deployerKey);

        // 1. Deploy mock ERC20 for payments.
        MockERC20 token = new MockERC20("Test USDC", "tUSDC", 6);
        console.log("[1] MockERC20 deployed:", address(token));

        // 2. Mint 1000 tUSDC to deployer.
        uint256 amount = 1000 * 10 ** 6;
        token.mint(deployer, amount);
        console.log("[2] Minted:", amount, "to deployer");

        // 3. Create an escrow. Use a per-run jobId so we never collide.
        bytes32 jobId = keccak256(abi.encode("aae-testnet-smoke", block.timestamp));
        uint256 escrowAmount = 100 * 10 ** 6; // 100 tUSDC
        uint256 reviewPeriod = 7 days;
        address escrowAddr = factory.createEscrow(
            jobId,
            deployer, // client
            address(token),
            escrowAmount,
            reviewPeriod
        );
        console.log("[3] Escrow clone:", escrowAddr);

        JobEscrow escrow = JobEscrow(escrowAddr);
        console.log("    state (should be 0=UNFUNDED):", uint256(escrow.state()));

        // 4. Approve + fund the escrow.
        token.approve(escrowAddr, escrowAmount);
        escrow.fund();
        console.log("[4] After fund():");
        console.log("    state (should be 1=FUNDED):", uint256(escrow.state()));
        console.log("    escrow tUSDC balance:", token.balanceOf(escrowAddr));

        // 5. Register a test agent (self-registration: deployer is both
        //    handler and agent wallet).
        bytes32 agentId = registry.register("ipfs://aae-testnet-smoke-placeholder");
        console.log("[5] Agent registered. agentId:");
        console.logBytes32(agentId);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Smoke test complete ===");
    }
}
