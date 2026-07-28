// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/TreasuryFeeCollector.sol";
import "../src/EscrowFactory.sol";
import "../src/ERC8183JobFactory.sol";

/// @notice Dry-run helper for treasury fee collector deployments and factory updates.
/// @dev This script only logs deployment parameters and calldata. It does not broadcast.
contract PrepareTreasuryFeeCollectorTxs is Script {
    function run() external view {
        address owner = vm.envAddress("AAE_CONTRACT_OWNER");
        address treasury = vm.envAddress("AAE_TREASURY_ADDRESS");
        address escrowFactory = vm.envAddress("ESCROW_FACTORY_ADDRESS");
        address erc8183Factory = vm.envOr("ERC8183_FACTORY_ADDRESS", address(0));

        bytes memory constructorArgs = abi.encode(owner, treasury);
        bytes memory creationCode = abi.encodePacked(type(TreasuryFeeCollector).creationCode, constructorArgs);

        console.log("=== TreasuryFeeCollector tx prep ===");
        console.log("Chain ID:             ", block.chainid);
        console.log("Owner:                ", owner);
        console.log("Treasury:             ", treasury);
        console.log("EscrowFactory:        ", escrowFactory);
        console.log("ERC8183Factory:       ", erc8183Factory);
        console.log("Creation code hash:");
        console.logBytes32(keccak256(creationCode));
        console.log("Constructor args:");
        console.logBytes(constructorArgs);
        console.log("");
        console.log("Deploy TreasuryFeeCollector(owner, treasury), then use the deployed address below.");

        address deployedTreasuryCollector = vm.envOr("TREASURY_FEE_COLLECTOR_ADDRESS", address(0));
        if (deployedTreasuryCollector != address(0)) {
            console.log("");
            console.log("=== Factory update calldata ===");
            console.log("TreasuryFeeCollector: ", deployedTreasuryCollector);
            console.log("EscrowFactory target: ", escrowFactory);
            console.log("EscrowFactory.setFeeCollector calldata:");
            console.logBytes(abi.encodeCall(EscrowFactory.setFeeCollector, (deployedTreasuryCollector)));
            if (erc8183Factory != address(0)) {
                console.log("ERC8183Factory target:", erc8183Factory);
                console.log("ERC8183Factory.setFeeCollector calldata:");
                console.logBytes(abi.encodeCall(ERC8183JobFactory.setFeeCollector, (deployedTreasuryCollector)));
            }
        }
    }
}
