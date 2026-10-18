/**
 * PayFlowEscrow contract config
 * Deployed on Arc Testnet: 0x100b29f17ee15e685c006d3cd067737d99060a22
 */
import artifactRaw from '../contracts/out/PayFlowEscrow.sol/PayFlowEscrow.json'
import { getUsdc, requireChain } from '@/onchain-facts'
import { arcTestnet } from 'viem/chains'
import type { Abi } from 'viem'

export const ARC_TESTNET_CHAIN_ID = arcTestnet.id // 5042002
export const ARC_MAINNET_CHAIN_ID = 5042

// Target chain for this app
export const TARGET_CHAIN_ID = ARC_TESTNET_CHAIN_ID

export const PAYFLOW_ESCROW = {
  address: '0x100b29f17ee15e685c006d3cd067737d99060a22' as `0x${string}`,
  abi: artifactRaw.abi as Abi,
} as const

export const USDC_FACT = getUsdc(TARGET_CHAIN_ID)!
export const USDC_ADDRESS = USDC_FACT.address as `0x${string}`
export const USDC_DECIMALS = USDC_FACT.decimals // 6

export const CHAIN = requireChain(TARGET_CHAIN_ID)
export const EXPLORER_BASE = CHAIN.explorerBase

export enum PaymentStatus {
  Created = 0,
  Funded = 1,
  Released = 2,
  Claimed = 3,
  Refunded = 4,
}

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.Created]: 'Awaiting Deposit',
  [PaymentStatus.Funded]: 'Funded',
  [PaymentStatus.Released]: 'Released',
  [PaymentStatus.Claimed]: 'Completed',
  [PaymentStatus.Refunded]: 'Refunded',
}

export const STATUS_COLORS: Record<PaymentStatus, string> = {
  [PaymentStatus.Created]: '#8ba4c0',
  [PaymentStatus.Funded]: '#acc6e9',
  [PaymentStatus.Released]: '#8b7cf8',
  [PaymentStatus.Claimed]: '#6ed49c',
  [PaymentStatus.Refunded]: '#607a96',
}

export interface PaymentStruct {
  id: bigint
  payer: `0x${string}`
  recipient: `0x${string}`
  amount: bigint
  description: string
  deadline: bigint
  status: PaymentStatus
  createdAt: bigint
  releasedAt: bigint
}
