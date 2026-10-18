# PayFlow — Smart Conditional Payments

> Built with Arc Studio — money-powered apps in minutes
> Arc Microgrants submission

This is the **project memory** - what Arc Studio remembers about building this app.

---

## What This App Does

USDC escrow for freelancers and clients. Payer creates a payment, deposits USDC into the contract, and releases funds when work is delivered. Recipient claims USDC directly. Payer can refund after deadline. Five-state machine: Created → Funded → Released → Claimed (or Refunded).

## Contract Deployments

| Network | Address | Explorer |
|---------|---------|----------|
| Arc Testnet | `0x100b29f17ee15e685c006d3cd067737d99060a22` | https://explorer.testnet.arc.io/address/0x100b29f17ee15e685c006d3cd067737d99060a22 |

Deploy tx: `0x70d49b3ce6ae5b27ee725619ddd20015c3fd636b30d00cdcb62a5356ffea6c78`

Constructor arg: `0x3600000000000000000000000000000000000000` (Arc Testnet USDC)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
