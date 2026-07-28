// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20.sol";

/// @title TreasuryFeeCollector
/// @notice FeeCollector-compatible adapter that forwards ERC20 platform fees directly to treasury.
contract TreasuryFeeCollector is Ownable, Pausable, ReentrancyGuard {
    address public treasury;

    event TreasuryUpdated(address indexed treasury);
    event FeeForwarded(address indexed token, address indexed treasury, uint256 amount, bytes32 indexed jobId);

    constructor(address _owner, address _treasury) Ownable(_owner) {
        require(_treasury != address(0), "TreasuryFeeCollector: zero treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function collect(address token, uint256 amount, bytes32 jobId) external whenNotPaused nonReentrant {
        require(token != address(0), "TreasuryFeeCollector: zero token");
        require(amount > 0, "TreasuryFeeCollector: zero amount");
        bool success = IERC20(token).transferFrom(msg.sender, treasury, amount);
        require(success, "TreasuryFeeCollector: transfer failed");
        emit FeeForwarded(token, treasury, amount, jobId);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "TreasuryFeeCollector: zero treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
