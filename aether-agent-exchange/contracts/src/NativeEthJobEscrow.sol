// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AgentRegistry.sol";

/// @title NativeEthJobEscrow — Holds native ETH for a single AAE job
/// @notice Separate payable path for native ETH. WETH/ERC20 assets must use JobEscrow.
contract NativeEthJobEscrow is ReentrancyGuard {
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

    bool private initialized;

    bytes32 public jobId;
    address public client;
    uint256 public escrowAmount;
    State public state;

    bytes32 public agentId;
    address public agentWallet;
    bytes32 public deliverableHash;

    uint256 public reviewDeadline;
    uint256 public reviewPeriod;
    uint256 public acceptanceDeadline;

    address[] public arbiters;
    uint256 public requiredVotes;
    mapping(address => bool) public isArbiterMap;
    mapping(address => bool) public hasVoted;
    mapping(address => uint256) public arbiterVotes;
    uint256 public voteCount;

    string public disputeReason;

    address payable public feeCollector;
    AgentRegistry public agentRegistry;
    address public factory;

    uint256 public constant PLATFORM_FEE_BPS = 170;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_REVIEW_PERIOD = 1 days;
    uint256 public constant MAX_REVIEW_PERIOD = 30 days;
    uint256 public constant ACCEPTANCE_TIMEOUT_GRACE_PERIOD = 7 days;

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
    event NativeFeePaid(bytes32 indexed jobId, address indexed feeCollector, uint256 amount);

    modifier onlyClient() {
        require(msg.sender == client, "NativeEthJobEscrow: not client");
        _;
    }

    modifier onlyAgentOrHandler() {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        require(msg.sender == agent.wallet || msg.sender == agent.handler, "NativeEthJobEscrow: not agent or handler");
        _;
    }

    modifier onlyArbiter() {
        require(isArbiterMap[msg.sender], "NativeEthJobEscrow: not arbiter");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "NativeEthJobEscrow: not factory");
        _;
    }

    modifier inState(State _state) {
        require(state == _state, "NativeEthJobEscrow: invalid state");
        _;
    }

    function initialize(
        bytes32 _jobId,
        address _client,
        uint256 _amount,
        uint256 _reviewPeriod,
        uint256 _acceptanceDeadline,
        address payable _feeCollector,
        address _agentRegistry,
        address[] memory _arbiters
    ) external {
        require(!initialized, "NativeEthJobEscrow: already initialized");
        require(_client != address(0), "NativeEthJobEscrow: zero client");
        require(_amount > 0, "NativeEthJobEscrow: zero amount");
        require(
            _reviewPeriod >= MIN_REVIEW_PERIOD && _reviewPeriod <= MAX_REVIEW_PERIOD,
            "NativeEthJobEscrow: invalid review period"
        );
        require(
            _acceptanceDeadline == 0 || _acceptanceDeadline > block.timestamp,
            "NativeEthJobEscrow: invalid acceptance deadline"
        );
        require(_feeCollector != address(0), "NativeEthJobEscrow: zero fee collector");
        require(_agentRegistry != address(0), "NativeEthJobEscrow: zero registry");
        require(_arbiters.length > 0, "NativeEthJobEscrow: no arbiters");

        initialized = true;
        factory = msg.sender;
        jobId = _jobId;
        client = _client;
        escrowAmount = _amount;
        reviewPeriod = _reviewPeriod;
        acceptanceDeadline = _acceptanceDeadline;
        feeCollector = _feeCollector;
        agentRegistry = AgentRegistry(_agentRegistry);

        for (uint256 i = 0; i < _arbiters.length; i++) {
            require(_arbiters[i] != address(0), "NativeEthJobEscrow: zero arbiter");
            require(!isArbiterMap[_arbiters[i]], "NativeEthJobEscrow: duplicate arbiter");
            arbiters.push(_arbiters[i]);
            isArbiterMap[_arbiters[i]] = true;
        }
        requiredVotes = _arbiters.length >= 3 ? 3 : _arbiters.length;
        state = State.UNFUNDED;
    }

    receive() external payable {
        revert("NativeEthJobEscrow: use fund");
    }

    function fund() external payable onlyClient inState(State.UNFUNDED) nonReentrant {
        require(msg.value == escrowAmount, "NativeEthJobEscrow: value mismatch");
        state = State.FUNDED;
        emit EscrowFunded(jobId, client, escrowAmount);
    }

    function approve() external onlyClient inState(State.PENDING_REVIEW) nonReentrant {
        _disburse();
        state = State.COMPLETED;
    }

    function cancel() external onlyClient inState(State.FUNDED) nonReentrant {
        state = State.CANCELLED;
        _send(payable(client), escrowAmount, "NativeEthJobEscrow: refund failed");
        emit JobCancelled(jobId);
    }

    function refundAfterAcceptanceTimeout() external inState(State.FUNDED) nonReentrant {
        require(acceptanceDeadline != 0, "NativeEthJobEscrow: no acceptance deadline");
        require(
            block.timestamp >= acceptanceDeadline + ACCEPTANCE_TIMEOUT_GRACE_PERIOD,
            "NativeEthJobEscrow: acceptance timeout active"
        );
        state = State.CANCELLED;
        _send(payable(client), escrowAmount, "NativeEthJobEscrow: refund failed");
        emit JobCancelled(jobId);
        emit AcceptanceTimeoutRefunded(jobId, client, escrowAmount);
    }

    function startWork(bytes32 _agentId) external inState(State.FUNDED) {
        require(
            acceptanceDeadline == 0 || block.timestamp <= acceptanceDeadline, "NativeEthJobEscrow: acceptance expired"
        );
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(_agentId);
        require(agent.active, "NativeEthJobEscrow: agent not active");
        bool isAgent = msg.sender == agent.wallet;
        bool isHandler = msg.sender == agent.handler;
        require(isAgent || isHandler, "NativeEthJobEscrow: unauthorized");
        if (isAgent && agent.wallet != agent.handler) {
            require(agent.autonomousAccept, "NativeEthJobEscrow: autonomous accept disabled");
        }
        agentId = _agentId;
        agentWallet = agent.wallet;
        state = State.IN_PROGRESS;
        emit WorkStarted(jobId, _agentId);
    }

    function submitDeliverable(bytes32 _deliverableHash) external onlyAgentOrHandler inState(State.IN_PROGRESS) {
        require(_deliverableHash != bytes32(0), "NativeEthJobEscrow: empty hash");
        deliverableHash = _deliverableHash;
        reviewDeadline = block.timestamp + reviewPeriod;
        state = State.PENDING_REVIEW;
        emit DeliverableSubmitted(jobId, _deliverableHash);
    }

    function autoRelease() external inState(State.PENDING_REVIEW) nonReentrant {
        require(block.timestamp >= reviewDeadline, "NativeEthJobEscrow: review period active");
        _disburse();
        state = State.COMPLETED;
        emit JobAutoReleased(jobId, _agentAmount(escrowAmount), _feeAmount(escrowAmount));
    }

    function dispute(string calldata reason) external {
        require(
            state == State.IN_PROGRESS || state == State.PENDING_REVIEW,
            "NativeEthJobEscrow: cannot dispute in current state"
        );
        bool isClient = msg.sender == client;
        bool isAgentSide = false;
        if (agentId != bytes32(0)) {
            AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
            isAgentSide = msg.sender == agent.wallet || msg.sender == agent.handler;
        }
        require(isClient || isAgentSide, "NativeEthJobEscrow: unauthorized");
        require(bytes(reason).length > 0, "NativeEthJobEscrow: empty reason");
        state = State.DISPUTED;
        disputeReason = reason;
        emit DisputeOpened(jobId, msg.sender, reason);
    }

    function resolve(uint256 agentBps) external onlyArbiter inState(State.DISPUTED) nonReentrant {
        require(agentBps <= BPS_DENOMINATOR, "NativeEthJobEscrow: invalid split");
        require(!hasVoted[msg.sender], "NativeEthJobEscrow: already voted");
        hasVoted[msg.sender] = true;
        arbiterVotes[msg.sender] = agentBps;
        voteCount++;
        emit ArbiterVoteCast(jobId, msg.sender, agentBps, voteCount);
        if (voteCount < requiredVotes) return;

        uint256 totalBps = 0;
        for (uint256 i = 0; i < arbiters.length; i++) {
            if (hasVoted[arbiters[i]]) totalBps += arbiterVotes[arbiters[i]];
        }
        uint256 avgBps = totalBps / voteCount;
        state = State.RESOLVED;

        uint256 toAgent = (escrowAmount * avgBps) / BPS_DENOMINATOR;
        uint256 toClient = escrowAmount - toAgent;
        if (toAgent > 0) {
            uint256 fee = (toAgent * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            uint256 agentNet = toAgent - fee;
            if (fee > 0) {
                _send(feeCollector, fee, "NativeEthJobEscrow: fee transfer failed");
                emit NativeFeePaid(jobId, feeCollector, fee);
            }
            _send(payable(agentWallet), agentNet, "NativeEthJobEscrow: agent transfer failed");
            if (avgBps == BPS_DENOMINATOR) agentRegistry.recordJobCompleted(agentId, toAgent);
        }
        if (toClient > 0) _send(payable(client), toClient, "NativeEthJobEscrow: client transfer failed");
        if (avgBps < BPS_DENOMINATOR && agentId != bytes32(0)) agentRegistry.recordDisputeLost(agentId);
        emit DisputeResolved(jobId, agentWallet, toAgent, toClient);
    }

    function addArbiter(address _arbiter) external onlyFactory {
        require(_arbiter != address(0), "NativeEthJobEscrow: zero arbiter");
        require(!isArbiterMap[_arbiter], "NativeEthJobEscrow: already arbiter");
        require(state != State.RESOLVED, "NativeEthJobEscrow: already resolved");
        arbiters.push(_arbiter);
        isArbiterMap[_arbiter] = true;
        emit ArbiterAdded(jobId, _arbiter);
    }

    function setRequiredVotes(uint256 _requiredVotes) external onlyFactory {
        require(_requiredVotes > 0, "NativeEthJobEscrow: zero votes");
        require(_requiredVotes <= arbiters.length, "NativeEthJobEscrow: exceeds arbiter count");
        require(state != State.RESOLVED, "NativeEthJobEscrow: already resolved");
        requiredVotes = _requiredVotes;
    }

    function isArbiter(address _addr) external view returns (bool) {
        return isArbiterMap[_addr];
    }

    function arbiterCount() external view returns (uint256) {
        return arbiters.length;
    }

    function getArbiters() external view returns (address[] memory) {
        return arbiters;
    }

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
        return (jobId, client, address(0), escrowAmount, state, agentId, agentWallet, deliverableHash, reviewDeadline);
    }

    function _disburse() internal {
        uint256 fee = _feeAmount(escrowAmount);
        uint256 payout = _agentAmount(escrowAmount);
        if (fee > 0) {
            _send(feeCollector, fee, "NativeEthJobEscrow: fee transfer failed");
            emit NativeFeePaid(jobId, feeCollector, fee);
        }
        _send(payable(agentWallet), payout, "NativeEthJobEscrow: payout transfer failed");
        agentRegistry.recordJobCompleted(agentId, escrowAmount);
        emit JobApproved(jobId, payout, fee);
    }

    function _feeAmount(uint256 amount) internal pure returns (uint256) {
        return (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
    }

    function _agentAmount(uint256 amount) internal pure returns (uint256) {
        return amount - _feeAmount(amount);
    }

    function _send(address payable recipient, uint256 amount, string memory errorMessage) internal {
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, errorMessage);
    }
}
