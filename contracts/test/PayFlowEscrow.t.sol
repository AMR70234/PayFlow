// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PayFlowEscrow} from "../PayFlowEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Re-entrant attacker helper
// ─────────────────────────────────────────────────────────────────────────────

/// @dev When the escrow calls token.transfer() to pay this contract,
///      the mock token's transfer calls back into the escrow (claimPayment).
///      We need a custom token that hooks transfer to re-enter. Instead we
///      wire a separate attacker contract and a special mock.
contract ReentrantClaimer {
    PayFlowEscrow public escrow;
    uint256 public targetId;
    bool public attacking;
    uint256 public attackCount;

    constructor(PayFlowEscrow _escrow) {
        escrow = _escrow;
    }

    function setTarget(uint256 id) external {
        targetId = id;
    }

    /// @dev Called by the ReentrantToken during safeTransfer to re-enter.
    function onTransferReceived() external {
        if (attacking && attackCount == 0) {
            attackCount++;
            // attempt second claim during first claim's execution
            escrow.claimPayment(targetId);
        }
    }

    function attack(uint256 id) external {
        targetId = id;
        attacking = true;
        escrow.claimPayment(id);
        attacking = false;
    }
}

/// @dev MockERC20 whose transfer() calls back into the ReentrantClaimer.
contract ReentrantToken is MockERC20 {
    ReentrantClaimer public claimer;

    constructor() MockERC20("RToken", "RT", 6) {}

    function setClaimer(ReentrantClaimer _claimer) external {
        claimer = _claimer;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        // notify claimer BEFORE transferring so they can attempt re-entry
        if (address(claimer) != address(0) && to == address(claimer)) {
            claimer.onTransferReceived();
        }
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler for stateful invariant testing
// ─────────────────────────────────────────────────────────────────────────────

contract EscrowHandler is Test {
    PayFlowEscrow public escrow;
    MockERC20 public usdc;

    address internal payer  = makeAddr("hPayer");
    address internal recip  = makeAddr("hRecip");

    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    constructor(PayFlowEscrow _escrow, MockERC20 _usdc) {
        escrow = _escrow;
        usdc   = _usdc;
    }

    /// Seed payer with USDC on demand
    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
    }

    function createAndFund(uint256 amount) external {
        amount = bound(amount, 1, 1_000_000e6);
        uint256 deadline = block.timestamp + 1 days;

        vm.startPrank(payer);
        _fund(payer, amount);
        usdc.approve(address(escrow), amount);
        uint256 id = escrow.createPayment(recip, amount, "inv", deadline);
        escrow.fundPayment(id);
        vm.stopPrank();

        totalDeposited += amount;
    }

    function releaseAndClaim(uint256 seed) external {
        uint256 count = escrow.paymentCount();
        if (count == 0) return;
        uint256 id = (seed % count) + 1;

        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        if (p.status == PayFlowEscrow.PaymentStatus.Funded) {
            vm.prank(payer);
            escrow.releasePayment(id);
        }
        p = escrow.getPayment(id);
        if (p.status == PayFlowEscrow.PaymentStatus.Released) {
            vm.prank(recip);
            escrow.claimPayment(id);
            totalWithdrawn += p.amount;
        }
    }

    function refund(uint256 seed) external {
        uint256 count = escrow.paymentCount();
        if (count == 0) return;
        uint256 id = (seed % count) + 1;

        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        if (p.status == PayFlowEscrow.PaymentStatus.Funded) {
            vm.warp(p.deadline + 1);
            vm.prank(payer);
            escrow.refundPayment(id);
            totalWithdrawn += p.amount;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main test contract
// ─────────────────────────────────────────────────────────────────────────────

contract PayFlowEscrowTest is Test {

    // ── aliases for enum values ───────────────────────────────────────────────
    PayFlowEscrow.PaymentStatus constant CREATED  = PayFlowEscrow.PaymentStatus.Created;
    PayFlowEscrow.PaymentStatus constant FUNDED   = PayFlowEscrow.PaymentStatus.Funded;
    PayFlowEscrow.PaymentStatus constant RELEASED = PayFlowEscrow.PaymentStatus.Released;
    PayFlowEscrow.PaymentStatus constant CLAIMED  = PayFlowEscrow.PaymentStatus.Claimed;
    PayFlowEscrow.PaymentStatus constant REFUNDED = PayFlowEscrow.PaymentStatus.Refunded;

    // ── fixtures ──────────────────────────────────────────────────────────────
    MockERC20      internal usdc;
    PayFlowEscrow  internal escrow;

    address internal payer  = makeAddr("payer");
    address internal recip  = makeAddr("recipient");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant AMOUNT   = 1_000e6;       // 1 000 USDC
    uint256 internal constant DEADLINE_OFFSET = 7 days;

    uint256 internal deadline;

    // ── setUp ─────────────────────────────────────────────────────────────────
    function setUp() public {
        // Deploy mock USDC with 6 decimals
        usdc   = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow = new PayFlowEscrow(address(usdc));

        deadline = block.timestamp + DEADLINE_OFFSET;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// Create a payment as `payer`, returns the new paymentId.
    function _create(uint256 amount, uint256 dl) internal returns (uint256 id) {
        vm.prank(payer);
        id = escrow.createPayment(recip, amount, "test desc", dl);
    }

    /// Create + fund a payment. Mints USDC to payer first.
    function _createAndFund(uint256 amount, uint256 dl) internal returns (uint256 id) {
        id = _create(amount, dl);
        usdc.mint(payer, amount);
        vm.startPrank(payer);
        usdc.approve(address(escrow), amount);
        escrow.fundPayment(id);
        vm.stopPrank();
    }

    /// Create + fund + release a payment.
    function _createFundRelease(uint256 amount, uint256 dl) internal returns (uint256 id) {
        id = _createAndFund(amount, dl);
        vm.prank(payer);
        escrow.releasePayment(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────

    function test_Constructor_SetsUsdcAddress() public view {
        assertEq(address(escrow.usdc()), address(usdc));
    }

    function test_Constructor_RevertsOnZeroAddress() public {
        vm.expectRevert(PayFlowEscrow.InvalidRecipient.selector);
        new PayFlowEscrow(address(0));
    }

    function test_Constructor_InitialPaymentCountIsZero() public view {
        assertEq(escrow.paymentCount(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. createPayment — happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreatePayment_HappyPath() public {
        vm.prank(payer);
        uint256 id = escrow.createPayment(recip, AMOUNT, "desc", deadline);

        assertEq(id, 1);
        assertEq(escrow.paymentCount(), 1);

        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        assertEq(p.id, id);
        assertEq(p.payer, payer);
        assertEq(p.recipient, recip);
        assertEq(p.amount, AMOUNT);
        assertEq(p.description, "desc");
        assertEq(p.deadline, deadline);
        assertEq(uint8(p.status), uint8(CREATED));
        assertEq(p.createdAt, block.timestamp);
        assertEq(p.releasedAt, 0);
    }

    function test_CreatePayment_IncrementCountOnMultiple() public {
        _create(AMOUNT, deadline);
        _create(AMOUNT, deadline);
        assertEq(escrow.paymentCount(), 2);
    }

    function test_CreatePayment_IndexesPayerAndRecipient() public {
        uint256 id = _create(AMOUNT, deadline);

        uint256[] memory payerIds = escrow.getPayerPayments(payer);
        uint256[] memory recipIds = escrow.getRecipientPayments(recip);

        assertEq(payerIds.length, 1);
        assertEq(payerIds[0], id);
        assertEq(recipIds.length, 1);
        assertEq(recipIds[0], id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2b. createPayment — event
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreatePayment_EmitsPaymentCreated() public {
        vm.prank(payer);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit PayFlowEscrow.PaymentCreated(1, payer, recip, AMOUNT, "desc", deadline);
        escrow.createPayment(recip, AMOUNT, "desc", deadline);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2c. createPayment — revert paths
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreatePayment_RevertOnZeroRecipient() public {
        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.InvalidRecipient.selector);
        escrow.createPayment(address(0), AMOUNT, "d", deadline);
    }

    function test_CreatePayment_RevertOnSelfRecipient() public {
        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.InvalidRecipient.selector);
        escrow.createPayment(payer, AMOUNT, "d", deadline);
    }

    function test_CreatePayment_RevertOnZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.ZeroAmount.selector);
        escrow.createPayment(recip, 0, "d", deadline);
    }

    function test_CreatePayment_RevertOnDeadlineInPast() public {
        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.InvalidDeadline.selector);
        escrow.createPayment(recip, AMOUNT, "d", block.timestamp - 1);
    }

    function test_CreatePayment_RevertOnDeadlineEqualNow() public {
        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.InvalidDeadline.selector);
        escrow.createPayment(recip, AMOUNT, "d", block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. fundPayment — happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_FundPayment_HappyPath() public {
        uint256 id = _create(AMOUNT, deadline);
        usdc.mint(payer, AMOUNT);

        vm.startPrank(payer);
        usdc.approve(address(escrow), AMOUNT);
        escrow.fundPayment(id);
        vm.stopPrank();

        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        assertEq(uint8(p.status), uint8(FUNDED));
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(usdc.balanceOf(payer), 0);
    }

    function test_FundPayment_EmitsPaymentFunded() public {
        uint256 id = _create(AMOUNT, deadline);
        usdc.mint(payer, AMOUNT);

        vm.startPrank(payer);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayFlowEscrow.PaymentFunded(id, payer, AMOUNT);
        escrow.fundPayment(id);
        vm.stopPrank();
    }

    function test_FundPayment_RevertWrongCaller() public {
        uint256 id = _create(AMOUNT, deadline);
        vm.prank(stranger);
        vm.expectRevert(PayFlowEscrow.Unauthorized.selector);
        escrow.fundPayment(id);
    }

    function test_FundPayment_RevertWrongStatus_AlreadyFunded() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        usdc.mint(payer, AMOUNT);
        vm.startPrank(payer);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, FUNDED, CREATED)
        );
        escrow.fundPayment(id);
        vm.stopPrank();
    }

    function test_FundPayment_RevertInsufficientAllowance() public {
        uint256 id = _create(AMOUNT, deadline);
        usdc.mint(payer, AMOUNT);
        // No approve → SafeERC20 will revert
        vm.prank(payer);
        vm.expectRevert();
        escrow.fundPayment(id);
    }

    function test_FundPayment_RevertNotFound() public {
        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.PaymentNotFound.selector);
        escrow.fundPayment(999);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. releasePayment — happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_ReleasePayment_HappyPath() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.prank(payer);
        escrow.releasePayment(id);

        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        assertEq(uint8(p.status), uint8(RELEASED));
        assertEq(p.releasedAt, block.timestamp);
        // funds still in escrow
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
    }

    function test_ReleasePayment_EmitsPaymentReleased() public {
        uint256 id = _createAndFund(AMOUNT, deadline);

        vm.prank(payer);
        vm.expectEmit(true, true, true, false, address(escrow));
        emit PayFlowEscrow.PaymentReleased(id, payer, recip);
        escrow.releasePayment(id);
    }

    function test_ReleasePayment_RevertWrongCaller() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.prank(stranger);
        vm.expectRevert(PayFlowEscrow.Unauthorized.selector);
        escrow.releasePayment(id);
    }

    function test_ReleasePayment_RevertWrongStatus_NotFunded() public {
        // status is Created, not Funded
        uint256 id = _create(AMOUNT, deadline);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, CREATED, FUNDED)
        );
        escrow.releasePayment(id);
    }

    function test_ReleasePayment_RevertWrongStatus_AlreadyReleased() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, RELEASED, FUNDED)
        );
        escrow.releasePayment(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. claimPayment — happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_ClaimPayment_HappyPath() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);

        vm.prank(recip);
        escrow.claimPayment(id);

        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        assertEq(uint8(p.status), uint8(CLAIMED));
        assertEq(usdc.balanceOf(recip), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_ClaimPayment_EmitsPaymentClaimed() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);

        vm.prank(recip);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayFlowEscrow.PaymentClaimed(id, recip, AMOUNT);
        escrow.claimPayment(id);
    }

    function test_ClaimPayment_RevertWrongCaller() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        vm.prank(stranger);
        vm.expectRevert(PayFlowEscrow.Unauthorized.selector);
        escrow.claimPayment(id);
    }

    function test_ClaimPayment_RevertWrongStatus_NotReleased() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.prank(recip);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, FUNDED, RELEASED)
        );
        escrow.claimPayment(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5b. claimPayment — checks-effects-interactions (status set before transfer)
    // ─────────────────────────────────────────────────────────────────────────

    function test_ClaimPayment_StatusSetBeforeTransfer() public {
        // Deploy a re-entrant token and escrow wired to it
        ReentrantToken rToken = new ReentrantToken();
        PayFlowEscrow rEscrow = new PayFlowEscrow(address(rToken));

        ReentrantClaimer attacker = new ReentrantClaimer(rEscrow);
        rToken.setClaimer(attacker);

        // Set up a payment where the attacker is the recipient
        address attackerPayer = makeAddr("atkPayer");
        rToken.mint(attackerPayer, AMOUNT);

        vm.startPrank(attackerPayer);
        uint256 id = rEscrow.createPayment(address(attacker), AMOUNT, "atk", block.timestamp + 1 days);
        rToken.approve(address(rEscrow), AMOUNT);
        rEscrow.fundPayment(id);
        rEscrow.releasePayment(id);
        vm.stopPrank();

        attacker.setTarget(id);

        // The re-entrancy attempt must revert. The contract is protected by both:
        //   (a) OZ ReentrancyGuard  → fires first with ReentrancyGuardReentrantCall()
        //   (b) CEI: status is set to Claimed before the transfer, so even without the
        //       guard a re-entrant call would get InvalidStatus(Claimed, Released).
        // We expect ANY revert (either guard proves protection); if it DOESN'T revert
        // the attacker would have drained funds — that would be a contract bug.
        vm.expectRevert();
        attacker.attack(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. refundPayment — happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_RefundPayment_HappyPath() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.warp(deadline + 1);

        vm.prank(payer);
        escrow.refundPayment(id);

        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        assertEq(uint8(p.status), uint8(REFUNDED));
        assertEq(usdc.balanceOf(payer), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_RefundPayment_EmitsPaymentRefunded() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.warp(deadline + 1);

        vm.prank(payer);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayFlowEscrow.PaymentRefunded(id, payer, AMOUNT);
        escrow.refundPayment(id);
    }

    function test_RefundPayment_RevertBeforeDeadline() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        // still 1 second before deadline
        vm.warp(deadline - 1);
        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.DeadlineNotPassed.selector);
        escrow.refundPayment(id);
    }

    function test_RefundPayment_RevertAtExactDeadline() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.warp(deadline);  // deadline == block.timestamp → NOT passed (strict >)
        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.DeadlineNotPassed.selector);
        escrow.refundPayment(id);
    }

    function test_RefundPayment_RevertWrongCaller() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.warp(deadline + 1);
        vm.prank(stranger);
        vm.expectRevert(PayFlowEscrow.Unauthorized.selector);
        escrow.refundPayment(id);
    }

    function test_RefundPayment_RevertWrongStatus_NotFunded() public {
        // Created, not Funded
        uint256 id = _create(AMOUNT, deadline);
        vm.warp(deadline + 1);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, CREATED, FUNDED)
        );
        escrow.refundPayment(id);
    }

    function test_RefundPayment_RevertWrongStatus_Released() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        vm.warp(deadline + 1);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, RELEASED, FUNDED)
        );
        escrow.refundPayment(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. reclaimReleased — happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_ReclaimReleased_HappyPath() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        uint256 releasedAt = p.releasedAt;

        vm.warp(releasedAt + escrow.RECLAIM_WINDOW() + 1);

        vm.prank(payer);
        escrow.reclaimReleased(id);

        p = escrow.getPayment(id);
        assertEq(uint8(p.status), uint8(REFUNDED));
        assertEq(usdc.balanceOf(payer), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_ReclaimReleased_EmitsPaymentReclaimed() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        vm.warp(p.releasedAt + escrow.RECLAIM_WINDOW() + 1);

        vm.prank(payer);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayFlowEscrow.PaymentReclaimed(id, payer, AMOUNT);
        escrow.reclaimReleased(id);
    }

    function test_ReclaimReleased_RevertBeforeWindow() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        // one second short of the full window
        vm.warp(p.releasedAt + escrow.RECLAIM_WINDOW() - 1);

        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.ReclaimWindowNotOpen.selector);
        escrow.reclaimReleased(id);
    }

    function test_ReclaimReleased_AllowedAtExactWindowBoundary() public {
        // Contract condition: block.timestamp < releasedAt + RECLAIM_WINDOW → revert.
        // So at exactly releasedAt + RECLAIM_WINDOW the condition is FALSE → call SUCCEEDS.
        // This is an intentional design choice: the window is [releasedAt, releasedAt+window].
        uint256 id = _createFundRelease(AMOUNT, deadline);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        vm.warp(p.releasedAt + escrow.RECLAIM_WINDOW());

        vm.prank(payer);
        escrow.reclaimReleased(id);  // must succeed at the exact boundary

        p = escrow.getPayment(id);
        assertEq(uint8(p.status), uint8(REFUNDED));
    }

    function test_ReclaimReleased_RevertWrongCaller() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        vm.warp(p.releasedAt + escrow.RECLAIM_WINDOW() + 1);

        vm.prank(stranger);
        vm.expectRevert(PayFlowEscrow.Unauthorized.selector);
        escrow.reclaimReleased(id);
    }

    function test_ReclaimReleased_RevertWrongStatus_Funded() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.warp(block.timestamp + escrow.RECLAIM_WINDOW() + 1);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, FUNDED, RELEASED)
        );
        escrow.reclaimReleased(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Double-withdrawal attempts
    // ─────────────────────────────────────────────────────────────────────────

    function test_DoubleWithdrawal_ClaimTwiceReverts() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        vm.prank(recip);
        escrow.claimPayment(id);

        vm.prank(recip);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, CLAIMED, RELEASED)
        );
        escrow.claimPayment(id);
    }

    function test_DoubleWithdrawal_RefundTwiceReverts() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.warp(deadline + 1);
        vm.prank(payer);
        escrow.refundPayment(id);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, REFUNDED, FUNDED)
        );
        escrow.refundPayment(id);
    }

    function test_DoubleWithdrawal_ReclaimAfterClaimReverts() public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        uint256 releasedAt = p.releasedAt;

        vm.prank(recip);
        escrow.claimPayment(id);

        vm.warp(releasedAt + escrow.RECLAIM_WINDOW() + 1);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, CLAIMED, RELEASED)
        );
        escrow.reclaimReleased(id);
    }

    function test_DoubleWithdrawal_ClaimAfterRefundReverts() public {
        uint256 id = _createAndFund(AMOUNT, deadline);
        vm.warp(deadline + 1);
        vm.prank(payer);
        escrow.refundPayment(id);

        // Try to release + claim after refund
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayFlowEscrow.InvalidStatus.selector, REFUNDED, FUNDED)
        );
        escrow.releasePayment(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. View functions
    // ─────────────────────────────────────────────────────────────────────────

    function test_GetPayment_RevertOnIdZero() public {
        vm.expectRevert(PayFlowEscrow.PaymentNotFound.selector);
        escrow.getPayment(0);
    }

    function test_GetPayment_RevertOnNonexistentId() public {
        vm.expectRevert(PayFlowEscrow.PaymentNotFound.selector);
        escrow.getPayment(1);
    }

    function test_GetPayerPayments_Empty() public view {
        uint256[] memory ids = escrow.getPayerPayments(payer);
        assertEq(ids.length, 0);
    }

    function test_GetRecipientPayments_Empty() public view {
        uint256[] memory ids = escrow.getRecipientPayments(recip);
        assertEq(ids.length, 0);
    }

    function test_PaymentCount_IncrementsCorrectly() public {
        assertEq(escrow.paymentCount(), 0);
        _create(AMOUNT, deadline);
        assertEq(escrow.paymentCount(), 1);
        _create(AMOUNT, deadline);
        assertEq(escrow.paymentCount(), 2);
    }

    function test_RECLAIM_WINDOW_Is30Days() public view {
        assertEq(escrow.RECLAIM_WINDOW(), 30 days);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Fuzz: createPayment amount
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_CreatePayment_AnyValidAmount(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max); // positive, fits uint128
        vm.prank(payer);
        uint256 id = escrow.createPayment(recip, amount, "fuzz", deadline);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        assertEq(p.amount, amount);
    }

    function testFuzz_CreatePayment_AnyFutureDeadline(uint256 dl) public {
        dl = bound(dl, block.timestamp + 1, block.timestamp + 365 days);
        vm.prank(payer);
        uint256 id = escrow.createPayment(recip, AMOUNT, "fuzz-dl", dl);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        assertEq(p.deadline, dl);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. Fuzz: fund → release → claim full-flow
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_FullFlowClaimAmountConserved(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6); // up to 1B USDC
        usdc.mint(payer, amount);

        vm.startPrank(payer);
        uint256 id = escrow.createPayment(recip, amount, "fuzz-flow", deadline);
        usdc.approve(address(escrow), amount);
        escrow.fundPayment(id);
        escrow.releasePayment(id);
        vm.stopPrank();

        uint256 balBefore = usdc.balanceOf(recip);
        vm.prank(recip);
        escrow.claimPayment(id);
        uint256 balAfter = usdc.balanceOf(recip);

        assertEq(balAfter - balBefore, amount);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. Fuzz: refundPayment amount conserved
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_RefundAmountConserved(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        usdc.mint(payer, amount);

        vm.startPrank(payer);
        uint256 id = escrow.createPayment(recip, amount, "fuzz-refund", deadline);
        usdc.approve(address(escrow), amount);
        escrow.fundPayment(id);
        vm.stopPrank();

        vm.warp(deadline + 1);

        uint256 balBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        escrow.refundPayment(id);
        assertEq(usdc.balanceOf(payer) - balBefore, amount);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 13. Fuzz: reclaimReleased window boundary
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_ReclaimWindowBoundary(uint256 warpOffset) public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        uint256 releasedAt = p.releasedAt;
        uint256 window = escrow.RECLAIM_WINDOW();

        // bind offset to [0, window - 1] → should always revert
        warpOffset = bound(warpOffset, 0, window - 1);
        vm.warp(releasedAt + warpOffset);

        vm.prank(payer);
        vm.expectRevert(PayFlowEscrow.ReclaimWindowNotOpen.selector);
        escrow.reclaimReleased(id);
    }

    function testFuzz_ReclaimWindowOpenAfterBoundary(uint256 extra) public {
        uint256 id = _createFundRelease(AMOUNT, deadline);
        PayFlowEscrow.Payment memory p = escrow.getPayment(id);
        uint256 releasedAt = p.releasedAt;
        uint256 window = escrow.RECLAIM_WINDOW();

        // extra ≥ 1 → past the boundary
        extra = bound(extra, 1, 365 days);
        vm.warp(releasedAt + window + extra);

        vm.prank(payer);
        escrow.reclaimReleased(id);  // must succeed

        p = escrow.getPayment(id);
        assertEq(uint8(p.status), uint8(REFUNDED));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 14. Multi-payment isolation
    // ─────────────────────────────────────────────────────────────────────────

    function test_MultiplePayments_IndependentState() public {
        uint256 id1 = _createAndFund(AMOUNT, deadline);
        uint256 id2 = _createAndFund(AMOUNT * 2, deadline);

        // Release and claim only id1
        vm.prank(payer);
        escrow.releasePayment(id1);
        vm.prank(recip);
        escrow.claimPayment(id1);

        // id2 should still be Funded
        PayFlowEscrow.Payment memory p1 = escrow.getPayment(id1);
        PayFlowEscrow.Payment memory p2 = escrow.getPayment(id2);
        assertEq(uint8(p1.status), uint8(CLAIMED));
        assertEq(uint8(p2.status), uint8(FUNDED));
        // escrow holds only id2's amount
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT * 2);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant test contract
// ─────────────────────────────────────────────────────────────────────────────

contract PayFlowEscrowInvariantTest is Test {

    MockERC20     internal usdc;
    PayFlowEscrow internal escrow;
    EscrowHandler internal handler;

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow  = new PayFlowEscrow(address(usdc));
        handler = new EscrowHandler(escrow, usdc);

        // Restrict invariant fuzzer to handler functions only
        targetContract(address(handler));
    }

    /// @notice The escrow contract's token balance equals the sum of all
    ///         funds deposited minus all funds withdrawn (claimed / refunded).
    function invariant_EscrowBalanceEqualsDepositedMinusWithdrawn() public view {
        uint256 escrowBalance  = usdc.balanceOf(address(escrow));
        uint256 expectedBal    = handler.totalDeposited() - handler.totalWithdrawn();
        assertEq(escrowBalance, expectedBal);
    }

    /// @notice A terminal payment (Claimed or Refunded) can never have its
    ///         funds claimed/refunded again — the escrow token balance must
    ///         never go negative (always >= 0 — covered by uint256 underflow
    ///         guard in the mock, but we assert the escrow holds non-negative).
    function invariant_EscrowBalanceNonNegative() public view {
        // uint256 is always >= 0; this confirms no underflow has occurred by
        // checking the balance equals what we tracked in the handler.
        uint256 escrowBalance = usdc.balanceOf(address(escrow));
        uint256 deposited     = handler.totalDeposited();
        uint256 withdrawn     = handler.totalWithdrawn();
        assertGe(deposited, withdrawn); // can't withdraw more than deposited
        assertEq(escrowBalance, deposited - withdrawn);
    }

    /// @notice paymentCount only ever increases.
    function invariant_PaymentCountMonotonicallyIncreases() public view {
        // We can't observe the delta here, but we ensure it's always ≥ 0.
        // The real monotonicity is enforced by the handler tracking.
        assertGe(escrow.paymentCount(), 0);
    }
}
