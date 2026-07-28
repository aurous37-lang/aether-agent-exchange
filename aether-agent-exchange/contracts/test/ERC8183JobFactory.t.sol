// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ERC8183JobEscrow.sol";
import "../src/ERC8183JobFactory.sol";
import "../src/FeeCollector.sol";
import "../src/TreasuryFeeCollector.sol";
import "../src/mocks/MockERC20.sol";
import "./mocks/MockACPHook.sol";

contract ERC8183JobFactoryTest is Test {
    FeeCollector feeCollector;
    ERC8183JobEscrow escrowImpl;
    ERC8183JobFactory factory;
    MockERC20 usdc;

    address owner = address(1);
    address client = address(2);
    address provider = address(3);
    address evaluator = address(4);
    address randomUser = address(5);
    address treasury = address(6);

    uint256 constant BUDGET = 1000e6;
    uint256 constant EXPIRY_WINDOW = 7 days;
    bytes32 constant DELIVERABLE = keccak256("ipfs://deliverable");
    bytes32 constant REASON = keccak256("accepted");

    function setUp() public {
        vm.startPrank(owner);
        feeCollector = new FeeCollector(owner);
        escrowImpl = new ERC8183JobEscrow();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        factory = new ERC8183JobFactory(owner, address(escrowImpl), address(usdc), address(feeCollector));
        vm.stopPrank();

        usdc.mint(client, 100_000e6);
    }

    function _createJob(address jobProvider, address jobEvaluator) internal returns (uint256 jobId) {
        vm.prank(client);
        jobId = factory.createJob(jobProvider, jobEvaluator, block.timestamp + EXPIRY_WINDOW, "ipfs://job", address(0));
    }

    function _createFundedJob(address jobEvaluator) internal returns (uint256 jobId) {
        jobId = _createJob(provider, jobEvaluator);

        vm.prank(provider);
        factory.setBudget(jobId, BUDGET);

        vm.prank(client);
        usdc.approve(address(factory), BUDGET);

        vm.prank(client);
        factory.fund(jobId, BUDGET);
    }

    function test_CreateJob_DefaultsEvaluatorToClient() public {
        uint256 jobId = _createJob(address(0), address(0));

        ERC8183JobFactory.Job memory job = factory.getJob(jobId);
        assertEq(job.client, client);
        assertEq(job.provider, address(0));
        assertEq(job.evaluator, client);
        assertEq(uint256(job.status), uint256(ERC8183JobFactory.JobStatus.Open));
        assertTrue(job.escrow != address(0));
        assertEq(factory.escrows(jobId), job.escrow);
    }

    function test_ERC8183EscrowDoesNotSupportNativeEthPaymentToken() public {
        vm.prank(owner);
        vm.expectRevert("ERC8183JobFactory: zero token");
        new ERC8183JobFactory(owner, address(escrowImpl), address(0), address(feeCollector));

        uint256 jobId = _createJob(provider, evaluator);
        vm.prank(provider);
        factory.setBudget(jobId, BUDGET);
        vm.deal(client, 1 ether);
        vm.prank(client);
        (bool success,) = address(factory).call{value: 1 wei}(
            abi.encodeWithSelector(bytes4(keccak256("fund(uint256,uint256)")), jobId, BUDGET)
        );
        assertFalse(success, "ERC8183 factory fund() must not accept native ETH");
        assertEq(uint256(factory.getJob(jobId).status), uint256(ERC8183JobFactory.JobStatus.Open));
    }

    function test_SetProviderLaterBeforeFunding() public {
        uint256 jobId = _createJob(address(0), address(0));

        vm.prank(randomUser);
        vm.expectRevert("ERC8183JobFactory: unauthorized");
        factory.setProvider(jobId, provider);

        vm.prank(client);
        factory.setProvider(jobId, provider);

        ERC8183JobFactory.Job memory job = factory.getJob(jobId);
        assertEq(job.provider, provider);

        vm.prank(client);
        vm.expectRevert("ERC8183JobFactory: provider already set");
        factory.setProvider(jobId, randomUser);
    }

    function test_FundRevertsOnExpectedBudgetMismatch() public {
        uint256 jobId = _createJob(provider, address(0));

        vm.prank(client);
        factory.setBudget(jobId, BUDGET);

        vm.prank(client);
        usdc.approve(address(factory), BUDGET);

        vm.prank(client);
        vm.expectRevert("ERC8183JobFactory: budget mismatch");
        factory.fund(jobId, BUDGET - 1);
    }

    function test_FundRequiresProvider() public {
        uint256 jobId = _createJob(address(0), address(0));

        vm.prank(client);
        factory.setBudget(jobId, BUDGET);

        vm.prank(client);
        usdc.approve(address(factory), BUDGET);

        vm.prank(client);
        vm.expectRevert("ERC8183JobFactory: provider not set");
        factory.fund(jobId, BUDGET);
    }

    function test_CompletePaysProviderMinusPlatformFee() public {
        uint256 jobId = _createFundedJob(evaluator);

        vm.prank(provider);
        factory.submit(jobId, DELIVERABLE);

        vm.prank(randomUser);
        vm.expectRevert("ERC8183JobFactory: unauthorized");
        factory.complete(jobId, REASON);

        uint256 providerBefore = usdc.balanceOf(provider);
        vm.prank(evaluator);
        factory.complete(jobId, REASON);

        uint256 expectedFee = (BUDGET * factory.platformFeeBps()) / factory.BPS_DENOMINATOR();
        uint256 expectedProviderAmount = BUDGET - expectedFee;
        ERC8183JobFactory.Job memory job = factory.getJob(jobId);

        assertEq(uint256(job.status), uint256(ERC8183JobFactory.JobStatus.Completed));
        assertEq(job.reason, REASON);
        assertEq(usdc.balanceOf(provider) - providerBefore, expectedProviderAmount);
        assertEq(feeCollector.balanceOf(address(usdc)), expectedFee);
        assertEq(ERC8183JobEscrow(job.escrow).escrowedAmount(), 0);
    }

    function test_TreasuryFeeCollectorForwardsERC8183FeeToTreasury() public {
        vm.prank(owner);
        TreasuryFeeCollector treasuryCollector = new TreasuryFeeCollector(owner, treasury);

        vm.prank(owner);
        factory.setFeeCollector(address(treasuryCollector));

        uint256 jobId = _createFundedJob(evaluator);
        vm.prank(provider);
        factory.submit(jobId, DELIVERABLE);

        uint256 providerBefore = usdc.balanceOf(provider);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 collectorBefore = usdc.balanceOf(address(treasuryCollector));

        vm.prank(evaluator);
        factory.complete(jobId, REASON);

        uint256 expectedFee = (BUDGET * factory.platformFeeBps()) / factory.BPS_DENOMINATOR();
        uint256 expectedProviderAmount = BUDGET - expectedFee;
        ERC8183JobFactory.Job memory job = factory.getJob(jobId);

        assertEq(uint256(job.status), uint256(ERC8183JobFactory.JobStatus.Completed));
        assertEq(usdc.balanceOf(provider) - providerBefore, expectedProviderAmount);
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, expectedFee);
        assertEq(usdc.balanceOf(address(treasuryCollector)) - collectorBefore, 0);
        assertEq(ERC8183JobEscrow(job.escrow).escrowedAmount(), 0);
    }

    function test_RejectRefundsClientWithoutFee() public {
        uint256 jobId = _createFundedJob(evaluator);
        uint256 clientBefore = usdc.balanceOf(client);

        vm.prank(evaluator);
        factory.reject(jobId, keccak256("not accepted"));

        ERC8183JobFactory.Job memory job = factory.getJob(jobId);
        assertEq(uint256(job.status), uint256(ERC8183JobFactory.JobStatus.Rejected));
        assertEq(usdc.balanceOf(client) - clientBefore, BUDGET);
        assertEq(feeCollector.balanceOf(address(usdc)), 0);
    }

    function test_ClientCanRejectOpenJob() public {
        uint256 jobId = _createJob(provider, address(0));

        vm.prank(evaluator);
        vm.expectRevert("ERC8183JobFactory: unauthorized");
        factory.reject(jobId, keccak256("wrong caller"));

        vm.prank(client);
        factory.reject(jobId, keccak256("cancelled"));

        ERC8183JobFactory.Job memory job = factory.getJob(jobId);
        assertEq(uint256(job.status), uint256(ERC8183JobFactory.JobStatus.Rejected));
    }

    function test_ClaimRefundAfterExpiryIsPermissionless() public {
        uint256 jobId = _createFundedJob(evaluator);
        uint256 clientBefore = usdc.balanceOf(client);

        vm.prank(randomUser);
        vm.expectRevert("ERC8183JobFactory: not expired");
        factory.claimRefund(jobId);

        vm.warp(block.timestamp + EXPIRY_WINDOW);

        vm.prank(randomUser);
        factory.claimRefund(jobId);

        ERC8183JobFactory.Job memory job = factory.getJob(jobId);
        assertEq(uint256(job.status), uint256(ERC8183JobFactory.JobStatus.Expired));
        assertEq(usdc.balanceOf(client) - clientBefore, BUDGET);
        assertEq(feeCollector.balanceOf(address(usdc)), 0);
    }

    function test_UnauthorizedCallersCannotMoveLifecycle() public {
        uint256 jobId = _createJob(provider, evaluator);

        vm.prank(randomUser);
        vm.expectRevert("ERC8183JobFactory: unauthorized");
        factory.setBudget(jobId, BUDGET);

        vm.prank(provider);
        factory.setBudget(jobId, BUDGET);

        vm.prank(client);
        usdc.approve(address(factory), BUDGET);

        vm.prank(randomUser);
        vm.expectRevert("ERC8183JobFactory: unauthorized");
        factory.fund(jobId, BUDGET);

        vm.prank(client);
        factory.fund(jobId, BUDGET);

        vm.prank(randomUser);
        vm.expectRevert("ERC8183JobFactory: unauthorized");
        factory.submit(jobId, DELIVERABLE);

        vm.prank(provider);
        factory.submit(jobId, DELIVERABLE);

        vm.prank(client);
        vm.expectRevert("ERC8183JobFactory: unauthorized");
        factory.reject(jobId, keccak256("client cannot reject after submit"));
    }

    function test_HookBlocksCoreActionsAndCannotBeBypassedThroughEscrow() public {
        MockACPHook hook = new MockACPHook();
        vm.prank(client);
        uint256 jobId =
            factory.createJob(provider, evaluator, block.timestamp + EXPIRY_WINDOW, "ipfs://job", address(hook));

        vm.prank(provider);
        factory.setBudget(jobId, BUDGET);
        assertEq(hook.beforeCount(), 1);
        assertEq(hook.afterCount(), 1);
        assertEq(hook.lastSelector(), factory.SET_BUDGET_SELECTOR());

        hook.setRevertBefore(true);

        vm.prank(client);
        usdc.approve(address(factory), BUDGET);

        vm.prank(client);
        vm.expectRevert("MockACPHook: before blocked");
        factory.fund(jobId, BUDGET);

        address escrow = factory.escrows(jobId);
        vm.prank(randomUser);
        vm.expectRevert("ERC8183JobEscrow: not factory");
        ERC8183JobEscrow(escrow).refund(client, BUDGET);

        vm.prank(randomUser);
        vm.expectRevert("ERC8183JobEscrow: not factory");
        ERC8183JobEscrow(escrow).release(provider, address(feeCollector), BUDGET, 0);
    }

    function test_ClaimRefundIsNotHookableRecoveryPath() public {
        MockACPHook hook = new MockACPHook();
        vm.prank(client);
        uint256 jobId =
            factory.createJob(provider, evaluator, block.timestamp + EXPIRY_WINDOW, "ipfs://job", address(hook));

        vm.prank(provider);
        factory.setBudget(jobId, BUDGET);

        vm.prank(client);
        usdc.approve(address(factory), BUDGET);

        vm.prank(client);
        factory.fund(jobId, BUDGET);

        hook.setRevertBefore(true);
        uint256 beforeCount = hook.beforeCount();
        uint256 clientBefore = usdc.balanceOf(client);
        vm.warp(block.timestamp + EXPIRY_WINDOW);

        vm.prank(randomUser);
        factory.claimRefund(jobId);

        assertEq(hook.beforeCount(), beforeCount);
        assertEq(usdc.balanceOf(client) - clientBefore, BUDGET);
        assertEq(uint256(factory.getJob(jobId).status), uint256(ERC8183JobFactory.JobStatus.Expired));
    }
}
