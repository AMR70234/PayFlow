// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PayFlowEscrow
/// @notice Permissionless USDC escrow for conditional freelancer/client payments.
/// @dev Amounts are expected to use USDC 6-decimal units.
contract PayFlowEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum PaymentStatus {
        Created,
        Funded,
        Released,
        Claimed,
        Refunded
    }

    struct Payment {
        uint256 id;
        address payer;
        address recipient;
        uint256 amount;
        string description;
        uint256 deadline;
        PaymentStatus status;
        uint256 createdAt;
        /// @dev Timestamp when releasePayment was called; used for reclaim-window check.
        uint256 releasedAt;
    }

    error PaymentNotFound();
    error Unauthorized();
    error InvalidStatus(PaymentStatus current, PaymentStatus required);
    error ZeroAmount();
    error InvalidDeadline();
    error InvalidRecipient();
    error TransferFailed();
    error DeadlineNotPassed();
    error ReclaimWindowNotOpen();

    event PaymentCreated(
        uint256 indexed paymentId,
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        string description,
        uint256 deadline
    );
    event PaymentFunded(uint256 indexed paymentId, address indexed payer, uint256 amount);
    event PaymentReleased(uint256 indexed paymentId, address indexed payer, address indexed recipient);
    event PaymentClaimed(uint256 indexed paymentId, address indexed recipient, uint256 amount);
    event PaymentRefunded(uint256 indexed paymentId, address indexed payer, uint256 amount);
    event PaymentReclaimed(uint256 indexed paymentId, address indexed payer, uint256 amount);

    /// @notice Duration after releasePayment that a payer may reclaim stuck funds
    /// if the recipient cannot claim (e.g. blocklisted). 30 days.
    uint256 public constant RECLAIM_WINDOW = 30 days;

    IERC20 public immutable usdc;

    uint256 private _paymentCount;
    mapping(uint256 => Payment) private _payments;
    mapping(address => uint256[]) private _payerPayments;
    mapping(address => uint256[]) private _recipientPayments;

    constructor(address usdcAddress) {
        if (usdcAddress == address(0)) revert InvalidRecipient();
        usdc = IERC20(usdcAddress);
    }

    function createPayment(
        address recipient,
        uint256 amount,
        string calldata description,
        uint256 deadline
    ) external nonReentrant returns (uint256 paymentId) {
        if (recipient == address(0) || recipient == msg.sender) revert InvalidRecipient();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        unchecked {
            _paymentCount += 1;
        }
        paymentId = _paymentCount;

        _payments[paymentId] = Payment({
            id: paymentId,
            payer: msg.sender,
            recipient: recipient,
            amount: amount,
            description: description,
            deadline: deadline,
            status: PaymentStatus.Created,
            createdAt: block.timestamp,
            releasedAt: 0
        });

        _payerPayments[msg.sender].push(paymentId);
        _recipientPayments[recipient].push(paymentId);

        emit PaymentCreated(paymentId, msg.sender, recipient, amount, description, deadline);
    }

    function fundPayment(uint256 paymentId) external nonReentrant {
        Payment storage payment = _getPayment(paymentId);

        if (msg.sender != payment.payer) revert Unauthorized();
        if (payment.status != PaymentStatus.Created) {
            revert InvalidStatus(payment.status, PaymentStatus.Created);
        }

        usdc.safeTransferFrom(msg.sender, address(this), payment.amount);

        payment.status = PaymentStatus.Funded;

        emit PaymentFunded(paymentId, msg.sender, payment.amount);
    }

    function releasePayment(uint256 paymentId) external nonReentrant {
        Payment storage payment = _getPayment(paymentId);

        if (msg.sender != payment.payer) revert Unauthorized();
        if (payment.status != PaymentStatus.Funded) {
            revert InvalidStatus(payment.status, PaymentStatus.Funded);
        }

        payment.status = PaymentStatus.Released;
        payment.releasedAt = block.timestamp;

        emit PaymentReleased(paymentId, payment.payer, payment.recipient);
    }

    function claimPayment(uint256 paymentId) external nonReentrant {
        Payment storage payment = _getPayment(paymentId);

        if (msg.sender != payment.recipient) revert Unauthorized();
        if (payment.status != PaymentStatus.Released) {
            revert InvalidStatus(payment.status, PaymentStatus.Released);
        }

        payment.status = PaymentStatus.Claimed;
        usdc.safeTransfer(payment.recipient, payment.amount);

        emit PaymentClaimed(paymentId, payment.recipient, payment.amount);
    }

    function refundPayment(uint256 paymentId) external nonReentrant {
        Payment storage payment = _getPayment(paymentId);

        if (msg.sender != payment.payer) revert Unauthorized();
        if (payment.status != PaymentStatus.Funded) {
            revert InvalidStatus(payment.status, PaymentStatus.Funded);
        }
        if (block.timestamp <= payment.deadline) revert DeadlineNotPassed();

        payment.status = PaymentStatus.Refunded;
        usdc.safeTransfer(payment.payer, payment.amount);

        emit PaymentRefunded(paymentId, payment.payer, payment.amount);
    }

    /// @notice Allows the payer to reclaim escrowed funds from a Released-but-unclaimed
    ///         payment after RECLAIM_WINDOW has elapsed since release. This exists as a
    ///         recovery path when the recipient is permanently unable to receive USDC
    ///         (e.g. Circle USDC blocklist). The payer loses the guarantee of delivery
    ///         by calling this; use only when the recipient cannot claim.
    /// @param paymentId The ID of the payment to reclaim.
    function reclaimReleased(uint256 paymentId) external nonReentrant {
        Payment storage payment = _getPayment(paymentId);

        if (msg.sender != payment.payer) revert Unauthorized();
        if (payment.status != PaymentStatus.Released) {
            revert InvalidStatus(payment.status, PaymentStatus.Released);
        }
        if (block.timestamp < payment.releasedAt + RECLAIM_WINDOW) {
            revert ReclaimWindowNotOpen();
        }

        payment.status = PaymentStatus.Refunded;
        usdc.safeTransfer(payment.payer, payment.amount);

        emit PaymentReclaimed(paymentId, payment.payer, payment.amount);
    }

    function getPayment(uint256 paymentId) external view returns (Payment memory) {
        Payment storage payment = _getPayment(paymentId);
        return payment;
    }

    function getPayerPayments(address payer) external view returns (uint256[] memory) {
        return _payerPayments[payer];
    }

    function getRecipientPayments(address recipient) external view returns (uint256[] memory) {
        return _recipientPayments[recipient];
    }

    function paymentCount() external view returns (uint256) {
        return _paymentCount;
    }

    function _getPayment(uint256 paymentId) internal view returns (Payment storage payment) {
        if (paymentId == 0 || paymentId > _paymentCount) revert PaymentNotFound();
        payment = _payments[paymentId];
    }
}
