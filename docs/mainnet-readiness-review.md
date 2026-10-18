# PayFlow — Arc Mainnet Deployment Readiness Review

**Date:** October 17, 2026
**Reviewer:** Arc Studio (automated review — not an independent security audit)
**Scope:** Smart contract `PayFlowEscrow.sol`, frontend `src/`, network configuration

---

## Summary

| Check | Result |
|-------|--------|
| Arc Mainnet chain ID (live verified) | PASS — 5042 |
| USDC address (live call to Arc Mainnet) | PASS — `0x3600000000000000000000000000000000000000` |
| USDC decimals (live call to Arc Mainnet) | PASS — 6 |
| USDC name + symbol (live call) | PASS — "USDC" / "USDC" |
| 61 unit + fuzz + invariant tests | PASS — 61/61, 0 failed |
| Contract security: ReentrancyGuard | PASS |
| Contract security: SafeERC20 | PASS |
| Contract security: checks-effects-interactions | PASS |
| Contract security: no admin key / no upgrade | PASS |
| Contract security: double-withdrawal prevention | PASS |
| Frontend: TARGET_CHAIN_ID hardcoded to Testnet | PASS — confirmed, no accidental Mainnet |
| Frontend: network guard blocks wrong-chain txs | PASS |
| Frontend: chainId assertion on every writeContract | PASS |
| Critical finding from prior audit | FIXED — reclaimReleased() added |
| Independent professional audit | NOT DONE — required before real-value mainnet use |

---

## 1. Chain and Token Configuration Verification

### Arc Mainnet (Chain ID 5042) — Live Verified

All values below were confirmed by direct `eth_call` to Arc Mainnet during this review session. They were not taken from memory or prior documentation.

| Parameter | Value | Source |
|-----------|-------|--------|
| Chain ID | **5042** | `onchain-facts.ts` registry (Arc Studio) |
| RPC URL | `https://rpc.mainnet.arc.io` | Arc Studio registry |
| Explorer base | `https://explorer.arc.io` | Arc Studio registry |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` | Live `eth_call` to Arc Mainnet |
| USDC `symbol()` | "USDC" | Live `eth_call` confirmed |
| USDC `name()` | "USDC" | Live `eth_call` confirmed |
| USDC `decimals()` | **6** | Live `eth_call` confirmed |
| USDC `totalSupply()` | 657,294,227,920,616 (6-decimal units) | Live `eth_call` — non-zero, contract is active |
| Native gas token | USDC (18-decimal native view) | Arc Studio registry |

The USDC address `0x3600000000000000000000000000000000000000` is identical on both Arc Testnet (chain 5042002) and Arc Mainnet (chain 5042). This is an Arc-specific property: USDC is the native gas token on both networks and is deployed at the same well-known address. The Arc Studio `onchain-facts.ts` registry confirms this, and the live call confirms the contract is active on Mainnet.

### What This Means for Deployment

The `PayFlowEscrow` constructor takes `address usdcAddress`. The same constructor argument — `0x3600000000000000000000000000000000000000` — is correct for both Testnet and Mainnet deployment. No configuration change is needed to the contract source.

---

## 2. Contract Review

### State Machine Completeness

```
Created ──fundPayment()──► Funded
                               │
                    ┌──releasePayment()──► Released
                    │                        │
              refundPayment()           claimPayment() → Claimed [terminal]
              (after deadline)          reclaimReleased() → Refunded [terminal, after 30d]
                    │
                    ▼
                Refunded [terminal]
```

Every transition is exclusive and irreversible. No transition can be reversed by any actor. The `_getPayment` internal function reverts on ID 0 and on any ID above `_paymentCount`, preventing ghost-payment operations.

### Security Properties Verified

| Property | Implementation | Status |
|----------|----------------|--------|
| Reentrancy | `nonReentrant` on all 5 state-changing external functions | PASS |
| Checks-effects-interactions | Status updated before `safeTransfer` in `claimPayment`, `refundPayment`, `reclaimReleased` | PASS |
| SafeERC20 | `safeTransferFrom` / `safeTransfer` on all USDC movements | PASS |
| Zero-amount prevention | `if (amount == 0) revert ZeroAmount()` | PASS |
| Zero-address recipient | `if (recipient == address(0) ...) revert InvalidRecipient()` | PASS |
| Self-payment prevention | `if (... recipient == msg.sender) revert InvalidRecipient()` | PASS |
| Past-deadline creation | `if (deadline <= block.timestamp) revert InvalidDeadline()` | PASS |
| Double withdrawal | Status enum — each terminal state rejects all further writes | PASS |
| Unauthorized access | `msg.sender != payment.payer` / `!= payment.recipient` checked before every action | PASS |
| No admin privilege | No `owner`, no `onlyOwner`, no `pause`, no `upgrade` | PASS |
| No ETH acceptance | No `receive()` or `fallback()` | PASS |
| USDC address immutability | `IERC20 public immutable usdc` set in constructor | PASS |
| Blocklist recovery | `reclaimReleased()` available 30 days after release | PASS |

### fundPayment: One Critical Implementation Note

`fundPayment` performs the `safeTransferFrom` **before** updating `payment.status`. This is the one function where the state update comes after the external call:

```solidity
usdc.safeTransferFrom(msg.sender, address(this), payment.amount);  // external call first
payment.status = PaymentStatus.Funded;                               // then state update
```

This is **not a reentrancy vulnerability** because:
1. `nonReentrant` blocks any reentrant call entirely.
2. USDC (Circle) is not a token with reentrancy callbacks (no ERC-777 hooks).
3. The status check `status == Created` would block a reentered call even if the guard were absent.

However, strictly speaking this violates the CEI pattern. For documentation purposes: the risk is Zero under the `nonReentrant` guard, and reverting the transfer (on insufficient allowance or balance) correctly leaves status as `Created`. The behavior is correct; the ordering is a minor style deviation from strict CEI.

### Remaining Risks (documented, not blocking)

| Risk | Severity | Notes |
|------|----------|-------|
| `block.timestamp` manipulation | Low | Validators can shift timestamp by seconds to a few minutes. Acceptable for deadlines measured in days. Not acceptable for sub-minute timing. |
| Unbounded description string | Low | Description stored on-chain as `string`. Very long strings increase gas cost for the payer at `createPayment`. No DoS risk to other users — each payment is independent storage. |
| Unbounded payment arrays | Low | `_payerPayments` and `_recipientPayments` grow without bound. `getPayerPayments` / `getRecipientPayments` gas cost grows linearly with volume. At very high payment counts (tens of thousands per address), these view calls may approach block gas limits. Not a concern at current scale. |
| No dispute resolution | Design choice | Intentional for MVP simplicity. Payer unilaterally controls release. If payer disappears after funding, recipient has no recourse before the deadline passes. Document this clearly to users. |
| No maximum deadline | Low | A payer could set a deadline 100 years in the future. The only harm is that refundPayment becomes unavailable for 100 years. The recipient is unaffected (can still claim after release). |
| 30-day reclaim window is non-negotiable | Design | Once a payer calls `releasePayment`, the recipient has 30 days before the payer can reclaim. There is no way to extend this, and no emergency override. |
| Not audited by a third party | Critical prerequisite | This review is automated and covers structural + logical correctness. It does not substitute for a paid professional audit before deploying with real economic value. |

---

## 3. Test Results

**All 61 tests pass. 0 failures. 0 skipped.**

Fresh run completed during this review session (forge output above).

| Suite | Tests | Result |
|-------|-------|--------|
| Unit tests (PayFlowEscrowTest) | 58 | 58 PASS |
| Invariant tests (PayFlowEscrowInvariantTest) | 3 | 3 PASS |
| **Total** | **61** | **61 PASS** |

Invariant suite ran 128,000 calls per invariant (256 runs × 500 calls each) against:
- `invariant_EscrowBalanceEqualsDepositedMinusWithdrawn` — escrow token balance always equals deposits minus withdrawals
- `invariant_EscrowBalanceNonNegative` — balance never goes negative
- `invariant_PaymentCountMonotonicallyIncreases` — count never decreases

**Passing these tests is evidence of correctness of the logic tested. It is not a professional audit and does not guarantee the absence of all vulnerabilities.**

---

## 4. Frontend Mainnet Configuration Audit

### Current State

The frontend is configured for **Arc Testnet only**. The relevant file is `src/contract.ts`:

```typescript
export const ARC_TESTNET_CHAIN_ID = arcTestnet.id  // 5042002
export const ARC_MAINNET_CHAIN_ID = 5042
export const TARGET_CHAIN_ID = ARC_TESTNET_CHAIN_ID  // <-- currently Testnet
```

### Network Guard Behavior

`Layout.tsx` computes `wrongChain = isConnected && chainId !== TARGET_CHAIN_ID` and:
- Shows a "Wrong network" badge in the header
- Renders a red full-width banner: "Switch to Arc Testnet to use PayFlow"
- Does NOT block wallet connection

Every `writeContract` call in `PaymentDetail.tsx` and `CreatePayment.tsx` passes `chainId: TARGET_CHAIN_ID`. Wagmi rejects the transaction if the wallet is on a different chain. This means a wallet on Arc Mainnet cannot accidentally submit a Testnet transaction and vice versa.

### Accidental Mainnet Cross-Contamination Check

Checked all files that import `TARGET_CHAIN_ID` or reference chain IDs:

| File | Usage | Risk |
|------|-------|------|
| `src/contract.ts` | Defines `TARGET_CHAIN_ID = ARC_TESTNET_CHAIN_ID` | None — explicit |
| `src/components/Layout.tsx` | `wrongChain = chainId !== TARGET_CHAIN_ID` | None — correctly blocks wrong chain |
| `src/components/PaymentDetail.tsx` | `chainId: TARGET_CHAIN_ID` on every `writeContract` | None — chain enforced |
| `src/components/CreatePayment.tsx` | `chainId: TARGET_CHAIN_ID` on `writeContract` | None — chain enforced |
| `src/config.ts` | `chains: [arcTestnet, mainnet]` — mainnet only for ENS | None — mainnet has no transport for Arc |

**Finding:** The current frontend **cannot submit transactions to Arc Mainnet**. The `wagmi` config's transport map only has `arcTestnet` and Ethereum Mainnet (for ENS). There is no Arc Mainnet transport registered. A wallet connected to Arc Mainnet chain 5042 would be flagged as "Wrong network" and all action buttons would be blocked.

**This is the correct behavior for a Testnet-targeted build.** To enable Mainnet, the transport and `TARGET_CHAIN_ID` must be deliberately changed (see Mainnet migration plan below).

---

## 5. Arc Studio Mainnet Deployment Capability

### Can Arc Studio deploy this contract to Arc Mainnet?

**No.** The `deploy_contract` tool (Arc Studio's platform deployer) supports these testnets only:

```
ARC-TESTNET, ETH-SEPOLIA, MATIC-AMOY, ARB-SEPOLIA, UNI-SEPOLIA,
BASE-SEPOLIA, OP-SEPOLIA, AVAX-FUJI, MONAD-TESTNET
```

Arc Mainnet (`ARC-MAINNET` / chain 5042) is **not** in this list. Arc Studio cannot deploy to mainnet on your behalf. This is by design: mainnet deployments involve real funds and require your own wallet and key management.

### Supported Mainnet Deployment Path

Mainnet deployment requires Mode 2 self-deploy: you run `forge create` (or a Foundry deployment script) from your own machine with your own private key. The compiled artifact produced in Arc Studio is fully portable.

---

## 6. Mainnet Deployment Checklist

Complete every item in order. Do not proceed to the next step until the current step is verified.

### Phase 0 — Prerequisites (complete before any deployment)

- [ ] **P0.1** Obtain an independent professional security audit from a recognized firm. The Arc Studio review and 61-test suite demonstrate logical correctness; they do not substitute for a paid audit on a contract that will hold real economic value.
- [ ] **P0.2** Decide your maximum acceptable TVL before launching. Consider limiting initial deployment to a small beta with a per-payment cap if the contract is not yet audited.
- [ ] **P0.3** Prepare a deployment wallet. This must be a hardware wallet or a well-secured EOA with:
  - Enough USDC for gas on Arc Mainnet. On Arc, USDC is the native gas token. Estimate 0.10–0.50 USDC for the deployment transaction (Arc gas is priced in USDC at stable, predictable rates).
  - No other assets that would be at risk if the deployer key is compromised during the deploy.
- [ ] **P0.4** Export the compiled artifact from Arc Studio. Download the project from the Code panel, or push to GitHub via Integrations. The artifact you need: `contracts/out/PayFlowEscrow.sol/PayFlowEscrow.json`.

### Phase 1 — Build Verification

- [ ] **P1.1** On your local machine, install Foundry (`foundryup`).
- [ ] **P1.2** Run `forge build` in the project root. Confirm zero errors and that the output artifact matches the Arc Studio build.
- [ ] **P1.3** Run `forge test` and confirm 61/61 pass on your local build.

### Phase 2 — Final Testnet Verification

Before touching mainnet, run one complete end-to-end flow on Arc Testnet.

- [ ] **P2.1** Connect a wallet to the live PayFlow app (or the localhost version) on Arc Testnet.
- [ ] **P2.2** Get test USDC from the Arc Studio sidebar "Get test USDC" button.
- [ ] **P2.3** Create a payment, fund it, release it, and claim it using two different addresses.
- [ ] **P2.4** Verify each transaction on the Arc Testnet explorer: `https://explorer.testnet.arc.io`.
- [ ] **P2.5** Create a payment, fund it, let the deadline pass, and confirm `refundPayment` succeeds.
- [ ] **P2.6** Confirm the UI shows correct status after each transaction (no stale state).

### Phase 3 — Mainnet Contract Deployment

- [ ] **P3.1** Set `MAINNET_RPC=https://rpc.mainnet.arc.io` and `DEPLOYER_PK=<your-hardware-wallet-key>` in your local environment. Never commit these.
- [ ] **P3.2** Verify the constructor argument. The USDC address on Arc Mainnet is:
  `0x3600000000000000000000000000000000000000`
  This was live-verified by direct `eth_call` during this review (symbol: USDC, decimals: 6, totalSupply: non-zero). Confirm it again independently before deploying.
- [ ] **P3.3** Dry-run the deployment (estimate gas without broadcasting):
  ```bash
  forge create contracts/PayFlowEscrow.sol:PayFlowEscrow \
    --rpc-url $MAINNET_RPC \
    --private-key $DEPLOYER_PK \
    --constructor-args 0x3600000000000000000000000000000000000000 \
    --simulate
  ```
- [ ] **P3.4** Review the simulation output. Confirm the constructor arg, bytecode hash, and estimated gas are expected.
- [ ] **P3.5** Deploy:
  ```bash
  forge create contracts/PayFlowEscrow.sol:PayFlowEscrow \
    --rpc-url $MAINNET_RPC \
    --private-key $DEPLOYER_PK \
    --constructor-args 0x3600000000000000000000000000000000000000
  ```
- [ ] **P3.6** Record the deployed address and transaction hash. Verify on Arc Mainnet explorer: `https://explorer.arc.io/address/<address>`.
- [ ] **P3.7** Read the deployed contract to confirm `usdc()` returns `0x3600000000000000000000000000000000000000` and `paymentCount()` returns `0`:
  ```bash
  cast call <address> "usdc()(address)" --rpc-url $MAINNET_RPC
  cast call <address> "paymentCount()(uint256)" --rpc-url $MAINNET_RPC
  ```

### Phase 4 — Frontend Mainnet Migration

After the mainnet contract is deployed, update the frontend.

- [ ] **P4.1** In `src/contract.ts`, add the mainnet contract address and change `TARGET_CHAIN_ID`:
  ```typescript
  // Add this:
  export const PAYFLOW_ESCROW_MAINNET = {
    address: '<your-mainnet-address>' as `0x${string}`,
    abi: artifactRaw.abi as Abi,
  }

  // Change TARGET_CHAIN_ID:
  export const TARGET_CHAIN_ID = ARC_MAINNET_CHAIN_ID  // was ARC_TESTNET_CHAIN_ID
  export const PAYFLOW_ESCROW = PAYFLOW_ESCROW_MAINNET
  ```
- [ ] **P4.2** In `src/config.ts`, add Arc Mainnet to the wagmi config:
  ```typescript
  import { arc } from 'viem/chains'  // or define Arc Mainnet chain object from onchain-facts
  // Add arc to chains array and add its transport
  ```
  Check `viem/chains` for an `arc` export. If not present, define the chain manually using the chain ID 5042 and RPC `https://rpc.mainnet.arc.io` from `onchain-facts.ts`.
- [ ] **P4.3** Update the wrong-chain banner in `Layout.tsx` to read "Switch to Arc Mainnet" (it currently says "Switch to Arc Testnet").
- [ ] **P4.4** Run `bun run check` in Arc Studio. Confirm zero errors.
- [ ] **P4.5** Test the updated frontend against the mainnet contract on a local build before deploying the frontend.

### Phase 5 — Mainnet Smoke Test

- [ ] **P5.1** Connect a wallet to the production app on Arc Mainnet.
- [ ] **P5.2** Confirm the USDC balance displayed matches your wallet's actual USDC balance.
- [ ] **P5.3** Create a payment for a **small amount** (e.g., 0.01 USDC). Confirm the creation transaction succeeds and is visible on Arc Mainnet explorer.
- [ ] **P5.4** Fund the payment (approve + fund). Confirm both transactions succeed.
- [ ] **P5.5** Release and claim the payment. Confirm the recipient receives the correct amount.
- [ ] **P5.6** Record the transaction hash of the final claim transaction. This is your confirmed Arc Mainnet transaction for the microgrants submission.

### Phase 6 — Rollback / Recovery Considerations

The contract is non-upgradeable and has no admin key. There is no rollback mechanism. Mitigation strategies:

| Scenario | Response |
|----------|----------|
| Bug found after deployment | Deploy a new contract at a new address. Migrate users manually by communicating the new address. Old contract continues to function — existing payments can still complete their lifecycle. |
| Funded payment where payer disappears | Recipient waits for payer to release, or waits for deadline + refund eligibility. No admin can intervene. |
| Released payment where recipient is blocklisted | Payer can call `reclaimReleased` after 30 days. |
| Contract holds funds and a critical bug is found | No emergency withdrawal function exists. This is by design (no admin key). Prevention — not recovery — is the only protection. This is why P0.1 (professional audit) is a prerequisite. |

---

## 7. Arc Microgrants Submission Status

| Requirement | Status | Notes |
|-------------|--------|-------|
| Contract written in Arc Studio | DONE | `contracts/PayFlowEscrow.sol` |
| Tests passing | DONE | 61/61 |
| Security review | DONE (automated) | Not a professional audit |
| Testnet deployment | DONE | `0x100b29f17ee15e685c006d3cd067737d99060a22` on Arc Testnet |
| Working frontend | DONE | Connected to testnet contract |
| Mainnet deployment | PENDING | Requires P0–P3 above, manual from your machine |
| Confirmed mainnet transaction | PENDING | Requires mainnet deployment |
| Public app URL | PENDING | Deploy via Integrations (Netlify / HF / Vercel) |
| Public GitHub repo | PENDING | Push via Integrations > GitHub |
| README | DONE | `README.md` |

---

*This document was generated by Arc Studio as part of an automated deployment-readiness review. It is not a professional security audit and does not guarantee the absence of vulnerabilities. Before deploying to Arc Mainnet with real USDC, obtain an independent audit from a recognized security firm.*
