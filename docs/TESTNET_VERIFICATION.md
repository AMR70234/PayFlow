# PayFlow — Testnet End-to-End Verification Guide

**Purpose:** Confirm every payment flow works on Arc Testnet and collect the onchain evidence needed for the Arc Microgrants application.

**Do not use real USDC. All steps use Arc Testnet (chain ID 5042002).**

---

## Setup

### Wallets needed

You need two separate wallet addresses for a full test:

- **Wallet A (Payer):** your main browser wallet (MetaMask or similar), connected to Arc Testnet.
- **Wallet B (Recipient):** a second address you control (a second MetaMask account, a hardware wallet address, or any other EOA you can switch to).

Write them down:
```
Wallet A (payer):    0x_________________________________
Wallet B (recipient): 0x_________________________________
```

### Fund Wallet A with test USDC

1. Connect Wallet A to the app.
2. Click **"Get test USDC"** in the Arc Studio sidebar (left panel).
3. Wait for the drip — you'll receive test USDC on Arc Testnet.
4. Confirm the USDC balance appears in the PayFlow dashboard header.

### Add Arc Testnet to MetaMask (if needed)

| Field | Value |
|-------|-------|
| Network name | Arc Testnet |
| RPC URL | `https://rpc.testnet.arc.io` |
| Chain ID | `5042002` |
| Currency symbol | USDC |
| Explorer | `https://explorer.testnet.arc.io` |

---

## Flow 1 — Full Happy Path (Create → Fund → Release → Claim)

**Evidence collected:** 4 transactions, all visible on explorer.

### Step 1.1 — Create a payment

1. Connect **Wallet A**.
2. Click **"New Payment"** on the dashboard.
3. Fill in:
   - Recipient: **Wallet B address**
   - Amount: **2 USDC** (or any amount you have)
   - Description: `"Arc Microgrants test - flow 1"`
   - Deadline: tomorrow's date
4. Click **"Create Payment"** — your wallet prompts for a transaction.
5. Confirm in your wallet.
6. The app navigates to My Payments. Find the new payment — status: **"Awaiting Deposit"**.

**Record:** Transaction hash from your wallet or the explorer. Label: `CREATE_TX_1`

### Step 1.2 — Fund the payment (approve + deposit)

1. Open the payment detail page.
2. Click **"Approve USDC"** — this calls `approve()` on the USDC contract, authorizing the escrow to spend exactly 2 USDC.
3. Confirm in your wallet.
4. Wait for confirmation (the button updates to "Deposit Funds").
5. Click **"Deposit Funds"** — calls `fundPayment()`.
6. Confirm in your wallet.
7. Status changes to **"Funded"**. The 2 USDC leaves Wallet A.

**Record:** `APPROVE_TX_1` and `FUND_TX_1`

### Step 1.3 — Release the payment

1. Still as Wallet A (payer).
2. Click **"Release to Recipient"** — calls `releasePayment()`.
3. Confirm in your wallet.
4. Status changes to **"Released"**.

**Record:** `RELEASE_TX_1`

### Step 1.4 — Claim the payment

1. Switch your wallet to **Wallet B** (the recipient).
2. In the app, navigate to **My Payments → Incoming**.
3. Find the payment (status: "Released").
4. Click **"Claim Funds"** — calls `claimPayment()`.
5. Confirm in your wallet.
6. Status changes to **"Completed"**.
7. Wallet B USDC balance increases by 2 USDC.

**Record:** `CLAIM_TX_1`

### Verify on explorer

Open https://explorer.testnet.arc.io and search for each transaction hash. Confirm:
- Each transaction shows "Success"
- The `to` address matches the contract (`0x100b29f17ee15e685c006d3cd067737d99060a22`)
- The final claim shows USDC transferred to Wallet B

---

## Flow 2 — Refund After Deadline

**Note:** The UI enforces a minimum deadline of tomorrow. To test the refund path quickly, use `cast` to create a payment with a 2-minute deadline, or create a payment normally and wait for its deadline to pass.

**Fast path using cast (optional):**
```bash
export RPC=https://rpc.testnet.arc.io
export CONTRACT=0x100b29f17ee15e685c006d3cd067737d99060a22
export USDC=0x3600000000000000000000000000000000000000
export PK_A=<wallet-a-private-key>     # testnet only — never use a mainnet key

# Create payment with 2-minute deadline
DEADLINE=$(( $(date +%s) + 120 ))
cast send $CONTRACT \
  "createPayment(address,uint256,string,uint256)" \
  <wallet-b-address> 1000000 "Refund test" $DEADLINE \
  --rpc-url $RPC --private-key $PK_A

# Approve USDC
cast send $USDC "approve(address,uint256)" $CONTRACT 1000000 \
  --rpc-url $RPC --private-key $PK_A

# Fund (use payment ID shown in cast output or paymentCount())
cast send $CONTRACT "fundPayment(uint256)" <ID> \
  --rpc-url $RPC --private-key $PK_A

# Wait 2+ minutes, then refund
sleep 130
cast send $CONTRACT "refundPayment(uint256)" <ID> \
  --rpc-url $RPC --private-key $PK_A
```

**UI path (slower):**
1. Create a payment with tomorrow's deadline. Fund it.
2. Wait until the deadline passes (or advance time via cast if on a local fork).
3. Open the payment detail. The "Refund" button appears once the deadline is past.
4. Click "Refund" — calls `refundPayment()`.
5. Status changes to **"Refunded"**. USDC returns to Wallet A.

**Record:** `REFUND_TX_1`

---

## Flow 3 — Wrong Chain Guard

1. Switch your wallet to a different network (e.g. Ethereum Mainnet or Polygon).
2. Open the PayFlow app.
3. Confirm: red "Wrong network" badge appears in the header.
4. Confirm: red banner "Switch to Arc Testnet to use PayFlow" appears below the header.
5. Attempt to click any action button — it should be disabled or prompt a chain switch, not submit a transaction.

**Record:** Screenshot of the wrong-chain state. No transaction hash needed.

---

## Evidence to Collect for the Grant Application

Collect all of the following. Keep a text file with every hash and screenshot path.

### Transaction evidence

| Label | What it proves | Where to find it |
|-------|---------------|------------------|
| `CREATE_TX_1` | `createPayment()` called successfully | Wallet history or Arc Testnet explorer |
| `APPROVE_TX_1` | ERC-20 `approve()` on USDC contract | Wallet history |
| `FUND_TX_1` | `fundPayment()` — USDC entered escrow | Wallet history or explorer |
| `RELEASE_TX_1` | `releasePayment()` — payer approved delivery | Wallet history or explorer |
| `CLAIM_TX_1` | `claimPayment()` — recipient received USDC | Wallet history or explorer |
| `REFUND_TX_1` | `refundPayment()` — payer reclaimed after deadline | Wallet history or explorer |

For each transaction hash, confirm it on the explorer: `https://explorer.testnet.arc.io/tx/<hash>`

### Contract evidence

| Item | Value | How to verify |
|------|-------|---------------|
| Contract address (Testnet) | `0x100b29f17ee15e685c006d3cd067737d99060a22` | Arc Testnet explorer |
| Deploy transaction | `0x70d49b3ce6ae5b27ee725619ddd20015c3fd636b30d00cdcb62a5356ffea6c78` | Arc Testnet explorer |
| USDC address in contract | `0x3600000000000000000000000000000000000000` | `cast call $CONTRACT "usdc()(address)" --rpc-url $RPC` |
| Payment count after test | Should be ≥ 2 | `cast call $CONTRACT "paymentCount()(uint256)" --rpc-url $RPC` |

### Screenshots to take

1. **Dashboard** — after flows complete, showing non-zero stats (payments created, completed).
2. **Payment Detail — Completed status** — payment from Flow 1 showing "Completed" with all transaction hashes visible.
3. **Payment Detail — Refunded status** — payment from Flow 2 showing "Refunded".
4. **My Payments — Outgoing tab** — Wallet A view showing both payments.
5. **My Payments — Incoming tab** — Wallet B view showing the completed incoming payment.
6. **Wrong network state** — red banner visible.
7. **Arc Testnet Explorer — contract page** — showing the contract address and transaction list.

---

## Minimum Evidence for Grant Submission

If time is limited, focus on **Flow 1** (create → fund → release → claim). The four transactions from this flow, plus the deploy transaction, demonstrate:

1. The contract is deployed and live on Arc Testnet.
2. Real USDC moves from payer → escrow → recipient through the contract.
3. The frontend correctly drives every step without any mocked state.

This satisfies the core requirement: "A user can connect a wallet, create a payment, deposit real USDC, release it under the defined conditions, and verify the resulting onchain transactions on Arc Explorer."

---

## Mainnet Equivalent

Once you deploy to Arc Mainnet (see MAINNET_MIGRATION.md), repeat Flow 1 with a small amount of real USDC (e.g. 0.10 USDC). The claim transaction hash on Mainnet is the final piece of evidence for the grant submission's mainnet requirement.
