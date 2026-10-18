# PayFlow — Smart Conditional Payments

> **Built entirely with Arc Studio by Circle.**
> Arc Microgrants: Built with Arc Studio submission.

PayFlow is a USDC escrow application for freelancers, clients, and small teams. A payer deposits USDC into a smart contract, specifies the recipient and a deadline, and funds are released only when the defined conditions are met. All logic runs onchain — no intermediaries, no custody.

---

## Live App (Testnet)

Connect MetaMask to Arc Testnet (chain ID 5042002) and use the "Get test USDC" button in Arc Studio to fund your wallet.

**Testnet contract:** `0x100b29f17ee15e685c006d3cd067737d99060a22`
[View on Arc Testnet Explorer](https://explorer.testnet.arc.io/address/0x100b29f17ee15e685c006d3cd067737d99060a22)

---

## Architecture

```
Frontend (React + wagmi)
    │
    ├── ConnectKit wallet connection
    ├── useReadContract / useWriteContract (wagmi v2)
    └── All state reads from and writes to PayFlowEscrow
            │
            └── PayFlowEscrow.sol (Solidity 0.8.28)
                    │
                    └── USDC ERC-20 (0x3600...0000)
                        Arc Testnet / Arc Mainnet (same address)
```

**Stack:**
- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem, ConnectKit
- Contracts: Solidity + Foundry (OpenZeppelin 5.1.0)
- Chain: Arc (USDC-as-native-gas, sub-second finality, stable fees)

---

## Payment Lifecycle

```
createPayment()      → status: Created   (payment record exists, no funds)
fundPayment()        → status: Funded    (USDC deposited by payer)
releasePayment()     → status: Released  (payer approves delivery)
claimPayment()       → status: Claimed   [TERMINAL — recipient received USDC]

OR

refundPayment()      → status: Refunded  [TERMINAL — payer reclaimed after deadline]

OR (recovery path)

reclaimReleased()    → status: Refunded  [TERMINAL — payer reclaimed 30d after release]
```

State transitions are enforced onchain. No transition can be reversed. Each terminal state rejects all further writes.

---

## Contract Functions

| Function | Who | Precondition |
|----------|-----|--------------|
| `createPayment(recipient, amount, description, deadline)` | Anyone | recipient ≠ sender, amount > 0, deadline in future |
| `fundPayment(paymentId)` | Payer | status == Created, ERC-20 allowance ≥ amount |
| `releasePayment(paymentId)` | Payer | status == Funded |
| `claimPayment(paymentId)` | Recipient | status == Released |
| `refundPayment(paymentId)` | Payer | status == Funded, block.timestamp > deadline |
| `reclaimReleased(paymentId)` | Payer | status == Released, 30 days elapsed since release |

View: `getPayment`, `getPayerPayments`, `getRecipientPayments`, `paymentCount`, `usdc`, `RECLAIM_WINDOW`

---

## Security

| Property | Implementation |
|----------|----------------|
| Reentrancy | `nonReentrant` on all 5 state-changing functions |
| Safe token transfers | `SafeERC20.safeTransferFrom` / `safeTransfer` |
| Checks-effects-interactions | Status updated before token transfer on all fund-out paths |
| Double withdrawal | Status enum — each terminal state rejects all further writes |
| No admin key | No owner, no pause, no upgrade — fully permissionless |
| USDC address immutability | `immutable` set at construction, cannot be changed |
| Blocklist recovery | `reclaimReleased()` available 30 days after release |

**This contract has not been audited by a third-party security firm.** A balanced review was completed in Arc Studio and one Critical finding (funds lock on blocklisted recipient) was identified and fixed. An independent professional audit is required before deploying with real economic value.

### Remaining Known Risks

- `block.timestamp` manipulation: validators can shift by seconds to minutes — acceptable for day-scale deadlines.
- Payer controls release unilaterally: if a payer funds a payment and goes dark before the deadline, the recipient has no recourse until the deadline passes.
- No maximum deadline: a payer can create a payment with a deadline decades in the future.
- No dispute resolution: intentional MVP simplicity — a future version could add escrow agents or arbitration.

---

## Deployment Configuration

### Arc Testnet

| Parameter | Value |
|-----------|-------|
| Chain ID | 5042002 |
| RPC | `https://rpc.testnet.arc.io` |
| Explorer | `https://explorer.testnet.arc.io` |
| USDC | `0x3600000000000000000000000000000000000000` |
| **Contract** | **`0x100b29f17ee15e685c006d3cd067737d99060a22`** |
| Deploy tx | `0x70d49b3ce6ae5b27ee725619ddd20015c3fd636b30d00cdcb62a5356ffea6c78` |

### Arc Mainnet (planned)

| Parameter | Value |
|-----------|-------|
| Chain ID | 5042 |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.arc.io` |
| USDC | `0x3600000000000000000000000000000000000000` (verified live Oct 18 2026) |
| **Contract** | **Pending — see MAINNET_MIGRATION.md** |

The USDC address is identical on Testnet and Mainnet. The constructor argument for mainnet deployment is unchanged.

---

## Development Setup

```bash
# Install dependencies
bun install

# Run the frontend (Arc Testnet)
bun run dev

# Build contracts
bun run contracts:build    # forge build

# Run all 61 tests
bun run contracts:test     # forge test

# Lint + typecheck frontend
bun run check
```

---

## Documentation

| Document | Contents |
|----------|----------|
| `docs/DEPLOYMENT.md` | Local setup, test commands, cast examples, Testnet end-to-end flow |
| `docs/MAINNET_MIGRATION.md` | Step-by-step Mainnet deploy + frontend migration guide |
| `docs/SUBMISSION_CHECKLIST.md` | Grant requirements checklist — done vs. needs your action |
| `docs/mainnet-readiness-review.md` | Full security and config review from Oct 17 2026 |

---

## How Arc Studio Was Used

This project was built end-to-end in Arc Studio, starting from a blank project:

1. **Contract** — Written by Arc Studio's contract writer from a detailed spec, with OpenZeppelin security primitives.
2. **Security review** — A balanced review ran automatically. One Critical finding (funds-lock on blocklisted recipient) was identified and fixed by adding the `reclaimReleased()` recovery function.
3. **Unit + invariant tests** — 61 tests written and run in Arc Studio (58 unit, 3 invariant; 128k calls/invariant). All pass.
4. **Testnet deployment** — Deployed to Arc Testnet via Arc Studio's platform deployer. Address: `0x100b29f17ee15e685c006d3cd067737d99060a22`.
5. **Frontend** — Full React/wagmi application built in Arc Studio with Arc Dark design language.
6. **Deployment-readiness review** — USDC address and chain ID verified by live `eth_call` to Arc Mainnet. Mainnet deployment checklist produced.
7. **Submission docs** — DEPLOYMENT.md, MAINNET_MIGRATION.md, SUBMISSION_CHECKLIST.md all written in Arc Studio.

---

## Arc Microgrants Submission Status

| Deliverable | Status |
|-------------|--------|
| Smart contract (Arc Studio) | DONE |
| 61/61 tests passing | DONE |
| Working frontend | DONE |
| Testnet deployment + explorer link | DONE |
| README | DONE |
| Deployment + migration docs | DONE |
| Public app URL | **[YOUR ACTION]** Deploy via Integrations |
| Public GitHub repository | **[YOUR ACTION]** Push via Integrations |
| Independent security audit | **[YOUR ACTION]** Prerequisite for Mainnet |
| Arc Mainnet deployment | **[YOUR ACTION]** After audit — see MAINNET_MIGRATION.md |
| Confirmed Mainnet transaction | **[YOUR ACTION]** After Mainnet deployment |

See `docs/SUBMISSION_CHECKLIST.md` for the full itemized checklist.
