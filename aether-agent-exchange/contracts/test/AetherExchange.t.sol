// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FeeCollector.sol";
import "../src/TreasuryFeeCollector.sol";
import "../src/AgentRegistry.sol";
import "../src/JobEscrow.sol";
import "../src/EscrowFactory.sol";
import "../src/NativeEthJobEscrow.sol";
import "../src/NativeEthEscrowFactory.sol";
import "../src/mocks/MockERC20.sol";

contract AetherExchangeTest is Test {
    FeeCollector feeCollector;
    AgentRegistry registry;
    JobEscrow escrowImpl;
    EscrowFactory factory;
    NativeEthJobEscrow nativeEscrowImpl;
    NativeEthEscrowFactory nativeFactory;
    MockERC20 usdc;

    address owner = address(1);
    address client = address(2);
    address agentWallet = address(3);
    address handler = address(4);
    address arbiter = address(5);
    address randomUser = address(6);
    address arbiter2 = address(7);
    address arbiter3 = address(8);
    address treasury = address(9);

    bytes32 jobId = keccak256("job-001");
    uint256 constant ESCROW_AMOUNT = 1000e6; // 1000 USDC
    uint256 constant REVIEW_PERIOD = 7 days;
    uint256 constant ACCEPTANCE_PERIOD = 2 days;
    uint256 constant ACCEPTANCE_TIMEOUT_GRACE_PERIOD = 7 days;

    function setUp() public {
        vm.startPrank(owner);
        feeCollector = new FeeCollector(owner);
        registry = new AgentRegistry(owner);
        escrowImpl = new JobEscrow();
        nativeEscrowImpl = new NativeEthJobEscrow();
        factory = new EscrowFactory(owner, address(escrowImpl), address(feeCollector), address(registry), arbiter);
        nativeFactory =
            new NativeEthEscrowFactory(owner, address(nativeEscrowImpl), payable(owner), address(registry), arbiter);
        // Register the factory on the registry so every new clone is
        // auto-authorized as a reputation updater. Production bug fix
        // that previously required a manual per-escrow owner tx.
        registry.setFactory(address(factory));
        registry.setFactory(address(nativeFactory));
        vm.stopPrank();

        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdc.mint(client, 100_000e6);
    }

    // ─── Helper ──────────────────────────────────────────────────────

    function _createAndFundEscrow() internal returns (JobEscrow escrow) {
        address escrowAddr = factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);
        escrow = JobEscrow(escrowAddr);

        vm.prank(client);
        usdc.approve(escrowAddr, ESCROW_AMOUNT);
        vm.prank(client);
        escrow.fund();
    }

    function _registerAgent() internal returns (bytes32 agentId) {
        vm.prank(handler);
        agentId = registry.registerAgent(agentWallet, "ipfs://agent-meta");
    }

    function _authorizeEscrow(address escrowAddr) internal {
        // No-op after the factory-auto-authorize fix: the factory already
        // authorized this clone during createEscrow. We keep the helper so
        // existing tests still compile, and we re-call authorizeUpdater to
        // verify idempotency (authorizing twice is a no-op).
        vm.prank(owner);
        registry.authorizeUpdater(escrowAddr);
    }

    function _createAndFundEscrowWithPanel() internal returns (JobEscrow escrow) {
        address[] memory panel = new address[](3);
        panel[0] = arbiter;
        panel[1] = arbiter2;
        panel[2] = arbiter3;
        address escrowAddr =
            factory.createEscrowWithArbiters(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD, panel);
        escrow = JobEscrow(escrowAddr);

        vm.prank(client);
        usdc.approve(escrowAddr, ESCROW_AMOUNT);
        vm.prank(client);
        escrow.fund();
    }

    function test_LegacyEscrowDoesNotSupportNativeEthFunding() public {
        vm.expectRevert("JobEscrow: zero token");
        factory.createEscrow(jobId, client, address(0), ESCROW_AMOUNT, REVIEW_PERIOD);

        address escrowAddr = factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);
        vm.deal(client, 1 ether);
        vm.prank(client);
        (bool success,) = escrowAddr.call{value: 1 wei}(abi.encodeWithSelector(JobEscrow.fund.selector));
        assertFalse(success, "legacy JobEscrow fund() must not accept native ETH");
        assertEq(uint256(JobEscrow(escrowAddr).state()), uint256(JobEscrow.State.UNFUNDED));
        assertEq(address(escrowAddr).balance, 0);
    }

    function test_NativeEthEscrowFullHappyPath() public {
        vm.prank(owner);
        registry.setFactory(address(nativeFactory));

        bytes32 nativeJobId = keccak256("native-eth-job-001");
        uint256 nativeAmount = 0.001 ether;
        vm.deal(client, 1 ether);

        address escrowAddr = nativeFactory.createEscrow(nativeJobId, client, nativeAmount, REVIEW_PERIOD);
        NativeEthJobEscrow escrow = NativeEthJobEscrow(payable(escrowAddr));
        vm.prank(owner);
        registry.authorizeUpdater(escrowAddr);
        assertTrue(registry.authorizedUpdaters(escrowAddr), "native clone should be authorized before payout");
        assertEq(address(escrow).balance, 0);

        vm.prank(client);
        escrow.fund{value: nativeAmount}();
        assertEq(uint256(escrow.state()), uint256(NativeEthJobEscrow.State.FUNDED));
        assertEq(address(escrow).balance, nativeAmount);

        bytes32 registeredAgentId = _registerAgent();
        vm.prank(handler);
        escrow.startWork(registeredAgentId);
        vm.prank(handler);
        escrow.submitDeliverable(keccak256("ipfs://native-eth-deliverable"));

        uint256 agentBefore = agentWallet.balance;
        uint256 feeBefore = owner.balance;
        vm.prank(client);
        escrow.approve();

        uint256 expectedFee = (nativeAmount * 170) / 10000;
        assertEq(agentWallet.balance - agentBefore, nativeAmount - expectedFee);
        assertEq(owner.balance - feeBefore, expectedFee);
        assertEq(address(escrow).balance, 0);
        assertEq(uint256(escrow.state()), uint256(NativeEthJobEscrow.State.COMPLETED));

        AgentRegistry.Agent memory agent = registry.getAgent(registeredAgentId);
        assertEq(agent.jobsCompleted, 1);
        assertEq(agent.totalEarned, nativeAmount);
    }

    function test_NativeEthEscrowRejectsWrongValueAndDirectReceive() public {
        vm.prank(owner);
        registry.setFactory(address(nativeFactory));
        bytes32 nativeJobId = keccak256("native-eth-job-wrong-value");
        uint256 nativeAmount = 0.001 ether;
        vm.deal(client, 1 ether);
        address escrowAddr = nativeFactory.createEscrow(nativeJobId, client, nativeAmount, REVIEW_PERIOD);
        NativeEthJobEscrow escrow = NativeEthJobEscrow(payable(escrowAddr));

        vm.prank(client);
        vm.expectRevert("NativeEthJobEscrow: value mismatch");
        escrow.fund{value: nativeAmount - 1 wei}();

        vm.prank(client);
        (bool success,) = payable(escrowAddr).call{value: 1 wei}("");
        assertFalse(success, "direct ETH receive must fail; use fund()");
        assertEq(uint256(escrow.state()), uint256(NativeEthJobEscrow.State.UNFUNDED));
    }

    function test_NativeEthClientCancelRefundBeforeAcceptance() public {
        bytes32 nativeJobId = keccak256("native-eth-job-cancel");
        uint256 nativeAmount = 0.001 ether;
        vm.deal(client, 1 ether);
        uint256 acceptanceDeadline = block.timestamp + ACCEPTANCE_PERIOD;

        address escrowAddr =
            nativeFactory.createEscrow(nativeJobId, client, nativeAmount, REVIEW_PERIOD, acceptanceDeadline);
        NativeEthJobEscrow escrow = NativeEthJobEscrow(payable(escrowAddr));

        vm.prank(client);
        escrow.fund{value: nativeAmount}();

        uint256 clientBefore = client.balance;
        vm.prank(client);
        escrow.cancel();

        assertEq(client.balance, clientBefore + nativeAmount);
        assertEq(address(escrow).balance, 0);
        assertEq(uint256(escrow.state()), uint256(NativeEthJobEscrow.State.CANCELLED));
    }

    function test_NativeEthPublicTimeoutRefundAfterAcceptanceDeadlineGrace() public {
        bytes32 nativeJobId = keccak256("native-eth-job-timeout");
        uint256 nativeAmount = 0.001 ether;
        vm.deal(client, 1 ether);
        uint256 acceptanceDeadline = block.timestamp + ACCEPTANCE_PERIOD;

        address escrowAddr =
            nativeFactory.createEscrow(nativeJobId, client, nativeAmount, REVIEW_PERIOD, acceptanceDeadline);
        NativeEthJobEscrow escrow = NativeEthJobEscrow(payable(escrowAddr));

        vm.prank(client);
        escrow.fund{value: nativeAmount}();

        vm.warp(acceptanceDeadline + ACCEPTANCE_TIMEOUT_GRACE_PERIOD - 1);
        vm.expectRevert("NativeEthJobEscrow: acceptance timeout active");
        escrow.refundAfterAcceptanceTimeout();

        uint256 clientBefore = client.balance;
        vm.warp(acceptanceDeadline + ACCEPTANCE_TIMEOUT_GRACE_PERIOD);
        vm.prank(randomUser);
        escrow.refundAfterAcceptanceTimeout();

        assertEq(client.balance, clientBefore + nativeAmount);
        assertEq(address(escrow).balance, 0);
        assertEq(uint256(escrow.state()), uint256(NativeEthJobEscrow.State.CANCELLED));
    }

    function test_NativeEthCannotAcceptAfterAcceptanceDeadline() public {
        bytes32 nativeJobId = keccak256("native-eth-job-accept-expired");
        uint256 nativeAmount = 0.001 ether;
        vm.deal(client, 1 ether);
        uint256 acceptanceDeadline = block.timestamp + ACCEPTANCE_PERIOD;

        address escrowAddr =
            nativeFactory.createEscrow(nativeJobId, client, nativeAmount, REVIEW_PERIOD, acceptanceDeadline);
        NativeEthJobEscrow escrow = NativeEthJobEscrow(payable(escrowAddr));

        vm.prank(client);
        escrow.fund{value: nativeAmount}();
        bytes32 registeredAgentId = _registerAgent();

        vm.warp(acceptanceDeadline + 1);
        vm.prank(handler);
        vm.expectRevert("NativeEthJobEscrow: acceptance expired");
        escrow.startWork(registeredAgentId);
    }

    // ─── AgentRegistry Tests ─────────────────────────────────────────

    function test_SelfRegister() public {
        vm.prank(agentWallet);
        bytes32 agentId = registry.register("ipfs://meta");

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.wallet, agentWallet);
        assertEq(agent.handler, agentWallet); // self-registered
        assertTrue(agent.active);
        assertFalse(agent.autonomousAccept);
        assertEq(registry.agentCount(), 1);
    }

    function test_HandlerRegister() public {
        bytes32 agentId = _registerAgent();

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.wallet, agentWallet);
        assertEq(agent.handler, handler);
        assertTrue(agent.active);
    }

    function test_CannotRegisterTwice() public {
        vm.prank(agentWallet);
        registry.register("ipfs://meta");

        vm.prank(agentWallet);
        vm.expectRevert("AgentRegistry: already registered");
        registry.register("ipfs://meta2");
    }

    function test_HandlerCanUpdateMetadata() public {
        bytes32 agentId = _registerAgent();

        vm.prank(handler);
        registry.updateMetadata(agentId, "ipfs://new-meta");

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.metadataURI, "ipfs://new-meta");
    }

    function test_NonHandlerCannotUpdateMetadata() public {
        bytes32 agentId = _registerAgent();

        vm.prank(randomUser);
        vm.expectRevert("AgentRegistry: not handler");
        registry.updateMetadata(agentId, "ipfs://hacked");
    }

    function test_HandlerCanToggleActive() public {
        bytes32 agentId = _registerAgent();

        vm.prank(handler);
        registry.setActive(agentId, false);
        assertFalse(registry.isActive(agentId));

        vm.prank(handler);
        registry.setActive(agentId, true);
        assertTrue(registry.isActive(agentId));
    }

    function test_HandlerCanToggleAutonomy() public {
        bytes32 agentId = _registerAgent();

        vm.prank(handler);
        registry.setAutonomousAccept(agentId, true);
        assertTrue(registry.isAutonomous(agentId));
    }

    function test_OnlyAuthorizedUpdaterCanUpdateReputation() public {
        bytes32 agentId = _registerAgent();

        vm.prank(randomUser);
        vm.expectRevert("AgentRegistry: not authorized");
        registry.recordJobCompleted(agentId, 100e6);
    }

    /// @notice Regression test for the production bug where escrow clones
    /// had to be manually pre-authorized before approve() could disburse.
    /// With the factory-auto-authorize fix, creating an escrow through the
    /// factory should mark the new clone as an authorized updater
    /// immediately, and the full happy path should complete without ever
    /// calling authorizeUpdater directly.
    function test_FactoryAutoAuthorizesNewEscrows() public {
        // Create an escrow via the factory — NO manual authorizeUpdater.
        address escrowAddr = factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);

        // The registry should already mark this clone as authorized.
        assertTrue(registry.authorizedUpdaters(escrowAddr), "factory should auto-authorize new clone");

        // And a full approve() should now work end-to-end with no manual
        // authorization step anywhere in the flow.
        JobEscrow escrow = JobEscrow(escrowAddr);
        vm.prank(client);
        usdc.approve(escrowAddr, ESCROW_AMOUNT);
        vm.prank(client);
        escrow.fund();

        bytes32 agentId = _registerAgent();
        vm.prank(handler);
        escrow.startWork(agentId);
        vm.prank(agentWallet);
        escrow.submitDeliverable(keccak256("ipfs://deliverable"));

        uint256 beforeAgent = usdc.balanceOf(agentWallet);
        uint256 beforeFee = feeCollector.balanceOf(address(usdc));

        vm.prank(client);
        escrow.approve();

        // Classic 98.3 / 1.7 split — proof the disbursement path ran
        // through recordJobCompleted without a revert.
        uint256 expectedFee = (ESCROW_AMOUNT * 170) / 10000;
        uint256 expectedPayout = ESCROW_AMOUNT - expectedFee;
        assertEq(usdc.balanceOf(agentWallet) - beforeAgent, expectedPayout);
        assertEq(feeCollector.balanceOf(address(usdc)) - beforeFee, expectedFee);
    }

    function test_TreasuryFeeCollectorForwardsEscrowFeeToTreasury() public {
        vm.prank(owner);
        TreasuryFeeCollector treasuryCollector = new TreasuryFeeCollector(owner, treasury);

        vm.prank(owner);
        factory.setFeeCollector(address(treasuryCollector));

        JobEscrow escrow = _createAndFundEscrow();
        bytes32 agentId = _registerAgent();

        vm.prank(handler);
        escrow.startWork(agentId);
        vm.prank(agentWallet);
        escrow.submitDeliverable(keccak256("ipfs://deliverable"));

        uint256 agentBefore = usdc.balanceOf(agentWallet);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 collectorBefore = usdc.balanceOf(address(treasuryCollector));

        vm.prank(client);
        escrow.approve();

        uint256 expectedFee = (ESCROW_AMOUNT * 170) / 10000;
        uint256 expectedPayout = ESCROW_AMOUNT - expectedFee;
        assertEq(usdc.balanceOf(agentWallet) - agentBefore, expectedPayout);
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, expectedFee);
        assertEq(usdc.balanceOf(address(treasuryCollector)) - collectorBefore, 0);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.COMPLETED));
    }

    function test_OnlyOwnerOrFactoryCanAuthorizeUpdaters() public {
        // Random user cannot authorize updaters.
        vm.prank(randomUser);
        vm.expectRevert("AgentRegistry: only owner or factory");
        registry.authorizeUpdater(address(0x1234));

        // Owner still can (for manual admin flows).
        vm.prank(owner);
        registry.authorizeUpdater(address(0x1234));
        assertTrue(registry.authorizedUpdaters(address(0x1234)));
    }

    function test_OnlyOwnerCanSetFactory() public {
        vm.prank(randomUser);
        vm.expectRevert();
        registry.setFactory(address(0xFACE));

        vm.prank(owner);
        registry.setFactory(address(0xFACE));
        assertEq(registry.factory(), address(0xFACE));
    }

    // ─── FeeCollector Tests ──────────────────────────────────────────

    function test_FeeCollectorCollect() public {
        usdc.mint(address(this), 100e6);
        usdc.approve(address(feeCollector), 17e6);

        feeCollector.collect(address(usdc), 17e6, jobId);
        assertEq(feeCollector.balanceOf(address(usdc)), 17e6);
    }

    function test_FeeCollectorWithdrawOnlyOwner() public {
        usdc.mint(address(this), 100e6);
        usdc.approve(address(feeCollector), 17e6);
        feeCollector.collect(address(usdc), 17e6, jobId);

        vm.prank(randomUser);
        vm.expectRevert();
        feeCollector.withdraw(address(usdc), randomUser, 17e6);

        vm.prank(owner);
        feeCollector.withdraw(address(usdc), owner, 17e6);
        assertEq(usdc.balanceOf(owner), 17e6);
    }

    function test_FeeCollectorCannotOverdraw() public {
        vm.prank(owner);
        vm.expectRevert("FeeCollector: insufficient balance");
        feeCollector.withdraw(address(usdc), owner, 1);
    }

    // ─── EscrowFactory Tests ─────────────────────────────────────────

    function test_CreateEscrow() public {
        address escrowAddr = factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);
        assertTrue(escrowAddr != address(0));
        assertEq(factory.getEscrow(jobId), escrowAddr);
        assertEq(factory.escrowCount(), 1);
    }

    function test_CannotCreateDuplicateEscrow() public {
        factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);

        vm.expectRevert("EscrowFactory: escrow exists");
        factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);
    }

    function test_CannotCreateWhenPaused() public {
        vm.prank(owner);
        factory.pause();

        vm.expectRevert();
        factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);
    }

    function test_DirectWalletEscrowRequiresExplicitPosterDeposit() public {
        uint256 acceptanceDeadline = block.timestamp + ACCEPTANCE_PERIOD;
        address escrowAddr =
            factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD, acceptanceDeadline);
        JobEscrow escrow = JobEscrow(escrowAddr);

        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.UNFUNDED));
        assertEq(escrow.acceptanceDeadline(), acceptanceDeadline);
        assertEq(usdc.balanceOf(escrowAddr), 0);

        usdc.mint(randomUser, ESCROW_AMOUNT);
        vm.prank(randomUser);
        usdc.approve(escrowAddr, ESCROW_AMOUNT);
        vm.prank(randomUser);
        vm.expectRevert("JobEscrow: not client");
        escrow.fund();

        vm.prank(client);
        usdc.approve(escrowAddr, ESCROW_AMOUNT);
        vm.prank(client);
        escrow.fund();

        assertEq(usdc.balanceOf(escrowAddr), ESCROW_AMOUNT);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.FUNDED));
    }

    // ─── JobEscrow Full Lifecycle ────────────────────────────────────

    function test_FullHappyPath() public {
        // 1. Register agent
        bytes32 agentId = _registerAgent();

        // 2. Create + fund escrow
        JobEscrow escrow = _createAndFundEscrow();
        _authorizeEscrow(address(escrow));

        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.FUNDED));

        // 3. Agent starts work (handler accepts)
        vm.prank(handler);
        escrow.startWork(agentId);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.IN_PROGRESS));

        // 4. Submit deliverable
        bytes32 delivHash = keccak256("ipfs://deliverable-cid");
        vm.prank(handler);
        escrow.submitDeliverable(delivHash);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.PENDING_REVIEW));

        // 5. Client approves
        uint256 agentBalanceBefore = usdc.balanceOf(agentWallet);
        vm.prank(client);
        escrow.approve();

        // Verify payout: 98.3% to agent, 1.7% fee
        uint256 expectedFee = (ESCROW_AMOUNT * 170) / 10000; // 17 USDC
        uint256 expectedPayout = ESCROW_AMOUNT - expectedFee; // 983 USDC

        assertEq(usdc.balanceOf(agentWallet) - agentBalanceBefore, expectedPayout);
        assertEq(feeCollector.balanceOf(address(usdc)), expectedFee);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.COMPLETED));

        // Verify reputation updated
        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.jobsCompleted, 1);
        assertEq(agent.totalEarned, ESCROW_AMOUNT);
    }

    function test_ClientCancel() public {
        JobEscrow escrow = _createAndFundEscrow();

        uint256 balanceBefore = usdc.balanceOf(client);
        vm.prank(client);
        escrow.cancel();

        assertEq(usdc.balanceOf(client), balanceBefore + ESCROW_AMOUNT);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.CANCELLED));
    }

    function test_PublicTimeoutRefundAfterAcceptanceDeadlineGrace() public {
        uint256 acceptanceDeadline = block.timestamp + ACCEPTANCE_PERIOD;
        address escrowAddr =
            factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD, acceptanceDeadline);
        JobEscrow escrow = JobEscrow(escrowAddr);

        vm.prank(client);
        usdc.approve(escrowAddr, ESCROW_AMOUNT);
        vm.prank(client);
        escrow.fund();

        vm.warp(acceptanceDeadline + ACCEPTANCE_TIMEOUT_GRACE_PERIOD - 1);
        vm.expectRevert("JobEscrow: acceptance timeout active");
        escrow.refundAfterAcceptanceTimeout();

        uint256 clientBefore = usdc.balanceOf(client);
        vm.warp(acceptanceDeadline + ACCEPTANCE_TIMEOUT_GRACE_PERIOD);
        vm.prank(randomUser);
        escrow.refundAfterAcceptanceTimeout();

        assertEq(usdc.balanceOf(client), clientBefore + ESCROW_AMOUNT);
        assertEq(usdc.balanceOf(escrowAddr), 0);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.CANCELLED));
    }

    function test_CannotCancelAfterAccepted() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrow();

        vm.prank(handler);
        escrow.startWork(agentId);

        vm.prank(client);
        vm.expectRevert("JobEscrow: invalid state");
        escrow.cancel();
    }

    function test_CannotAcceptAfterAcceptanceDeadline() public {
        bytes32 agentId = _registerAgent();
        uint256 acceptanceDeadline = block.timestamp + ACCEPTANCE_PERIOD;
        address escrowAddr =
            factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD, acceptanceDeadline);
        JobEscrow escrow = JobEscrow(escrowAddr);

        vm.prank(client);
        usdc.approve(escrowAddr, ESCROW_AMOUNT);
        vm.prank(client);
        escrow.fund();

        vm.warp(acceptanceDeadline + 1);
        vm.prank(handler);
        vm.expectRevert("JobEscrow: acceptance expired");
        escrow.startWork(agentId);
    }

    function test_AutoRelease() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrow();
        _authorizeEscrow(address(escrow));

        vm.prank(handler);
        escrow.startWork(agentId);

        bytes32 delivHash = keccak256("ipfs://deliverable");
        vm.prank(handler);
        escrow.submitDeliverable(delivHash);

        // Cannot auto-release before deadline
        vm.expectRevert("JobEscrow: review period active");
        escrow.autoRelease();

        // Warp past review deadline
        vm.warp(block.timestamp + REVIEW_PERIOD + 1);

        uint256 agentBalanceBefore = usdc.balanceOf(agentWallet);
        escrow.autoRelease();

        uint256 expectedFee = (ESCROW_AMOUNT * 170) / 10000;
        uint256 expectedPayout = ESCROW_AMOUNT - expectedFee;
        assertEq(usdc.balanceOf(agentWallet) - agentBalanceBefore, expectedPayout);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.COMPLETED));
    }

    function test_DisputeAndResolve_FullAgent() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrow();
        _authorizeEscrow(address(escrow));

        vm.prank(handler);
        escrow.startWork(agentId);

        // Client disputes
        vm.prank(client);
        escrow.dispute("Deliverable not as described");
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.DISPUTED));

        // Arbiter resolves: 100% to agent (10000 bps)
        uint256 agentBalBefore = usdc.balanceOf(agentWallet);
        vm.prank(arbiter);
        escrow.resolve(10000);

        uint256 expectedFee = (ESCROW_AMOUNT * 170) / 10000;
        assertEq(usdc.balanceOf(agentWallet) - agentBalBefore, ESCROW_AMOUNT - expectedFee);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.RESOLVED));
    }

    function test_DisputeAndResolve_FullClient() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrow();
        _authorizeEscrow(address(escrow));

        vm.prank(handler);
        escrow.startWork(agentId);

        vm.prank(client);
        escrow.dispute("Work not started");

        uint256 clientBalBefore = usdc.balanceOf(client);
        vm.prank(arbiter);
        escrow.resolve(0); // 0% to agent

        assertEq(usdc.balanceOf(client) - clientBalBefore, ESCROW_AMOUNT);

        // Agent gets dispute loss recorded
        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.disputesLost, 1);
    }

    function test_DisputeAndResolve_Split() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrow();
        _authorizeEscrow(address(escrow));

        vm.prank(handler);
        escrow.startWork(agentId);

        vm.prank(handler);
        escrow.submitDeliverable(keccak256("ipfs://partial"));

        vm.prank(client);
        escrow.dispute("Partial completion");

        // Arbiter resolves: 50/50 split
        vm.prank(arbiter);
        escrow.resolve(5000);

        uint256 agentHalf = (ESCROW_AMOUNT * 5000) / 10000;
        uint256 clientHalf = ESCROW_AMOUNT - agentHalf;
        uint256 fee = (agentHalf * 170) / 10000;

        assertEq(usdc.balanceOf(agentWallet), agentHalf - fee);
        assertEq(feeCollector.balanceOf(address(usdc)), fee);
    }

    function test_OnlyArbiterCanResolve() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrow();

        vm.prank(handler);
        escrow.startWork(agentId);

        vm.prank(client);
        escrow.dispute("Bad work");

        vm.prank(client);
        vm.expectRevert("JobEscrow: not arbiter");
        escrow.resolve(0);
    }

    function test_AgentCannotStartWithoutAutonomous() public {
        vm.prank(handler);
        bytes32 agentId = registry.registerAgent(agentWallet, "ipfs://meta");

        JobEscrow escrow = _createAndFundEscrow();

        // Agent wallet tries to accept directly (not handler, autonomous=false)
        vm.prank(agentWallet);
        vm.expectRevert("JobEscrow: autonomous accept disabled");
        escrow.startWork(agentId);
    }

    function test_AgentCanStartWithAutonomous() public {
        vm.prank(handler);
        bytes32 agentId = registry.registerAgent(agentWallet, "ipfs://meta");

        vm.prank(handler);
        registry.setAutonomousAccept(agentId, true);

        JobEscrow escrow = _createAndFundEscrow();

        vm.prank(agentWallet);
        escrow.startWork(agentId);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.IN_PROGRESS));
    }

    function test_CannotFundTwice() public {
        address escrowAddr = factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);
        JobEscrow escrow = JobEscrow(escrowAddr);

        vm.prank(client);
        usdc.approve(escrowAddr, ESCROW_AMOUNT * 2);

        vm.prank(client);
        escrow.fund();

        vm.prank(client);
        vm.expectRevert("JobEscrow: invalid state");
        escrow.fund();
    }

    function test_UnauthorizedCannotDisputeOrApprove() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrow();

        vm.prank(handler);
        escrow.startWork(agentId);

        vm.prank(randomUser);
        vm.expectRevert("JobEscrow: unauthorized");
        escrow.dispute("hacking");
    }

    function test_ReviewPeriodBounds() public {
        // Too short
        vm.expectRevert("JobEscrow: invalid review period");
        factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, 1 hours);

        // Too long
        bytes32 jobId2 = keccak256("job-002");
        vm.expectRevert("JobEscrow: invalid review period");
        factory.createEscrow(jobId2, client, address(usdc), ESCROW_AMOUNT, 60 days);
    }

    // ─── Multi-Arbiter Panel Tests ────────────────────────────────────

    function test_CreateEscrowWithArbiterPanel() public {
        address[] memory panel = new address[](3);
        panel[0] = arbiter;
        panel[1] = arbiter2;
        panel[2] = arbiter3;
        address escrowAddr =
            factory.createEscrowWithArbiters(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD, panel);
        JobEscrow escrow = JobEscrow(escrowAddr);

        assertTrue(escrow.isArbiter(arbiter));
        assertTrue(escrow.isArbiter(arbiter2));
        assertTrue(escrow.isArbiter(arbiter3));
        assertFalse(escrow.isArbiter(randomUser));
        assertEq(escrow.arbiterCount(), 3);
        assertEq(escrow.requiredVotes(), 3);
    }

    function test_PanelResolve_RequiresQuorum() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrowWithPanel();
        _authorizeEscrow(address(escrow));

        vm.prank(handler);
        escrow.startWork(agentId);

        vm.prank(client);
        escrow.dispute("Multi-arbiter test");
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.DISPUTED));

        // First vote — should NOT resolve yet
        vm.prank(arbiter);
        escrow.resolve(10000);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.DISPUTED));
        assertEq(escrow.voteCount(), 1);

        // Second vote — still not resolved
        vm.prank(arbiter2);
        escrow.resolve(10000);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.DISPUTED));
        assertEq(escrow.voteCount(), 2);

        // Third vote — now it resolves
        uint256 agentBalBefore = usdc.balanceOf(agentWallet);
        vm.prank(arbiter3);
        escrow.resolve(10000);
        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.RESOLVED));
        assertEq(escrow.voteCount(), 3);

        // All voted 10000 bps → average = 10000, full payout to agent minus fee
        uint256 expectedFee = (ESCROW_AMOUNT * 170) / 10000;
        assertEq(usdc.balanceOf(agentWallet) - agentBalBefore, ESCROW_AMOUNT - expectedFee);
    }

    function test_PanelResolve_AveragesSplit() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrowWithPanel();
        _authorizeEscrow(address(escrow));

        vm.prank(handler);
        escrow.startWork(agentId);

        vm.prank(client);
        escrow.dispute("Partial work");

        // Arbiter 1: 60% to agent
        vm.prank(arbiter);
        escrow.resolve(6000);

        // Arbiter 2: 40% to agent
        vm.prank(arbiter2);
        escrow.resolve(4000);

        // Arbiter 3: 50% to agent → average = (6000+4000+5000)/3 = 5000
        vm.prank(arbiter3);
        escrow.resolve(5000);

        assertEq(uint256(escrow.state()), uint256(JobEscrow.State.RESOLVED));

        // Average is 5000 bps → 50% split
        uint256 agentHalf = (ESCROW_AMOUNT * 5000) / 10000;
        uint256 clientHalf = ESCROW_AMOUNT - agentHalf;
        uint256 fee = (agentHalf * 170) / 10000;

        assertEq(usdc.balanceOf(agentWallet), agentHalf - fee);
        assertEq(feeCollector.balanceOf(address(usdc)), fee);
        // Client gets remainder
        // client started with 100_000e6, paid ESCROW_AMOUNT, gets clientHalf back
        assertEq(usdc.balanceOf(client), 100_000e6 - ESCROW_AMOUNT + clientHalf);
    }

    function test_PanelResolve_CannotVoteTwice() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrowWithPanel();

        vm.prank(handler);
        escrow.startWork(agentId);

        vm.prank(client);
        escrow.dispute("Double vote test");

        vm.prank(arbiter);
        escrow.resolve(5000);

        vm.prank(arbiter);
        vm.expectRevert("JobEscrow: already voted");
        escrow.resolve(5000);
    }

    function test_PanelResolve_NonArbiterCannotVote() public {
        bytes32 agentId = _registerAgent();
        JobEscrow escrow = _createAndFundEscrowWithPanel();

        vm.prank(handler);
        escrow.startWork(agentId);

        vm.prank(client);
        escrow.dispute("Auth test");

        vm.prank(randomUser);
        vm.expectRevert("JobEscrow: not arbiter");
        escrow.resolve(5000);
    }

    function test_AddArbiterPostCreation() public {
        // Create with single arbiter via createEscrow
        address escrowAddr = factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);
        JobEscrow escrow = JobEscrow(escrowAddr);

        assertEq(escrow.arbiterCount(), 1);
        assertEq(escrow.requiredVotes(), 1);

        // Owner adds two more arbiters via factory
        vm.startPrank(owner);
        factory.addArbiterToEscrow(jobId, arbiter2);
        factory.addArbiterToEscrow(jobId, arbiter3);
        factory.setEscrowRequiredVotes(jobId, 3);
        vm.stopPrank();

        assertEq(escrow.arbiterCount(), 3);
        assertEq(escrow.requiredVotes(), 3);
        assertTrue(escrow.isArbiter(arbiter));
        assertTrue(escrow.isArbiter(arbiter2));
        assertTrue(escrow.isArbiter(arbiter3));
    }

    function test_CannotAddDuplicateArbiter() public {
        factory.createEscrow(jobId, client, address(usdc), ESCROW_AMOUNT, REVIEW_PERIOD);

        vm.prank(owner);
        vm.expectRevert("JobEscrow: already arbiter");
        factory.addArbiterToEscrow(jobId, arbiter); // arbiter is already the default
    }

    function test_GetArbitersView() public {
        JobEscrow escrow = _createAndFundEscrowWithPanel();

        address[] memory panel = escrow.getArbiters();
        assertEq(panel.length, 3);
        assertEq(panel[0], arbiter);
        assertEq(panel[1], arbiter2);
        assertEq(panel[2], arbiter3);
    }
}
