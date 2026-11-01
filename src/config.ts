/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * RPC URLs are pinned explicitly so wagmi never defers to whatever endpoint
 * the user's wallet has stored for the chain (which may be stale or wrong).
 * Verified live: both endpoints return chain ID 0x4cef52 (5042002).
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Official Arc Testnet RPC endpoints (from viem/chains arcTestnet definition)
const ARC_TESTNET_RPC_PRIMARY = 'https://rpc.testnet.arc.io'
const ARC_TESTNET_RPC_FALLBACK = 'https://rpc.blockdaemon.testnet.arc.io'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, ARC_TESTNET_RPC_PRIMARY)

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet included for ENS resolution only
  connectors: [injected()],
  transports: {
    // Explicit URLs — wagmi will NOT fall back to the wallet's configured RPC
    [arcTestnet.id]: fallback([
      http(ARC_TESTNET_RPC_PRIMARY),
      http(ARC_TESTNET_RPC_FALLBACK),
    ]),
    [mainnet.id]: http(), // ENS resolution only
  },
})
