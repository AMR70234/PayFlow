# PayFlow — Arc Mainnet Migration Guide

**Do not follow this guide until you have:**
1. Completed the full Testnet verification in `DEPLOYMENT.md` Section 6.
2. Obtained an independent professional security audit.
3. Confirmed the exact USDC address on Arc Mainnet (verified below).

---

## Verified Arc Mainnet Parameters

These values were confirmed by direct `eth_call` to Arc Mainnet on October 18, 2026.

| Parameter | Value |
|-----------|-------|
| Chain ID | `5042` |
| RPC URL | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.arc.io` |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` |
| USDC `symbol()` | "USDC" (confirmed live) |
| USDC `decimals()` | 6 (confirmed live) |
| USDC `name()` | "USDC" (confirmed live) |
| Native gas token | USDC (18-decimal native view; same underlying pool) |

The USDC address is the same on Testnet (5042002) and Mainnet (5042). No contract source changes are needed — only the constructor argument, which is the same value.

> **Verify this independently before deploying.** Call `cast call 0x3600000000000000000000000000000000000000 "symbol()(string)" --rpc-url https://rpc.mainnet.arc.io` yourself to confirm.

---

## Step 1 — Pre-deployment Checklist

Complete every item before running the deploy command.

- [ ] All 61 Foundry tests pass locally (`forge test`).
- [ ] Testnet end-to-end flows completed: create, fund, release, claim, refund all confirmed.
- [ ] Independent professional security audit obtained and findings addressed.
- [ ] Deployer wallet created (fresh EOA or hardware wallet — not a hot wallet with other assets).
- [ ] Deployer wallet funded with USDC on Arc Mainnet. Estimate: 0.10–0.50 USDC for the deploy transaction (Arc gas is stable and priced in USDC).
- [ ] `MAINNET_PK` exported in your terminal session and NOT committed to any file.
- [ ] Confirmed you understand: the contract is non-upgradeable and has no admin key. Once deployed, it cannot be paused, modified, or drained by you.

---

## Step 2 — Verify the USDC Address

Run this yourself before deploying:

```bash
cast call 0x3600000000000000000000000000000000000000 \
  "symbol()(string)" \
  --rpc-url https://rpc.mainnet.arc.io
# Expected output: "USDC"

cast call 0x3600000000000000000000000000000000000000 \
  "decimals()(uint8)" \
  --rpc-url https://rpc.mainnet.arc.io
# Expected output: 6
```

If either call fails or returns unexpected values, stop and investigate before proceeding.

---

## Step 3 — Dry-Run the Deployment

```bash
export MAINNET_RPC=https://rpc.mainnet.arc.io
export MAINNET_PK=<your-mainnet-deployer-private-key>

forge create contracts/PayFlowEscrow.sol:PayFlowEscrow \
  --rpc-url $MAINNET_RPC \
  --private-key $MAINNET_PK \
  --constructor-args 0x3600000000000000000000000000000000000000 \
  --simulate
```

Review the output carefully:
- Constructor arg shows `0x3600000000000000000000000000000000000000`
- Estimated gas is in the expected range (a few hundred thousand)
- No compilation errors

---

## Step 4 — Deploy

```bash
forge create contracts/PayFlowEscrow.sol:PayFlowEscrow \
  --rpc-url $MAINNET_RPC \
  --private-key $MAINNET_PK \
  --constructor-args 0x3600000000000000000000000000000000000000
```

**Record the output immediately:**
```
Deployer: <your-address>
Deployed to: <CONTRACT_ADDRESS>    ← save this
Transaction hash: <TX_HASH>        ← save this
```

---

## Step 5 — Verify the Deployment

```bash
export MAINNET_CONTRACT=<CONTRACT_ADDRESS>

# Confirm usdc() points to the right address
cast call $MAINNET_CONTRACT "usdc()(address)" --rpc-url $MAINNET_RPC
# Expected: 0x3600000000000000000000000000000000000000

# Confirm payment count starts at zero
cast call $MAINNET_CONTRACT "paymentCount()(uint256)" --rpc-url $MAINNET_RPC
# Expected: 0

# Confirm RECLAIM_WINDOW is 30 days
cast call $MAINNET_CONTRACT "RECLAIM_WINDOW()(uint256)" --rpc-url $MAINNET_RPC
# Expected: 2592000
```

View the contract on Arc Mainnet explorer:
`https://explorer.arc.io/address/<CONTRACT_ADDRESS>`

---

## Step 6 — Update the Frontend

### 6a. Update `src/contract.ts`

Change three lines:

```typescript
// BEFORE (Testnet):
export const TARGET_CHAIN_ID = ARC_TESTNET_CHAIN_ID

export const PAYFLOW_ESCROW = {
  address: '0x100b29f17ee15e685c006d3cd067737d99060a22' as `0x${string}`,
  abi: artifactRaw.abi as Abi,
} as const

// AFTER (Mainnet):
export const TARGET_CHAIN_ID = ARC_MAINNET_CHAIN_ID

export const PAYFLOW_ESCROW = {
  address: '<YOUR_MAINNET_CONTRACT_ADDRESS>' as `0x${string}`,
  abi: artifactRaw.abi as Abi,
} as const
```

### 6b. Update `src/config.ts`

Add Arc Mainnet to the wagmi config. Check whether `viem/chains` exports an `arc` chain. If it does:

```typescript
import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet, arc } from 'viem/chains'  // add arc
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

registerChain(arc.id, arc.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arc, mainnet],
  connectors: [injected()],
  transports: {
    [arc.id]: http(),
    [mainnet.id]: http(),
  },
})
```

If `viem/chains` does not export `arc` (check with `import { arc } from 'viem/chains'`), define it manually using values from `onchain-facts.ts`:

```typescript
import { defineChain } from 'viem'
import { requireChain } from '@/onchain-facts'

const arcChainFact = requireChain(5042)

const arc = defineChain({
  id: 5042,
  name: arcChainFact.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [arcChainFact.rpcUrls[0]] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: arcChainFact.explorerBase } },
})
```

### 6c. Update the wrong-chain banner in `src/components/Layout.tsx`

```typescript
// Change:
Switch to Arc Testnet to use PayFlow
// To:
Switch to Arc Mainnet to use PayFlow
```

### 6d. Run checks

```bash
bun run check
```

Zero errors required before deploying the frontend.

---

## Step 7 — Mainnet Smoke Test

With the updated frontend running locally:

1. Connect a wallet on Arc Mainnet (not Testnet).
2. Confirm the "Wrong network" banner does NOT appear.
3. Confirm your USDC balance is displayed correctly.
4. Create a payment for a **small test amount** (e.g. 0.10 USDC).
5. Fund, release, and claim it.
6. Verify every transaction on Arc Mainnet explorer: `https://explorer.arc.io`.
7. Record the final claim transaction hash — this is your confirmed mainnet transaction for the grant submission.

---

## Step 8 — Update AGENTS.md

After the mainnet deployment, add the mainnet contract details to `AGENTS.md`:

```markdown
| Arc Mainnet | `<CONTRACT_ADDRESS>` | https://explorer.arc.io/address/<CONTRACT_ADDRESS> |

Deploy tx: <TX_HASH>
Constructor arg: 0x3600000000000000000000000000000000000000 (Arc Mainnet USDC)
```

---

## Rollback / Recovery Reference

| Scenario | Response |
|----------|----------|
| Critical bug found post-deploy | Deploy a new contract. Announce the new address. Existing payments on the old contract complete their lifecycle normally — no funds are locked unless a bug directly affects their flow. |
| Funds stuck in Released state (blocklisted recipient) | Payer calls `reclaimReleased()` after 30 days from release timestamp. |
| Payer disappears before releasing | Recipient has no recourse until deadline passes, then payer can refund. No admin path exists. Document this limitation clearly to users. |
| Need to pause the contract | Not possible — there is no admin key and no pause function. Prevention (audit, limits, gradual rollout) is the only protection. |
