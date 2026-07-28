// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/interfaces/IACPHook.sol";

contract MockACPHook is IACPHook {
    bool public revertBefore;
    bool public revertAfter;
    uint256 public beforeCount;
    uint256 public afterCount;
    uint256 public lastJobId;
    bytes4 public lastSelector;
    bytes public lastData;

    function setRevertBefore(bool value) external {
        revertBefore = value;
    }

    function setRevertAfter(bool value) external {
        revertAfter = value;
    }

    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external {
        require(!revertBefore, "MockACPHook: before blocked");
        beforeCount++;
        lastJobId = jobId;
        lastSelector = selector;
        lastData = data;
    }

    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external {
        require(!revertAfter, "MockACPHook: after blocked");
        afterCount++;
        lastJobId = jobId;
        lastSelector = selector;
        lastData = data;
    }
}
