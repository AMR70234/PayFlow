# PayFlow — Local Setup and Deployment Guide

This document covers everything needed to run PayFlow locally from the Arc Studio export, run tests, deploy to Testnet, and deploy to Arc Mainnet.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| Bun | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| Foundry | latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Git | any | system package manager |

---

## 1. Clone and Install

```bash
git clone https://github.com/<your-org>/payflow.git
cd payflow
bun install
```

---

## 2. Run the Frontend (Testnet)

```bash
bun run dev
# Open http://localhost:5173
```

The app is pre-configured for Arc Testnet (chain ID 5042002). Connect MetaMask (or any injected wallet) and switch it to Arc Testnet. Use the "Get test USDC" button in the Arc Studio sidebar to fund your wallet.

---

## 3. Build and Test the Smart Contract

```bash
# Compile
bun run contracts:build
# or: forge build

# Run all 61 tests
bun run contracts:test
# or: forge test

# Verbose output
forge test -v

# Run a specific test
forge test --match-test test_FundPayment_HappyPath -vvv
```

Expected: **61 passed, 0 failed, 0 skipped.**

---

## 4. Lint and Typecheck the Frontend

```bash
bun run check
```

Expected: 0 errors. Warnings are acceptable.

---

## 5. Deployed Testnet Contract

The contract is already deployed on Arc Testnet at:

```
0x100b29f17ee15e685c006d3cd067737d99060a22
```

Explorer: https://explorer.testnet.arc.io/address/0x100b29f17ee15e685c006d3cd067737d99060a22

Deploy transaction: `0x70d49b3ce6ae5b27ee725619ddd20015c3fd636b30d00cdcb62a5356ffea6c78`

Constructor argument (USDC on Arc Testnet): `0x3600000000000000000000000000000000000000`

---

## 6. Testnet End-to-End Flow (Manual Verification)

To verify every payment flow on Testnet before submitting or deploying to Mainnet:

**Setup:**
- Wallet A = payer (connect to Arc Testnet, fund with test USDC)
- Wallet B = recipient (any address different from A)

**Flow 1 — Full release and claim:**
1. Connect Wallet A. Click "New Payment".
2. Enter Wallet B address, amount (e.g. 5 USDC), description, deadline (tomorrow).
3. Submit — confirm the `createPayment` transaction in your wallet.
4. On the Payment Detail page, click "Approve USDC" — this calls `approve` on the USDC contract.
5. Click "Deposit Funds" — this calls `fundPayment`. Payment status changes to "Funded".
6. Click "Release to Recipient" — calls `releasePayment`. Status changes to "Released".
7. Switch to Wallet B. Navigate to My Payments → Incoming. Find the payment.
8. Click "Claim Funds" — calls `claimPayment`. Status changes to "Completed".
9. Verify Wallet B USDC balance increased by the payment amount.
10. Verify all four transactions on Arc Testnet explorer.

**Flow 2 — Refund after deadline:**
1. Create a payment with a deadline in the near future (minimum: tomorrow per UI, but you can lower this to 1 minute in a test by calling `createPayment` directly via `cast send`).
2. Fund the payment.
3. Wait for (or fast-forward via `cast rpc evm_increaseTime`) past the deadline.
4. As payer, click "Refund" — calls `refundPayment`. Status changes to "Refunded".
5. Verify payer USDC balance restored.

**cast commands for direct contract interaction (optional):**
```bash
# Set these once
export RPC=https://rpc.testnet.arc.io
export CONTRACT=0x100b29f17ee15e685c006d3cd067737d99060a22
export USDC=0x3600000000000000000000000000000000000000
export PK=<your-testnet-private-key>   # never use a mainnet key here

# Create a payment (deadline = 1 day from now)
cast send $CONTRACT \
  "createPayment(address,uint256,string,uint256)" \
  <recipient> 5000000 "Test payment" $(( $(date +%s) + 86400 )) \
  --rpc-url $RPC --private-key $PK

# Approve USDC spend
cast send $USDC "approve(address,uint256)" $CONTRACT 5000000 \
  --rpc-url $RPC --private-key $PK

# Fund payment ID 1
cast send $CONTRACT "fundPayment(uint256)" 1 \
  --rpc-url $RPC --private-key $PK

# Release (payer)
cast send $CONTRACT "releasePayment(uint256)" 1 \
  --rpc-url $RPC --private-key $PK

# Claim (recipient — switch to recipient PK)
cast send $CONTRACT "claimPayment(uint256)" 1 \
  --rpc-url $RPC --private-key <recipient-pk>

# Read payment state
cast call $CONTRACT "getPayment(uint256)" 1 --rpc-url $RPC
```

---

## 7. Re-deploy to Arc Testnet (optional)

If you want a fresh Testnet deployment:

```bash
forge create contracts/PayFlowEscrow.sol:PayFlowEscrow \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $PK \
  --constructor-args 0x3600000000000000000000000000000000000000
```

Update `src/contract.ts` with the new address.

---

## 8. Deploy to Arc Mainnet

**See [MAINNET_MIGRATION.md](./MAINNET_MIGRATION.md) for the full step-by-step mainnet deployment process.**

Summary of prerequisites before running any mainnet command:
- Complete all Testnet verification flows (Section 6 above).
- Obtain an independent professional security audit.
- Fund a dedicated deployer wallet with at least 1 USDC on Arc Mainnet for gas.
- Export `MAINNET_PK` to your environment (never commit it).

```bash
# Dry-run first — no broadcast
forge create contracts/PayFlowEscrow.sol:PayFlowEscrow \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $MAINNET_PK \
  --constructor-args 0x3600000000000000000000000000000000000000 \
  --simulate

# Deploy
forge create contracts/PayFlowEscrow.sol:PayFlowEscrow \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $MAINNET_PK \
  --constructor-args 0x3600000000000000000000000000000000000000
```

Record the deployed address. Then follow MAINNET_MIGRATION.md to update the frontend.

---

## Contract ABI

The compiled ABI is at `contracts/out/PayFlowEscrow.sol/PayFlowEscrow.json`.

Key functions:

| Function | Signature |
|----------|-----------|
| Create | `createPayment(address recipient, uint256 amount, string description, uint256 deadline) returns (uint256)` |
| Fund | `fundPayment(uint256 paymentId)` |
| Release | `releasePayment(uint256 paymentId)` |
| Claim | `claimPayment(uint256 paymentId)` |
| Refund | `refundPayment(uint256 paymentId)` |
| Reclaim | `reclaimReleased(uint256 paymentId)` |
| Read | `getPayment(uint256) returns (Payment)` |
| Read | `getPayerPayments(address) returns (uint256[])` |
| Read | `getRecipientPayments(address) returns (uint256[])` |
| Read | `paymentCount() returns (uint256)` |
| Read | `usdc() returns (address)` |
| Constant | `RECLAIM_WINDOW() returns (uint256)` — 2592000 (30 days in seconds) |
