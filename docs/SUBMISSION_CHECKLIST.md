# Arc Microgrants Submission Checklist — PayFlow

**Program:** Arc Microgrants: Built with Arc Studio
**Project:** PayFlow — Smart Conditional Payments
**Date prepared:** October 18, 2026

Use this document to track grant requirements. Check each item yourself before submitting.

---

## Required Grant Deliverables

### 1. Smart Contract — Built in Arc Studio

- [x] Contract written using Arc Studio's contract writer
- [x] Contract source: `contracts/PayFlowEscrow.sol`
- [x] Language: Solidity 0.8.28
- [x] Security: OpenZeppelin `ReentrancyGuard` + `SafeERC20` + checks-effects-interactions
- [x] State machine: Created → Funded → Released → Claimed / Refunded
- [x] No admin key, no upgradeability, fully permissionless
- [x] `reclaimReleased()` recovery path for blocklisted-recipient scenario
- [x] Balanced security review completed in Arc Studio (1 Critical finding fixed)

### 2. Tests — 61/61 Passing

- [x] `contracts/test/PayFlowEscrow.t.sol` — 58 unit tests
- [x] `contracts/test/PayFlowEscrow.t.sol` — 3 invariant tests (128,000 calls/invariant)
- [x] All happy paths covered
- [x] All revert paths covered (unauthorized, wrong status, zero amount, past deadline, etc.)
- [x] Fuzz tests on create, claim flow, refund flow, reclaim boundary
- [x] Invariants: escrow balance = deposits − withdrawals, balance ≥ 0, count monotonic
- [ ] **[YOUR ACTION]** Run `forge test` locally to independently confirm: `cd payflow && forge test`

### 3. Working Frontend — Connected to Deployed Contract

- [x] React 18, Vite, TypeScript, Tailwind CSS
- [x] wagmi v2 + viem + ConnectKit wallet connection
- [x] Dashboard with live USDC balance and payment stats
- [x] Create Payment with address validation, amount input, deadline picker
- [x] Payment Detail with all actions: approve, fund, release, claim, refund, reclaim
- [x] My Payments with outgoing/incoming tabs and status filters
- [x] All transactions driven by real wagmi hooks — no mocked state
- [x] Network guard blocks transactions on wrong chain
- [x] Transaction hashes shown with Arc Explorer links
- [x] Arc Dark design (dark navy, glass surfaces, blue/violet accents)
- [ ] **[YOUR ACTION]** Run the app locally (`bun run dev`) and verify the UI works as expected

### 4. Testnet Deployment — Completed

- [x] Network: Arc Testnet (Chain ID 5042002)
- [x] Contract address: `0x100b29f17ee15e685c006d3cd067737d99060a22`
- [x] Deploy transaction: `0x70d49b3ce6ae5b27ee725619ddd20015c3fd636b30d00cdcb62a5356ffea6c78`
- [x] Constructor arg verified: `usdc()` returns `0x3600000000000000000000000000000000000000`
- [x] Payment count: 0 (clean, ready for testing)
- [x] Explorer: https://explorer.testnet.arc.io/address/0x100b29f17ee15e685c006d3cd067737d99060a22
- [ ] **[YOUR ACTION]** Run a complete end-to-end payment flow on Testnet (see DEPLOYMENT.md §6)
  - [ ] Create → Fund → Release → Claim flow completed
  - [ ] Create → Fund → Refund (after deadline) flow completed
  - [ ] All transactions visible on Arc Testnet explorer

### 5. Public App URL

- [ ] **[YOUR ACTION]** Deploy frontend via Arc Studio Integrations menu:
  - Option A: **Netlify** — open Integrations → Connect Netlify → Deploy
  - Option B: **Hugging Face** — open Integrations → Connect Hugging Face → Deploy
  - Option C: **Vercel** — open Integrations → Connect Vercel → Deploy
- [ ] Record the live URL here: `__________________________________`

### 6. Public GitHub Repository

- [ ] **[YOUR ACTION]** Push to GitHub via Arc Studio Integrations menu → Connect GitHub → Push
- [ ] Repository URL: `__________________________________`
- [ ] Confirm the repo is public and contains:
  - [ ] `contracts/PayFlowEscrow.sol` (contract source)
  - [ ] `contracts/test/PayFlowEscrow.t.sol` (tests)
  - [ ] `src/` (frontend)
  - [ ] `README.md`
  - [ ] `docs/DEPLOYMENT.md`
  - [ ] `docs/MAINNET_MIGRATION.md`
  - [ ] `docs/SUBMISSION_CHECKLIST.md` (this file)
  - [ ] `docs/mainnet-readiness-review.md`
  - [ ] `.gitignore` (must exclude `.env`, `contracts/out/`, `node_modules/`)

### 7. README

- [x] Architecture overview
- [x] Payment lifecycle (state diagram)
- [x] Contract function reference table
- [x] Security assumptions documented
- [x] Deployment configuration (Testnet + Mainnet parameters)
- [x] "How Arc Studio was used" section
- [x] Development setup commands
- [x] Arc Microgrants submission checklist in README

### 8. Arc Mainnet Deployment — PENDING (requires your action)

**This section must be completed before submitting for requirements that need a live Mainnet transaction.**

- [ ] **[YOUR ACTION — PREREQUISITE]** Obtain an independent professional security audit. This is the hard gate before any real-value deployment. The Arc Studio review and 61 tests are not a substitute.
- [ ] **[YOUR ACTION]** Fund a dedicated deployer wallet on Arc Mainnet with USDC (~0.5 USDC for gas).
- [ ] **[YOUR ACTION]** Run `forge create` with mainnet RPC and constructor arg (see MAINNET_MIGRATION.md §4).
- [ ] **[YOUR ACTION]** Record mainnet contract address: `__________________________________`
- [ ] **[YOUR ACTION]** Record mainnet deploy tx: `__________________________________`
- [ ] **[YOUR ACTION]** Verify contract on explorer: `https://explorer.arc.io/address/<address>`
- [ ] **[YOUR ACTION]** Update `src/contract.ts` (TARGET_CHAIN_ID + address) per MAINNET_MIGRATION.md §6.
- [ ] **[YOUR ACTION]** Update `src/config.ts` to add Arc Mainnet wagmi transport.
- [ ] **[YOUR ACTION]** Update wrong-chain banner in `src/components/Layout.tsx`.
- [ ] **[YOUR ACTION]** Run `bun run check` — confirm 0 errors.
- [ ] **[YOUR ACTION]** Deploy updated frontend to public URL.
- [ ] **[YOUR ACTION]** Run mainnet smoke test (create, fund, release, claim with small amount).
- [ ] **[YOUR ACTION]** Record confirmed mainnet claim tx: `__________________________________`
  - This is the transaction required to show "real USDC moving through the PayFlow contract on Mainnet".

### 9. Arc Studio Project URL

- [x] The entire project was built in Arc Studio
- [ ] **[YOUR ACTION]** Record the Arc Studio project URL: `__________________________________`
  - Available in your Arc Studio account. Include this in the grant application.

---

## Summary: What Is Done vs. What Requires Your Action

### Done (completed in Arc Studio)

| Item | Status |
|------|--------|
| Smart contract written and reviewed | DONE |
| 61/61 tests passing | DONE |
| Contract deployed on Arc Testnet | DONE |
| Frontend built and connected to testnet contract | DONE |
| DEPLOYMENT.md | DONE |
| MAINNET_MIGRATION.md | DONE |
| mainnet-readiness-review.md | DONE |
| README.md | DONE |
| SUBMISSION_CHECKLIST.md (this file) | DONE |

### Requires Your Action

| Item | Blocker? | Notes |
|------|----------|-------|
| Run `forge test` locally | No | Verification step — tests pass in Arc Studio |
| Run Testnet end-to-end flows | **Yes** | Required to confirm live contract before Mainnet |
| Deploy frontend to public URL | **Yes** | Required for public app URL deliverable |
| Push to public GitHub | **Yes** | Required for public repo deliverable |
| Independent security audit | **Yes (for Mainnet)** | Hard gate before real-value deployment |
| Fund mainnet deployer wallet | **Yes (for Mainnet)** | Needs real USDC for gas |
| Deploy to Arc Mainnet | **Yes (for Mainnet)** | Cannot be done from Arc Studio — requires `forge create` locally |
| Update frontend for Mainnet | **Yes (for Mainnet)** | Three files change: contract.ts, config.ts, Layout.tsx |
| Mainnet smoke test + record tx hash | **Yes (for Mainnet)** | Required for "confirmed Mainnet transaction" deliverable |
| Arc Studio project URL | No | Available in your Arc Studio account |

---

## Important Disclaimers

1. **The Arc Studio internal review and 61-test suite are evidence of logical correctness, not a professional security audit.** Do not deploy to Mainnet with real user funds until an independent audit is obtained.

2. **The contract is non-upgradeable and has no admin key.** Once deployed, it cannot be paused, modified, or drained. Bugs found after deployment require a new deployment at a new address.

3. **`block.timestamp` is used for deadline and reclaim-window checks.** Block proposers can shift timestamps by seconds to a few minutes. This is acceptable for deadlines measured in days but not for sub-minute timing requirements.

4. **The payer controls release unilaterally.** If a payer funds a payment and then becomes unresponsive, the recipient has no recourse until the deadline passes. This is an intentional MVP design choice — document it clearly to users.
