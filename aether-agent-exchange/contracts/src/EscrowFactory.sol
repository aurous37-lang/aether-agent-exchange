// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./JobEscrow.sol";
import "./AgentRegistry.sol";

/// @title EscrowFactory — Creates per-job escrow instances as EIP-1167 minimal proxies
/// @notice Each job gets its own escrow contract (clone of JobEscrow implementation).
///         Platform multisig can pause creation and update references.
contract EscrowFactory is Ownable, Pausable {
    address public immutable escrowImplementation;
    address public feeCollector;
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
        address _feeCollector,
        address _agentRegistry,
        address _defaultArbiter
    ) Ownable(_owner) {
        require(_escrowImplementation != address(0), "EscrowFactory: zero implementation");
        require(_feeCollector != address(0), "EscrowFactory: zero fee collector");
        require(_agentRegistry != address(0), "EscrowFactory: zero registry");
        require(_defaultArbiter != address(0), "EscrowFactory: zero arbiter");

        escrowImplementation = _escrowImplementation;
        feeCollector = _feeCollector;
        agentRegistry = _agentRegistry;
        defaultArbiter = _defaultArbiter;
    }

    /// @notice Create a new escrow for a job (uses defaultArbiter as sole initial arbiter)
    /// @param jobId Unique job identifier (from backend UUID, hashed)
    /// @param client Client wallet address
    /// @param paymentToken ERC20 token used for payment
    /// @param amount Escrow amount in token units
    /// @param reviewPeriod Review period in seconds (1-30 days)
    /// @return escrow Address of the newly created escrow proxy
    function createEscrow(bytes32 jobId, address client, address paymentToken, uint256 amount, uint256 reviewPeriod)
        external
        whenNotPaused
        returns (address escrow)
    {
        address[] memory _arbiters = new address[](1);
        _arbiters[0] = defaultArbiter;
        return createEscrowWithArbiters(jobId, client, paymentToken, amount, reviewPeriod, _arbiters);
    }

    /// @notice Create a new escrow with an explicit agent acceptance deadline.
    /// @dev If the job remains FUNDED until acceptanceDeadline + 7 days, anyone can refund the client.
    function createEscrow(
        bytes32 jobId,
        address client,
        address paymentToken,
        uint256 amount,
        uint256 reviewPeriod,
        uint256 acceptanceDeadline
    ) external whenNotPaused returns (address escrow) {
        address[] memory _arbiters = new address[](1);
        _arbiters[0] = defaultArbiter;
        return
            createEscrowWithArbiters(jobId, client, paymentToken, amount, reviewPeriod, acceptanceDeadline, _arbiters);
    }

    /// @notice Create a new escrow for a job with a custom arbiter panel
    /// @param jobId Unique job identifier (from backend UUID, hashed)
    /// @param client Client wallet address
    /// @param paymentToken ERC20 token used for payment
    /// @param amount Escrow amount in token units
    /// @param reviewPeriod Review period in seconds (1-30 days)
    /// @param _arbiters Array of arbiter addresses for the dispute panel
    /// @return escrow Address of the newly created escrow proxy
    function createEscrowWithArbiters(
        bytes32 jobId,
        address client,
        address paymentToken,
        uint256 amount,
        uint256 reviewPeriod,
        address[] memory _arbiters
    ) public whenNotPaused returns (address escrow) {
        return createEscrowWithArbiters(jobId, client, paymentToken, amount, reviewPeriod, 0, _arbiters);
    }

    /// @notice Create a new escrow with a custom arbiter panel and explicit agent acceptance deadline.
    function createEscrowWithArbiters(
        bytes32 jobId,
        address client,
        address paymentToken,
        uint256 amount,
        uint256 reviewPeriod,
        uint256 acceptanceDeadline,
        address[] memory _arbiters
    ) public whenNotPaused returns (address escrow) {
        require(escrows[jobId] == address(0), "EscrowFactory: escrow exists");
        require(client != address(0), "EscrowFactory: zero client");
        require(_arbiters.length > 0, "EscrowFactory: no arbiters");

        escrow = Clones.clone(escrowImplementation);

        JobEscrow(escrow)
            .initialize(
                jobId,
                client,
                paymentToken,
                amount,
                reviewPeriod,
                acceptanceDeadline,
                feeCollector,
                agentRegistry,
                _arbiters
            );

        // Auto-authorize the new clone as a reputation updater on the registry.
        // Requires the registry's `factory` field to point at this contract
        // (set once post-deployment via AgentRegistry.setFactory). Without
        // this call, approve() would revert inside the disbursement path when
        // JobEscrow calls recordJobCompleted — the bug that blocked every
        // testnet payout before this fix.
        AgentRegistry(agentRegistry).authorizeUpdater(escrow);

        escrows[jobId] = escrow;
        escrowCount++;

        emit EscrowCreated(jobId, escrow, client, amount);
    }

    /// @notice Add an arbiter to an existing escrow (owner only)
    function addArbiterToEscrow(bytes32 jobId, address _arbiter) external onlyOwner {
        address escrow = escrows[jobId];
        require(escrow != address(0), "EscrowFactory: escrow not found");
        JobEscrow(escrow).addArbiter(_arbiter);
    }

    /// @notice Set the required vote count for an existing escrow (owner only)
    function setEscrowRequiredVotes(bytes32 jobId, uint256 _requiredVotes) external onlyOwner {
        address escrow = escrows[jobId];
        require(escrow != address(0), "EscrowFactory: escrow not found");
        JobEscrow(escrow).setRequiredVotes(_requiredVotes);
    }

    /// @notice Look up the escrow address for a job
    function getEscrow(bytes32 jobId) external view returns (address) {
        return escrows[jobId];
    }

    // ─── Admin ───────────────────────────────────────────────────────

    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "EscrowFactory: zero address");
        feeCollector = _feeCollector;
        emit FeeCollectorUpdated(_feeCollector);
    }

    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        require(_agentRegistry != address(0), "EscrowFactory: zero address");
        agentRegistry = _agentRegistry;
        emit AgentRegistryUpdated(_agentRegistry);
    }

    function setDefaultArbiter(address _defaultArbiter) external onlyOwner {
        require(_defaultArbiter != address(0), "EscrowFactory: zero address");
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
