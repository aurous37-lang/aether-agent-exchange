// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/NativeEthJobEscrow.sol";
import "../src/NativeEthEscrowFactory.sol";
import "../src/AgentRegistry.sol";

/// @notice Deploys the separate native-token escrow implementation/factory beside existing ERC20 escrows.
/// @dev The contract name is NativeEth for EVM compatibility, but the native token is ETH on
///      Base/Ethereum and MON on Monad.
contract DeployNativeEthEscrowScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("AAE_DEPLOYER_KEY");
        address deployer = vm.addr(deployerKey);
        address payable feeRecipient = payable(vm.envOr("NATIVE_ETH_FEE_RECIPIENT", deployer));
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");
        address arbiter = vm.envOr("ARBITER_ADDRESS", deployer);

        console.log("=== AAE Native ETH Escrow Deployment ===");
        console.log("Deployer:          ", deployer);
        console.log("Native fee recipient:", feeRecipient);
        console.log("AgentRegistry:     ", agentRegistry);
        console.log("Default Arbiter:   ", arbiter);
        console.log("Chain ID:          ", block.chainid);

        vm.startBroadcast(deployerKey);
        NativeEthJobEscrow nativeImpl = new NativeEthJobEscrow();
        NativeEthEscrowFactory nativeFactory =
            new NativeEthEscrowFactory(deployer, address(nativeImpl), feeRecipient, agentRegistry, arbiter);
        AgentRegistry(agentRegistry).setFactory(address(nativeFactory));
        vm.stopBroadcast();

        console.log("NativeEthJobEscrow impl: ", address(nativeImpl));
        console.log("NativeEthEscrowFactory:  ", address(nativeFactory));
        console.log("Factory implementation:  ", nativeFactory.escrowImplementation());
        console.log("Factory fee recipient:   ", nativeFactory.feeCollector());
        console.log("Factory agentRegistry:   ", nativeFactory.agentRegistry());
        console.log("Factory defaultArbiter:  ", nativeFactory.defaultArbiter());
        console.log("Registered native factory on AgentRegistry");
    }
}
