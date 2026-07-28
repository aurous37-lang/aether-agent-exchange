// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/NativeEthEscrowFactory.sol";
import "../src/NativeEthJobEscrow.sol";

/// @notice Runs one small native-ETH paid-chain lifecycle on Base Sepolia.
/// @dev Uses existing client key for creation/funding/approval and provider key for work steps.
contract NativeEthLifecycleScript is Script {
    address payable private runFeeCollector;
    uint256 private runFeeCollectorBefore;
    uint256 private runProviderBefore;

    function run() external {
        uint256 clientKey = vm.envUint("AAE_DEPLOYER_KEY");
        uint256 providerKey = vm.envUint("AAE_PROVIDER_KEY");
        address client = vm.addr(clientKey);
        address provider = vm.addr(providerKey);
        AgentRegistry registry = AgentRegistry(vm.envAddress("AGENT_REGISTRY"));
        NativeEthEscrowFactory factory = NativeEthEscrowFactory(vm.envAddress("NATIVE_ETH_FACTORY"));
        address legacyFactory = vm.envAddress("LEGACY_FACTORY");
        runFeeCollector = factory.feeCollector();
        uint256 amount = vm.envOr("NATIVE_ETH_AMOUNT_WEI", uint256(0.0001 ether));
        uint256 reviewPeriod = vm.envOr("NATIVE_ETH_REVIEW_PERIOD", uint256(1 days));
        bytes32 jobId =
            keccak256(abi.encode("aae-native-eth-lifecycle", block.chainid, block.timestamp, client, provider));
        runFeeCollectorBefore = runFeeCollector.balance;
        runProviderBefore = provider.balance;

        console.log("=== AAE Native ETH Lifecycle ===");
        console.log("Chain ID:       ", block.chainid);
        console.log("Client:         ", client);
        console.log("Provider:       ", provider);
        console.log("Factory:        ", address(factory));
        console.log("Fee collector:  ", runFeeCollector);
        console.log("Amount wei:     ", amount);
        console.log("Expected fee:   ", _feeAmount(amount));
        console.log("Expected payout:", amount - _feeAmount(amount));
        console.log("Fee bal before: ", runFeeCollectorBefore);
        console.log("Prov bal before:", runProviderBefore);

        vm.startBroadcast(clientKey);
        registry.setFactory(address(factory));
        address escrowAddr = factory.createEscrow(jobId, client, amount, reviewPeriod);
        NativeEthJobEscrow escrow = NativeEthJobEscrow(payable(escrowAddr));
        escrow.fund{value: amount}();
        registry.setFactory(legacyFactory);
        vm.stopBroadcast();

        console.log("Job ID:");
        console.logBytes32(jobId);
        console.log("Escrow:         ", escrowAddr);
        console.log("State after fund:", uint256(escrow.state()));
        console.log("Escrow balance: ", escrowAddr.balance);

        bytes32 agentId = registry.walletToAgentId(provider);
        if (agentId == bytes32(0)) {
            vm.startBroadcast(providerKey);
            agentId = registry.register("ipfs://aae-native-eth-testnet-provider");
            vm.stopBroadcast();
            console.log("Registered provider agent");
        }
        console.log("Agent ID:");
        console.logBytes32(agentId);

        vm.startBroadcast(providerKey);
        escrow.startWork(agentId);
        escrow.submitDeliverable(keccak256("ipfs://aae-native-eth-base-sepolia-deliverable"));
        vm.stopBroadcast();
        console.log("State after submit:", uint256(escrow.state()));

        vm.startBroadcast(clientKey);
        escrow.approve();
        vm.stopBroadcast();

        console.log("State after approve:", uint256(escrow.state()));
        console.log("Escrow balance final:", escrowAddr.balance);
        console.log("Fee bal after:  ", runFeeCollector.balance);
        console.log("Fee delta:      ", runFeeCollector.balance - runFeeCollectorBefore);
        console.log("Provider after: ", provider.balance);
        console.log("Provider delta: ", provider.balance - runProviderBefore);
    }

    function _feeAmount(uint256 amount) private pure returns (uint256) {
        return (amount * 170) / 10000;
    }
}
