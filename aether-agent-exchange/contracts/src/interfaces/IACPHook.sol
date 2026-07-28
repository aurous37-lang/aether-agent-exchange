// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8183 Agentic Commerce Protocol hook interface.
interface IACPHook {
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
}
