// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./NativeEthJobEscrow.sol";
import "./AgentRegistry.sol";

/// @title NativeEthEscrowFactory — Creates native-ETH per-job escrow clones.
/// @notice Separate from ERC20 EscrowFactory so WETH/ERC20 and native ETH never share a path.
contract NativeEthEscrowFactory is Ownable, Pausable {
    address public immutable escrowImplementation;
    address payable public feeCollector;
    address public agentRegistry;
    address public defaultArbiter;

    mapping(bytes32 => address) public escrows;
    uint256 public escrowCount;

    event EscrowCreated(bytes32 indexed jobId, address escrow, address indexed client, uint256 amount);
    event FeeCollectorUpdated(address indexed newFeeCollector);
    event AgentRegistryUpdated(address indexed newAgentRegistry);
    event DefaultArbiterUpdated(address indexed newArbiter);

    constructor(
        address _owner,
        address _escrowImplementation,
        address payable _feeCollector,
        address _agentRegistry,
        address _defaultArbiter
    ) Ownable(_owner) {
        require(_escrowImplementation != address(0), "NativeEthEscrowFactory: zero implementation");
        require(_feeCollector != address(0), "NativeEthEscrowFactory: zero fee collector");
        require(_agentRegistry != address(0), "NativeEthEscrowFactory: zero registry");
        require(_defaultArbiter != address(0), "NativeEthEscrowFactory: zero arbiter");
        escrowImplementation = _escrowImplementation;
        feeCollector = _feeCollector;
        agentRegistry = _agentRegistry;
        defaultArbiter = _defaultArbiter;
    }

    function createEscrow(bytes32 jobId, address client, uint256 amount, uint256 reviewPeriod)
        external
        whenNotPaused
        returns (address escrow)
    {
        address[] memory _arbiters = new address[](1);
        _arbiters[0] = defaultArbiter;
        return createEscrowWithArbiters(jobId, client, amount, reviewPeriod, _arbiters);
    }

    function createEscrow(
        bytes32 jobId,
        address client,
        uint256 amount,
        uint256 reviewPeriod,
        uint256 acceptanceDeadline
    ) external whenNotPaused returns (address escrow) {
        address[] memory _arbiters = new address[](1);
        _arbiters[0] = defaultArbiter;
        return createEscrowWithArbiters(jobId, client, amount, reviewPeriod, acceptanceDeadline, _arbiters);
    }

    function createEscrowWithArbiters(
        bytes32 jobId,
        address client,
        uint256 amount,
        uint256 reviewPeriod,
        address[] memory _arbiters
    ) public whenNotPaused returns (address escrow) {
        return createEscrowWithArbiters(jobId, client, amount, reviewPeriod, 0, _arbiters);
    }

    function createEscrowWithArbiters(
        bytes32 jobId,
        address client,
        uint256 amount,
        uint256 reviewPeriod,
        uint256 acceptanceDeadline,
        address[] memory _arbiters
    ) public whenNotPaused returns (address escrow) {
        require(escrows[jobId] == address(0), "NativeEthEscrowFactory: escrow exists");
        require(client != address(0), "NativeEthEscrowFactory: zero client");
        require(amount > 0, "NativeEthEscrowFactory: zero amount");
        require(_arbiters.length > 0, "NativeEthEscrowFactory: no arbiters");

        escrow = Clones.clone(escrowImplementation);
        NativeEthJobEscrow(payable(escrow))
            .initialize(jobId, client, amount, reviewPeriod, acceptanceDeadline, feeCollector, agentRegistry, _arbiters);
        AgentRegistry(agentRegistry).authorizeUpdater(escrow);
        escrows[jobId] = escrow;
        escrowCount++;
        emit EscrowCreated(jobId, escrow, client, amount);
    }

    function addArbiterToEscrow(bytes32 jobId, address _arbiter) external onlyOwner {
        address escrow = escrows[jobId];
        require(escrow != address(0), "NativeEthEscrowFactory: escrow not found");
        NativeEthJobEscrow(payable(escrow)).addArbiter(_arbiter);
    }

    function setEscrowRequiredVotes(bytes32 jobId, uint256 _requiredVotes) external onlyOwner {
        address escrow = escrows[jobId];
        require(escrow != address(0), "NativeEthEscrowFactory: escrow not found");
        NativeEthJobEscrow(payable(escrow)).setRequiredVotes(_requiredVotes);
    }

    function getEscrow(bytes32 jobId) external view returns (address) {
        return escrows[jobId];
    }

    function setFeeCollector(address payable _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "NativeEthEscrowFactory: zero address");
        feeCollector = _feeCollector;
        emit FeeCollectorUpdated(_feeCollector);
    }

    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        require(_agentRegistry != address(0), "NativeEthEscrowFactory: zero address");
        agentRegistry = _agentRegistry;
        emit AgentRegistryUpdated(_agentRegistry);
    }

    function setDefaultArbiter(address _defaultArbiter) external onlyOwner {
        require(_defaultArbiter != address(0), "NativeEthEscrowFactory: zero address");
        defaultArbiter = _defaultArbiter;
        emit DefaultArbiterUpdated(_defaultArbiter);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
