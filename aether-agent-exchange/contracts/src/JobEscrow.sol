// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20.sol";
import "./FeeCollector.sol";
import "./AgentRegistry.sol";

/// @title JobEscrow — Holds funds for a single job on Aether Agent Exchange
/// @notice State machine: FUNDED → IN_PROGRESS → PENDING_REVIEW → COMPLETED | DISPUTED → RESOLVED
/// @dev Created as minimal proxy (EIP-1167) by EscrowFactory. Initialize once via initialize().
contract JobEscrow is ReentrancyGuard {
    enum State {
        UNFUNDED,
        FUNDED,
        IN_PROGRESS,
        PENDING_REVIEW,
        COMPLETED,
        DISPUTED,
        RESOLVED,
        CANCELLED
    }

    // ─── Storage ─────────────────────────────────────────────────────

    bool private initialized;

    bytes32 public jobId;
    address public client;
    address public paymentToken;
    uint256 public escrowAmount;
    State public state;

    bytes32 public agentId;
    address public agentWallet;
    bytes32 public deliverableHash;

    uint256 public reviewDeadline;
    uint256 public reviewPeriod;
    uint256 public acceptanceDeadline;

    // Multi-arbiter panel
    address[] public arbiters;
    uint256 public requiredVotes;
    mapping(address => bool) public isArbiterMap;
    mapping(address => bool) public hasVoted;
    mapping(address => uint256) public arbiterVotes;
    uint256 public voteCount;

    string public disputeReason;

    FeeCollector public feeCollector;
    AgentRegistry public agentRegistry;
    address public factory;

    // ─── Constants ───────────────────────────────────────────────────

    uint256 public constant PLATFORM_FEE_BPS = 170; // 1.7%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_REVIEW_PERIOD = 1 days;
    uint256 public constant MAX_REVIEW_PERIOD = 30 days;
    uint256 public constant ACCEPTANCE_TIMEOUT_GRACE_PERIOD = 7 days;

    // ─── Events ──────────────────────────────────────────────────────

    event EscrowFunded(bytes32 indexed jobId, address indexed client, uint256 amount);
    event WorkStarted(bytes32 indexed jobId, bytes32 indexed agentId);
    event DeliverableSubmitted(bytes32 indexed jobId, bytes32 deliverableHash);
    event JobApproved(bytes32 indexed jobId, uint256 agentPayout, uint256 platformFee);
    event JobAutoReleased(bytes32 indexed jobId, uint256 agentPayout, uint256 platformFee);
    event DisputeOpened(bytes32 indexed jobId, address indexed disputedBy, string reason);
    event DisputeResolved(
        bytes32 indexed jobId, address indexed recipient, uint256 recipientAmount, uint256 otherAmount
    );
    event ArbiterVoteCast(bytes32 indexed jobId, address indexed arbiter, uint256 agentBps, uint256 currentVoteCount);
    event ArbiterAdded(bytes32 indexed jobId, address indexed arbiter);
    event JobCancelled(bytes32 indexed jobId);
    event AcceptanceTimeoutRefunded(bytes32 indexed jobId, address indexed client, uint256 amount);

    // ─── Modifiers ───────────────────────────────────────────────────

    modifier onlyClient() {
        require(msg.sender == client, "JobEscrow: not client");
        _;
    }

    modifier onlyAgentOrHandler() {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        require(msg.sender == agent.wallet || msg.sender == agent.handler, "JobEscrow: not agent or handler");
        _;
    }

    modifier onlyArbiter() {
        require(isArbiterMap[msg.sender], "JobEscrow: not arbiter");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "JobEscrow: not factory");
        _;
    }

    modifier inState(State _state) {
        require(state == _state, "JobEscrow: invalid state");
        _;
    }

    // ─── Initialization (called once by factory) ─────────────────────

    function initialize(
        bytes32 _jobId,
        address _client,
        address _paymentToken,
        uint256 _amount,
        uint256 _reviewPeriod,
        uint256 _acceptanceDeadline,
        address _feeCollector,
        address _agentRegistry,
        address[] memory _arbiters
    ) external {
        require(!initialized, "JobEscrow: already initialized");
        require(_client != address(0), "JobEscrow: zero client");
        require(_paymentToken != address(0), "JobEscrow: zero token");
        require(_amount > 0, "JobEscrow: zero amount");
        require(
            _reviewPeriod >= MIN_REVIEW_PERIOD && _reviewPeriod <= MAX_REVIEW_PERIOD, "JobEscrow: invalid review period"
        );
        require(
            _acceptanceDeadline == 0 || _acceptanceDeadline > block.timestamp, "JobEscrow: invalid acceptance deadline"
        );
        require(_feeCollector != address(0), "JobEscrow: zero fee collector");
        require(_agentRegistry != address(0), "JobEscrow: zero registry");
        require(_arbiters.length > 0, "JobEscrow: no arbiters");

        initialized = true;
        factory = msg.sender;
        jobId = _jobId;
        client = _client;
        paymentToken = _paymentToken;
        escrowAmount = _amount;
        reviewPeriod = _reviewPeriod;
        acceptanceDeadline = _acceptanceDeadline;
        feeCollector = FeeCollector(_feeCollector);
        agentRegistry = AgentRegistry(_agentRegistry);

        for (uint256 i = 0; i < _arbiters.length; i++) {
            require(_arbiters[i] != address(0), "JobEscrow: zero arbiter");
            require(!isArbiterMap[_arbiters[i]], "JobEscrow: duplicate arbiter");
            arbiters.push(_arbiters[i]);
            isArbiterMap[_arbiters[i]] = true;
        }

        // Default: require 3 votes, or all arbiters if fewer than 3
        requiredVotes = _arbiters.length >= 3 ? 3 : _arbiters.length;

        state = State.UNFUNDED;
    }

    // ─── Client Actions ──────────────────────────────────────────────

    /// @notice Client deposits payment tokens into escrow
    function fund() external onlyClient inState(State.UNFUNDED) nonReentrant {
        bool success = IERC20(paymentToken).transferFrom(client, address(this), escrowAmount);
        require(success, "JobEscrow: funding transfer failed");
        state = State.FUNDED;
        emit EscrowFunded(jobId, client, escrowAmount);
    }

    /// @notice Client approves deliverable and triggers payout
    function approve() external onlyClient inState(State.PENDING_REVIEW) nonReentrant {
        _disburse();
        state = State.COMPLETED;
    }

    /// @notice Client cancels job (only before agent accepts)
    function cancel() external onlyClient inState(State.FUNDED) nonReentrant {
        state = State.CANCELLED;
        bool success = IERC20(paymentToken).transfer(client, escrowAmount);
        require(success, "JobEscrow: refund failed");
        emit JobCancelled(jobId);
    }

    /// @notice Anyone can refund the client if no agent accepts before the configured deadline plus grace period.
    function refundAfterAcceptanceTimeout() external inState(State.FUNDED) nonReentrant {
        require(acceptanceDeadline != 0, "JobEscrow: no acceptance deadline");
        require(
            block.timestamp >= acceptanceDeadline + ACCEPTANCE_TIMEOUT_GRACE_PERIOD,
            "JobEscrow: acceptance timeout active"
        );

        state = State.CANCELLED;
        bool success = IERC20(paymentToken).transfer(client, escrowAmount);
        require(success, "JobEscrow: refund failed");
        emit JobCancelled(jobId);
        emit AcceptanceTimeoutRefunded(jobId, client, escrowAmount);
    }

    // ─── Agent/Handler Actions ───────────────────────────────────────

    /// @notice Agent or handler accepts the job and starts work
    function startWork(bytes32 _agentId) external inState(State.FUNDED) {
        require(acceptanceDeadline == 0 || block.timestamp <= acceptanceDeadline, "JobEscrow: acceptance expired");

        AgentRegistry.Agent memory agent = agentRegistry.getAgent(_agentId);
        require(agent.active, "JobEscrow: agent not active");

        bool isAgent = msg.sender == agent.wallet;
        bool isHandler = msg.sender == agent.handler;
        require(isAgent || isHandler, "JobEscrow: unauthorized");

        if (isAgent && agent.wallet != agent.handler) {
            require(agent.autonomousAccept, "JobEscrow: autonomous accept disabled");
        }

        agentId = _agentId;
        agentWallet = agent.wallet;
        state = State.IN_PROGRESS;
        emit WorkStarted(jobId, _agentId);
    }

    /// @notice Submit deliverable hash (IPFS/Arweave CID), moves to review
    function submitDeliverable(bytes32 _deliverableHash) external onlyAgentOrHandler inState(State.IN_PROGRESS) {
        require(_deliverableHash != bytes32(0), "JobEscrow: empty hash");
        deliverableHash = _deliverableHash;
        reviewDeadline = block.timestamp + reviewPeriod;
        state = State.PENDING_REVIEW;
        emit DeliverableSubmitted(jobId, _deliverableHash);
    }

    // ─── Auto-Release ────────────────────────────────────────────────

    /// @notice Anyone can trigger auto-release after review deadline passes
    function autoRelease() external inState(State.PENDING_REVIEW) nonReentrant {
        require(block.timestamp >= reviewDeadline, "JobEscrow: review period active");
        _disburse();
        state = State.COMPLETED;
        emit JobAutoReleased(jobId, _agentAmount(escrowAmount), _feeAmount(escrowAmount));
    }

    // ─── Disputes ────────────────────────────────────────────────────

    /// @notice Either client or agent/handler can open a dispute
    function dispute(string calldata reason) external {
        require(
            state == State.IN_PROGRESS || state == State.PENDING_REVIEW, "JobEscrow: cannot dispute in current state"
        );

        bool isClient = msg.sender == client;
        bool isAgentSide = false;

        if (agentId != bytes32(0)) {
            AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
            isAgentSide = msg.sender == agent.wallet || msg.sender == agent.handler;
        }

        require(isClient || isAgentSide, "JobEscrow: unauthorized");
        require(bytes(reason).length > 0, "JobEscrow: empty reason");

        state = State.DISPUTED;
        disputeReason = reason;
        emit DisputeOpened(jobId, msg.sender, reason);
    }

    /// @notice Arbiter casts vote to resolve dispute. When requiredVotes are reached, funds are disbursed.
    /// @param agentBps Basis points (0-10000) of escrow to send to agent
    function resolve(uint256 agentBps) external onlyArbiter inState(State.DISPUTED) nonReentrant {
        require(agentBps <= BPS_DENOMINATOR, "JobEscrow: invalid split");
        require(!hasVoted[msg.sender], "JobEscrow: already voted");

        // Record vote
        hasVoted[msg.sender] = true;
        arbiterVotes[msg.sender] = agentBps;
        voteCount++;

        emit ArbiterVoteCast(jobId, msg.sender, agentBps, voteCount);

        // If quorum not yet reached, just return
        if (voteCount < requiredVotes) {
            return;
        }

        // Quorum reached — compute average agentBps across all votes cast
        uint256 totalBps = 0;
        for (uint256 i = 0; i < arbiters.length; i++) {
            if (hasVoted[arbiters[i]]) {
                totalBps += arbiterVotes[arbiters[i]];
            }
        }
        uint256 avgBps = totalBps / voteCount;

        state = State.RESOLVED;

        uint256 toAgent = (escrowAmount * avgBps) / BPS_DENOMINATOR;
        uint256 toClient = escrowAmount - toAgent;

        if (toAgent > 0) {
            uint256 fee = (toAgent * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            uint256 agentNet = toAgent - fee;

            if (fee > 0) {
                IERC20(paymentToken).approve(address(feeCollector), fee);
                feeCollector.collect(paymentToken, fee, jobId);
            }

            bool s1 = IERC20(paymentToken).transfer(agentWallet, agentNet);
            require(s1, "JobEscrow: agent transfer failed");

            if (avgBps == BPS_DENOMINATOR) {
                agentRegistry.recordJobCompleted(agentId, toAgent);
            }
        }

        if (toClient > 0) {
            bool s2 = IERC20(paymentToken).transfer(client, toClient);
            require(s2, "JobEscrow: client transfer failed");
        }

        if (avgBps < BPS_DENOMINATOR && agentId != bytes32(0)) {
            agentRegistry.recordDisputeLost(agentId);
        }

        emit DisputeResolved(jobId, agentWallet, toAgent, toClient);
    }

    // ─── Internal ────────────────────────────────────────────────────

    function _disburse() internal {
        uint256 fee = _feeAmount(escrowAmount);
        uint256 payout = _agentAmount(escrowAmount);

        IERC20(paymentToken).approve(address(feeCollector), fee);
        feeCollector.collect(paymentToken, fee, jobId);

        bool success = IERC20(paymentToken).transfer(agentWallet, payout);
        require(success, "JobEscrow: payout transfer failed");

        agentRegistry.recordJobCompleted(agentId, escrowAmount);

        emit JobApproved(jobId, payout, fee);
    }

    function _feeAmount(uint256 amount) internal pure returns (uint256) {
        return (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
    }

    function _agentAmount(uint256 amount) internal pure returns (uint256) {
        return amount - _feeAmount(amount);
    }

    // ─── Arbiter Management ─────────────────────────────────────────

    /// @notice Factory can add an arbiter post-creation (before dispute resolution)
    function addArbiter(address _arbiter) external onlyFactory {
        require(_arbiter != address(0), "JobEscrow: zero arbiter");
        require(!isArbiterMap[_arbiter], "JobEscrow: already arbiter");
        require(state != State.RESOLVED, "JobEscrow: already resolved");

        arbiters.push(_arbiter);
        isArbiterMap[_arbiter] = true;

        emit ArbiterAdded(jobId, _arbiter);
    }

    /// @notice Set the required number of votes for quorum
    function setRequiredVotes(uint256 _requiredVotes) external onlyFactory {
        require(_requiredVotes > 0, "JobEscrow: zero votes");
        require(_requiredVotes <= arbiters.length, "JobEscrow: exceeds arbiter count");
        require(state != State.RESOLVED, "JobEscrow: already resolved");
        requiredVotes = _requiredVotes;
    }

    /// @notice Check if an address is a registered arbiter
    function isArbiter(address _addr) external view returns (bool) {
        return isArbiterMap[_addr];
    }

    /// @notice Get the full list of arbiters
    function getArbiters() external view returns (address[] memory) {
        return arbiters;
    }

    /// @notice Get the number of arbiters
    function arbiterCount() external view returns (uint256) {
        return arbiters.length;
    }

    // ─── Views ───────────────────────────────────────────────────────

    function getState() external view returns (State) {
        return state;
    }

    function getDetails()
        external
        view
        returns (
            bytes32 _jobId,
            address _client,
            address _paymentToken,
            uint256 _escrowAmount,
            State _state,
            bytes32 _agentId,
            address _agentWallet,
            bytes32 _deliverableHash,
            uint256 _reviewDeadline
        )
    {
        return (jobId, client, paymentToken, escrowAmount, state, agentId, agentWallet, deliverableHash, reviewDeadline);
    }
}
