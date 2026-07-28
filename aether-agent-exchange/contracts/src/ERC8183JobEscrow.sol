// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./FeeCollector.sol";
import "./interfaces/IERC20.sol";

/// @title ERC8183JobEscrow
/// @notice Per-job token vault controlled by ERC8183JobFactory.
contract ERC8183JobEscrow is ReentrancyGuard {
    bool private initialized;

    uint256 public jobId;
    address public factory;
    address public paymentToken;
    uint256 public escrowedAmount;

    event EscrowInitialized(uint256 indexed jobId, address indexed factory, address indexed paymentToken);
    event EscrowFunded(uint256 indexed jobId, uint256 amount);
    event EscrowReleased(uint256 indexed jobId, address indexed provider, uint256 providerAmount, uint256 platformFee);
    event EscrowRefunded(uint256 indexed jobId, address indexed client, uint256 amount);

    modifier onlyFactory() {
        require(msg.sender == factory, "ERC8183JobEscrow: not factory");
        _;
    }

    function initialize(uint256 _jobId, address _factory, address _paymentToken) external {
        require(!initialized, "ERC8183JobEscrow: already initialized");
        require(_jobId != 0, "ERC8183JobEscrow: zero job");
        require(_factory != address(0), "ERC8183JobEscrow: zero factory");
        require(_paymentToken != address(0), "ERC8183JobEscrow: zero token");

        initialized = true;
        jobId = _jobId;
        factory = _factory;
        paymentToken = _paymentToken;

        emit EscrowInitialized(_jobId, _factory, _paymentToken);
    }

    function recordFunding(uint256 amount) external onlyFactory {
        require(amount > 0, "ERC8183JobEscrow: zero amount");
        escrowedAmount += amount;
        emit EscrowFunded(jobId, amount);
    }

    function release(address provider, address feeCollector, uint256 grossAmount, uint256 platformFee)
        external
        onlyFactory
        nonReentrant
    {
        require(provider != address(0), "ERC8183JobEscrow: zero provider");
        require(grossAmount > 0, "ERC8183JobEscrow: zero amount");
        require(platformFee <= grossAmount, "ERC8183JobEscrow: fee too high");
        require(escrowedAmount >= grossAmount, "ERC8183JobEscrow: insufficient escrow");

        escrowedAmount -= grossAmount;
        uint256 providerAmount = grossAmount - platformFee;

        if (platformFee > 0) {
            IERC20(paymentToken).approve(feeCollector, platformFee);
            FeeCollector(feeCollector).collect(paymentToken, platformFee, bytes32(jobId));
        }

        bool paid = IERC20(paymentToken).transfer(provider, providerAmount);
        require(paid, "ERC8183JobEscrow: provider transfer failed");

        emit EscrowReleased(jobId, provider, providerAmount, platformFee);
    }

    function refund(address client, uint256 amount) external onlyFactory nonReentrant {
        require(client != address(0), "ERC8183JobEscrow: zero client");
        require(amount > 0, "ERC8183JobEscrow: zero amount");
        require(escrowedAmount >= amount, "ERC8183JobEscrow: insufficient escrow");

        escrowedAmount -= amount;

        bool refunded = IERC20(paymentToken).transfer(client, amount);
        require(refunded, "ERC8183JobEscrow: refund transfer failed");

        emit EscrowRefunded(jobId, client, amount);
    }
}
