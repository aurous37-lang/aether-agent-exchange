// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ERC8183JobEscrow.sol";
import "./interfaces/IACPHook.sol";
import "./interfaces/IERC20.sol";

/// @title ERC8183JobFactory
/// @notice Parallel ERC-8183-compatible job lifecycle for AAE pre-wallet flows.
contract ERC8183JobFactory is Ownable, Pausable, ReentrancyGuard {
    enum JobStatus {
        Open,
        Funded,
        Submitted,
        Completed,
        Rejected,
        Expired
    }

    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        JobStatus status;
        address hook;
        address escrow;
        bytes32 deliverable;
        bytes32 reason;
    }

    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant DEFAULT_PLATFORM_FEE_BPS = 170;

    bytes4 public constant SET_PROVIDER_SELECTOR = bytes4(keccak256("setProvider(uint256,address,bytes)"));
    bytes4 public constant SET_BUDGET_SELECTOR = bytes4(keccak256("setBudget(uint256,uint256,bytes)"));
    bytes4 public constant FUND_SELECTOR = bytes4(keccak256("fund(uint256,uint256,bytes)"));
    bytes4 public constant SUBMIT_SELECTOR = bytes4(keccak256("submit(uint256,bytes32,bytes)"));
    bytes4 public constant COMPLETE_SELECTOR = bytes4(keccak256("complete(uint256,bytes32,bytes)"));
    bytes4 public constant REJECT_SELECTOR = bytes4(keccak256("reject(uint256,bytes32,bytes)"));

    address public immutable escrowImplementation;
    address public paymentToken;
    address public feeCollector;
    uint256 public platformFeeBps;
    uint256 public jobCounter;

    mapping(uint256 => Job) public jobs;
    mapping(uint256 => address) public escrows;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 expiredAt,
        address hook
    );
    event ProviderSet(uint256 indexed jobId, address indexed provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    event JobExpired(uint256 indexed jobId);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event PlatformFeePaid(uint256 indexed jobId, address indexed feeCollector, uint256 amount);
    event FeeCollectorUpdated(address indexed feeCollector);
    event PaymentTokenUpdated(address indexed paymentToken);
    event PlatformFeeUpdated(uint256 platformFeeBps);

    constructor(address _owner, address _escrowImplementation, address _paymentToken, address _feeCollector)
        Ownable(_owner)
    {
        require(_escrowImplementation != address(0), "ERC8183JobFactory: zero implementation");
        require(_paymentToken != address(0), "ERC8183JobFactory: zero token");
        require(_feeCollector != address(0), "ERC8183JobFactory: zero fee collector");

        escrowImplementation = _escrowImplementation;
        paymentToken = _paymentToken;
        feeCollector = _feeCollector;
        platformFeeBps = DEFAULT_PLATFORM_FEE_BPS;
    }

    function createJob(address provider, address evaluator, uint256 expiredAt, string calldata description)
        external
        returns (uint256 jobId)
    {
        return createJob(provider, evaluator, expiredAt, description, address(0));
    }

    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) public whenNotPaused nonReentrant returns (uint256 jobId) {
        require(expiredAt > block.timestamp, "ERC8183JobFactory: invalid expiry");
        require(bytes(description).length > 0, "ERC8183JobFactory: empty description");
        if (evaluator == address(0)) {
            evaluator = msg.sender;
        }

        jobId = ++jobCounter;
        address escrow = Clones.clone(escrowImplementation);
        ERC8183JobEscrow(escrow).initialize(jobId, address(this), paymentToken);

        jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: 0,
            expiredAt: expiredAt,
            status: JobStatus.Open,
            hook: hook,
            escrow: escrow,
            deliverable: bytes32(0),
            reason: bytes32(0)
        });
        escrows[jobId] = escrow;

        emit JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, hook);
    }

    function setProvider(uint256 jobId, address provider) external {
        _setProvider(jobId, provider, "");
    }

    function setProvider(uint256 jobId, address provider, bytes calldata optParams) external {
        _setProvider(jobId, provider, optParams);
    }

    function setBudget(uint256 jobId, uint256 amount) external {
        _setBudget(jobId, amount, "");
    }

    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external {
        _setBudget(jobId, amount, optParams);
    }

    function fund(uint256 jobId, uint256 expectedBudget) external {
        _fund(jobId, expectedBudget, "");
    }

    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams) external {
        _fund(jobId, expectedBudget, optParams);
    }

    function submit(uint256 jobId, bytes32 deliverable) external {
        _submit(jobId, deliverable, "");
    }

    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external {
        _submit(jobId, deliverable, optParams);
    }

    function complete(uint256 jobId, bytes32 reason) external {
        _complete(jobId, reason, "");
    }

    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external {
        _complete(jobId, reason, optParams);
    }

    function reject(uint256 jobId, bytes32 reason) external {
        _reject(jobId, reason, "");
    }

    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external {
        _reject(jobId, reason, optParams);
    }

    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        require(
            job.status == JobStatus.Funded || job.status == JobStatus.Submitted, "ERC8183JobFactory: invalid status"
        );
        require(block.timestamp >= job.expiredAt, "ERC8183JobFactory: not expired");

        job.status = JobStatus.Expired;
        ERC8183JobEscrow(job.escrow).refund(job.client, job.budget);

        emit JobExpired(jobId);
        emit Refunded(jobId, job.client, job.budget);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _job(jobId);
    }

    function getEscrow(uint256 jobId) external view returns (address) {
        return _job(jobId).escrow;
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "ERC8183JobFactory: zero fee collector");
        feeCollector = _feeCollector;
        emit FeeCollectorUpdated(_feeCollector);
    }

    function setPaymentToken(address _paymentToken) external onlyOwner {
        require(_paymentToken != address(0), "ERC8183JobFactory: zero token");
        paymentToken = _paymentToken;
        emit PaymentTokenUpdated(_paymentToken);
    }

    function setPlatformFeeBps(uint256 _platformFeeBps) external onlyOwner {
        require(_platformFeeBps <= BPS_DENOMINATOR, "ERC8183JobFactory: fee too high");
        platformFeeBps = _platformFeeBps;
        emit PlatformFeeUpdated(_platformFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _setProvider(uint256 jobId, address provider, bytes memory optParams) private whenNotPaused nonReentrant {
        Job storage job = _job(jobId);
        require(job.status == JobStatus.Open, "ERC8183JobFactory: invalid status");
        require(msg.sender == job.client, "ERC8183JobFactory: unauthorized");
        require(job.provider == address(0), "ERC8183JobFactory: provider already set");
        require(provider != address(0), "ERC8183JobFactory: zero provider");

        bytes memory data = abi.encode(provider, optParams);
        _beforeHook(job, jobId, SET_PROVIDER_SELECTOR, data);

        job.provider = provider;
        emit ProviderSet(jobId, provider);

        _afterHook(job, jobId, SET_PROVIDER_SELECTOR, data);
    }

    function _setBudget(uint256 jobId, uint256 amount, bytes memory optParams) private whenNotPaused nonReentrant {
        Job storage job = _job(jobId);
        require(job.status == JobStatus.Open, "ERC8183JobFactory: invalid status");
        require(msg.sender == job.client || msg.sender == job.provider, "ERC8183JobFactory: unauthorized");
        require(amount > 0, "ERC8183JobFactory: zero budget");

        bytes memory data = abi.encode(amount, optParams);
        _beforeHook(job, jobId, SET_BUDGET_SELECTOR, data);

        job.budget = amount;
        emit BudgetSet(jobId, amount);

        _afterHook(job, jobId, SET_BUDGET_SELECTOR, data);
    }

    function _fund(uint256 jobId, uint256 expectedBudget, bytes memory optParams) private whenNotPaused nonReentrant {
        Job storage job = _job(jobId);
        require(job.status == JobStatus.Open, "ERC8183JobFactory: invalid status");
        require(msg.sender == job.client, "ERC8183JobFactory: unauthorized");
        require(job.provider != address(0), "ERC8183JobFactory: provider not set");
        require(job.budget > 0, "ERC8183JobFactory: zero budget");
        require(job.budget == expectedBudget, "ERC8183JobFactory: budget mismatch");
        require(block.timestamp < job.expiredAt, "ERC8183JobFactory: expired");

        _beforeHook(job, jobId, FUND_SELECTOR, optParams);

        job.status = JobStatus.Funded;

        bool funded = IERC20(paymentToken).transferFrom(job.client, job.escrow, job.budget);
        require(funded, "ERC8183JobFactory: funding transfer failed");
        ERC8183JobEscrow(job.escrow).recordFunding(job.budget);

        emit JobFunded(jobId, job.client, job.budget);

        _afterHook(job, jobId, FUND_SELECTOR, optParams);
    }

    function _submit(uint256 jobId, bytes32 deliverable, bytes memory optParams) private whenNotPaused nonReentrant {
        Job storage job = _job(jobId);
        require(job.status == JobStatus.Funded, "ERC8183JobFactory: invalid status");
        require(msg.sender == job.provider, "ERC8183JobFactory: unauthorized");
        require(deliverable != bytes32(0), "ERC8183JobFactory: empty deliverable");
        require(block.timestamp < job.expiredAt, "ERC8183JobFactory: expired");

        bytes memory data = abi.encode(deliverable, optParams);
        _beforeHook(job, jobId, SUBMIT_SELECTOR, data);

        job.status = JobStatus.Submitted;
        job.deliverable = deliverable;
        emit JobSubmitted(jobId, job.provider, deliverable);

        _afterHook(job, jobId, SUBMIT_SELECTOR, data);
    }

    function _complete(uint256 jobId, bytes32 reason, bytes memory optParams) private whenNotPaused nonReentrant {
        Job storage job = _job(jobId);
        require(job.status == JobStatus.Submitted, "ERC8183JobFactory: invalid status");
        require(msg.sender == job.evaluator, "ERC8183JobFactory: unauthorized");
        require(block.timestamp < job.expiredAt, "ERC8183JobFactory: expired");

        bytes memory data = abi.encode(reason, optParams);
        _beforeHook(job, jobId, COMPLETE_SELECTOR, data);

        job.status = JobStatus.Completed;
        job.reason = reason;

        uint256 fee = (job.budget * platformFeeBps) / BPS_DENOMINATOR;
        uint256 providerAmount = job.budget - fee;
        ERC8183JobEscrow(job.escrow).release(job.provider, feeCollector, job.budget, fee);

        emit JobCompleted(jobId, job.evaluator, reason);
        emit PaymentReleased(jobId, job.provider, providerAmount);
        if (fee > 0) {
            emit PlatformFeePaid(jobId, feeCollector, fee);
        }

        _afterHook(job, jobId, COMPLETE_SELECTOR, data);
    }

    function _reject(uint256 jobId, bytes32 reason, bytes memory optParams) private whenNotPaused nonReentrant {
        Job storage job = _job(jobId);
        require(
            job.status == JobStatus.Open || job.status == JobStatus.Funded || job.status == JobStatus.Submitted,
            "ERC8183JobFactory: invalid status"
        );
        if (job.status == JobStatus.Open) {
            require(msg.sender == job.client, "ERC8183JobFactory: unauthorized");
        } else {
            require(msg.sender == job.evaluator, "ERC8183JobFactory: unauthorized");
            require(block.timestamp < job.expiredAt, "ERC8183JobFactory: expired");
        }

        bytes memory data = abi.encode(reason, optParams);
        _beforeHook(job, jobId, REJECT_SELECTOR, data);

        JobStatus priorStatus = job.status;
        job.status = JobStatus.Rejected;
        job.reason = reason;

        if (priorStatus == JobStatus.Funded || priorStatus == JobStatus.Submitted) {
            ERC8183JobEscrow(job.escrow).refund(job.client, job.budget);
            emit Refunded(jobId, job.client, job.budget);
        }

        emit JobRejected(jobId, msg.sender, reason);

        _afterHook(job, jobId, REJECT_SELECTOR, data);
    }

    function _job(uint256 jobId) private view returns (Job storage job) {
        job = jobs[jobId];
        require(job.id != 0, "ERC8183JobFactory: invalid job");
    }

    function _beforeHook(Job storage job, uint256 jobId, bytes4 selector, bytes memory data) private {
        if (job.hook != address(0)) {
            IACPHook(job.hook).beforeAction(jobId, selector, data);
        }
    }

    function _afterHook(Job storage job, uint256 jobId, bytes4 selector, bytes memory data) private {
        if (job.hook != address(0)) {
            IACPHook(job.hook).afterAction(jobId, selector, data);
        }
    }
}
