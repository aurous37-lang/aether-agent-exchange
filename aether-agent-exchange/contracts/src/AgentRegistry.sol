// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title AgentRegistry — On-chain identity and reputation for AI agents
/// @notice Agents register with a wallet, handler, and metadata URI.
///         Reputation counters are updated exclusively by authorized escrow contracts.
contract AgentRegistry is Ownable, Pausable {
    struct Agent {
        address wallet;
        address handler;
        string metadataURI;
        uint256 jobsCompleted;
        uint256 totalEarned;
        uint256 disputesLost;
        uint256 registeredAt;
        bool active;
        bool autonomousAccept;
    }

    /// @dev agentId => Agent. agentId is keccak256(wallet).
    mapping(bytes32 => Agent) private agents;

    /// @dev wallet => agentId for reverse lookup
    mapping(address => bytes32) public walletToAgentId;

    /// @dev Addresses authorized to update reputation (escrow contracts)
    mapping(address => bool) public authorizedUpdaters;

    /// @dev Legacy primary factory address kept for backwards-compatible reads.
    /// New deployments should use `authorizedFactories` because ERC20 and native
    /// escrows are minted by separate factory contracts.
    address public factory;

    /// @dev Factories allowed to auto-authorize newly-minted escrow clones.
    mapping(address => bool) public authorizedFactories;

    uint256 public agentCount;

    event AgentRegistered(bytes32 indexed agentId, address indexed wallet, address indexed handler, string metadataURI);
    event AgentUpdated(bytes32 indexed agentId, string metadataURI);
    event AgentStatusChanged(bytes32 indexed agentId, bool active);
    event AgentAutonomyChanged(bytes32 indexed agentId, bool autonomousAccept);
    event ReputationUpdated(bytes32 indexed agentId, uint256 jobsCompleted, uint256 totalEarned, uint256 disputesLost);
    event UpdaterAuthorized(address indexed updater);
    event UpdaterRevoked(address indexed updater);
    event FactoryUpdated(address indexed factory);

    modifier onlyHandlerOf(bytes32 agentId) {
        require(agents[agentId].handler == msg.sender, "AgentRegistry: not handler");
        _;
    }

    modifier onlyAuthorizedUpdater() {
        require(authorizedUpdaters[msg.sender], "AgentRegistry: not authorized");
        _;
    }

    constructor(address _owner) Ownable(_owner) {}

    // ─── Registration ────────────────────────────────────────────────

    /// @notice Self-register: caller becomes both wallet and handler
    function register(string calldata metadataURI) external whenNotPaused returns (bytes32 agentId) {
        return _register(msg.sender, msg.sender, metadataURI);
    }

    /// @notice Handler-register: handler registers an agent wallet they manage
    function registerAgent(address agentWallet, string calldata metadataURI)
        external
        whenNotPaused
        returns (bytes32 agentId)
    {
        return _register(agentWallet, msg.sender, metadataURI);
    }

    function _register(address wallet, address handler, string calldata metadataURI)
        internal
        returns (bytes32 agentId)
    {
        require(wallet != address(0), "AgentRegistry: zero wallet");
        require(bytes(metadataURI).length > 0, "AgentRegistry: empty metadata");

        agentId = keccak256(abi.encodePacked(wallet));
        require(agents[agentId].wallet == address(0), "AgentRegistry: already registered");

        agents[agentId] = Agent({
            wallet: wallet,
            handler: handler,
            metadataURI: metadataURI,
            jobsCompleted: 0,
            totalEarned: 0,
            disputesLost: 0,
            registeredAt: block.timestamp,
            active: true,
            autonomousAccept: false
        });

        walletToAgentId[wallet] = agentId;
        agentCount++;

        emit AgentRegistered(agentId, wallet, handler, metadataURI);
    }

    // ─── Agent Management (handler only) ─────────────────────────────

    function updateMetadata(bytes32 agentId, string calldata metadataURI) external onlyHandlerOf(agentId) {
        require(bytes(metadataURI).length > 0, "AgentRegistry: empty metadata");
        agents[agentId].metadataURI = metadataURI;
        emit AgentUpdated(agentId, metadataURI);
    }

    function setActive(bytes32 agentId, bool active) external onlyHandlerOf(agentId) {
        agents[agentId].active = active;
        emit AgentStatusChanged(agentId, active);
    }

    function setAutonomousAccept(bytes32 agentId, bool autonomous) external onlyHandlerOf(agentId) {
        agents[agentId].autonomousAccept = autonomous;
        emit AgentAutonomyChanged(agentId, autonomous);
    }

    // ─── Reputation (authorized updaters only — escrow contracts) ────

    function recordJobCompleted(bytes32 agentId, uint256 earned) external onlyAuthorizedUpdater {
        Agent storage agent = agents[agentId];
        require(agent.wallet != address(0), "AgentRegistry: agent not found");
        agent.jobsCompleted++;
        agent.totalEarned += earned;
        emit ReputationUpdated(agentId, agent.jobsCompleted, agent.totalEarned, agent.disputesLost);
    }

    function recordDisputeLost(bytes32 agentId) external onlyAuthorizedUpdater {
        Agent storage agent = agents[agentId];
        require(agent.wallet != address(0), "AgentRegistry: agent not found");
        agent.disputesLost++;
        emit ReputationUpdated(agentId, agent.jobsCompleted, agent.totalEarned, agent.disputesLost);
    }

    // ─── Updater Management ──────────────────────────────────────────

    /// @notice Authorize an address to write reputation updates.
    /// @dev Callable by either the contract owner (for manual / admin flows)
    ///      OR the registered factory (so every `createEscrow` can auto-grant
    ///      its new clone authority without a second owner transaction).
    function authorizeUpdater(address updater) external {
        require(msg.sender == owner() || authorizedFactories[msg.sender], "AgentRegistry: only owner or factory");
        require(updater != address(0), "AgentRegistry: zero address");
        authorizedUpdaters[updater] = true;
        emit UpdaterAuthorized(updater);
    }

    function revokeUpdater(address updater) external onlyOwner {
        authorizedUpdaters[updater] = false;
        emit UpdaterRevoked(updater);
    }

    /// @notice Register an escrow factory so it can self-authorize new clones.
    /// @dev Owner-only. Can be called for both ERC20 and native-token factories.
    ///      Setting to the zero address only clears the legacy primary pointer.
    function setFactory(address _factory) external onlyOwner {
        factory = _factory;
        if (_factory != address(0)) {
            authorizedFactories[_factory] = true;
        }
        emit FactoryUpdated(_factory);
    }

    function revokeFactory(address _factory) external onlyOwner {
        authorizedFactories[_factory] = false;
        if (factory == _factory) {
            factory = address(0);
            emit FactoryUpdated(address(0));
        }
    }

    // ─── Views ───────────────────────────────────────────────────────

    function getAgent(bytes32 agentId) external view returns (Agent memory) {
        require(agents[agentId].wallet != address(0), "AgentRegistry: agent not found");
        return agents[agentId];
    }

    function getAgentByWallet(address wallet) external view returns (Agent memory) {
        bytes32 agentId = walletToAgentId[wallet];
        require(agents[agentId].wallet != address(0), "AgentRegistry: agent not found");
        return agents[agentId];
    }

    function isActive(bytes32 agentId) external view returns (bool) {
        return agents[agentId].active;
    }

    function isAutonomous(bytes32 agentId) external view returns (bool) {
        return agents[agentId].autonomousAccept;
    }

    // ─── Pausability ─────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
