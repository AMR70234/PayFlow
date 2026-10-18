import { formatUnits } from 'viem'
import { USDC_DECIMALS, EXPLORER_BASE } from './contract'

export function formatUsdc(amount: bigint, decimals = 2): string {
  const formatted = formatUnits(amount, USDC_DECIMALS)
  return Number(formatted).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function formatDeadline(deadline: bigint): string {
  const d = new Date(Number(deadline) * 1000)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isDeadlinePassed(deadline: bigint): boolean {
  return Date.now() > Number(deadline) * 1000
}

export function formatRelativeTime(ts: bigint): string {
  const now = Date.now()
  const diff = Math.floor((Number(ts) * 1000 - now) / 1000)
  if (diff < 0) {
    const past = -diff
    if (past < 60) return `${past}s ago`
    if (past < 3600) return `${Math.floor(past / 60)}m ago`
    if (past < 86400) return `${Math.floor(past / 3600)}h ago`
    return `${Math.floor(past / 86400)}d ago`
  }
  if (diff < 60) return `in ${diff}s`
  if (diff < 3600) return `in ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`
  return `in ${Math.floor(diff / 86400)}d`
}

export function explorerTx(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function explorerAddress(addr: string): string {
  return `${EXPLORER_BASE}/address/${addr}`
}

export function parseOnchainError(error: unknown): string {
  const msg = (error as Error)?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || (error as { code?: number })?.code === 4001) {
    return 'Transaction cancelled.'
  }
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
    return 'Insufficient balance. Add funds and try again.'
  }
  if (msg.includes('insufficientallowance') || msg.includes('erc20: insufficient allowance')) {
    return 'You need to approve USDC spending first.'
  }
  if (msg.includes('reverted')) {
    if (msg.includes('unauthorized')) return 'Not authorized for this action.'
    if (msg.includes('invalidstatus')) return 'This action is not available for the current payment status.'
    if (msg.includes('deadlinenotpassed')) return 'The deadline has not passed yet.'
    if (msg.includes('reclaimwindownotopen')) return 'The 30-day reclaim window has not opened yet.'
    if (msg.includes('zeroamount')) return 'Amount must be greater than zero.'
    if (msg.includes('invaliddeadline')) return 'Deadline must be in the future.'
    if (msg.includes('invalidrecipient')) return 'Invalid recipient address.'
    if (msg.includes('paymentnotfound')) return 'Payment not found.'
    return 'Transaction failed. Please try again.'
  }
  if (msg.includes('network') || msg.includes('timeout')) {
    return 'Network error. Check your connection and retry.'
  }
  return 'Something went wrong. Please try again.'
}
