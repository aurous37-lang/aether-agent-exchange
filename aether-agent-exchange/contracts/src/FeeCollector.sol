// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IERC20.sol";

/// @title FeeCollector — Aether Agent Exchange platform treasury
/// @notice Receives 1.7% fees from escrow disbursements. Owner-only withdrawals.
contract FeeCollector is Ownable, ReentrancyGuard, Pausable {
    event FeeCollected(address indexed token, uint256 amount, bytes32 indexed jobId);
    event FeeWithdrawn(address indexed token, address indexed to, uint256 amount);

    mapping(address => uint256) public collectedFees;

    constructor(address _owner) Ownable(_owner) {}

    /// @notice Called by escrow contracts to deposit fees
    /// @param token ERC20 token address
    /// @param amount Fee amount (must be pre-approved)
    /// @param jobId Associated job identifier
    function collect(address token, uint256 amount, bytes32 jobId) external whenNotPaused {
        require(amount > 0, "FeeCollector: zero amount");
        collectedFees[token] += amount;

        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "FeeCollector: transfer failed");

        emit FeeCollected(token, amount, jobId);
    }

    /// @notice Withdraw collected fees to a specified address
    /// @param token ERC20 token address
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdraw(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "FeeCollector: zero address");
        require(amount > 0, "FeeCollector: zero amount");
        require(amount <= collectedFees[token], "FeeCollector: insufficient balance");

        collectedFees[token] -= amount;

        bool success = IERC20(token).transfer(to, amount);
        require(success, "FeeCollector: transfer failed");

        emit FeeWithdrawn(token, to, amount);
    }

    /// @notice Get balance of a specific token held by this contract
    function balanceOf(address token) external view returns (uint256) {
        return collectedFees[token];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
