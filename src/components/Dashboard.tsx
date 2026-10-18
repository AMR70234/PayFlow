import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { erc20Abi } from 'viem'
import { Loader2, Plus, ArrowRight, TrendingUp, Clock, CheckCircle2, DollarSign } from 'lucide-react'
import { PAYFLOW_ESCROW, USDC_ADDRESS, TARGET_CHAIN_ID, PaymentStatus } from '../contract'
import { formatUsdc, formatAddress, formatDeadline, isDeadlinePassed } from '../utils'
import type { PaymentStruct } from '../contract'
import StatusBadge from './StatusBadge'
import { TokenUSDC } from '@web3icons/react'

// Typed contract config for useReadContracts (requires Abi literal type)
const ESCROW = {
  address: PAYFLOW_ESCROW.address,
  abi: PAYFLOW_ESCROW.abi,
}

interface DashboardProps {
  onCreatePayment: () => void
  onViewPayment: (id: bigint) => void
  onMyPayments: () => void
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  accent: string
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-xl" style={{ background: `${accent}1a` }}>
          <Icon className="size-4" style={{ color: accent }} />
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
      </div>
      <div className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
    </div>
  )
}

export default function Dashboard({ onCreatePayment, onViewPayment, onMyPayments }: DashboardProps) {
  const { address, isConnected } = useAccount()

  const { data: totalCount } = useReadContract({
    ...ESCROW,
    functionName: 'paymentCount',
    chainId: TARGET_CHAIN_ID,
  })

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const { data: payerIdsRaw } = useReadContract({
    ...ESCROW,
    functionName: 'getPayerPayments',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const { data: recipientIdsRaw } = useReadContract({
    ...ESCROW,
    functionName: 'getRecipientPayments',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const payerIds = payerIdsRaw as readonly bigint[] | undefined
  const recipientIds = recipientIdsRaw as readonly bigint[] | undefined
  const totalCountN = totalCount !== undefined ? Number(totalCount) : 0

  // Fetch the most recent 5 payments for the activity feed
  const recentIds = totalCountN > 0
    ? Array.from({ length: Math.min(5, totalCountN) }, (_, i) => BigInt(totalCountN - i))
    : []

  const { data: recentPayments, isLoading: recentLoading } = useReadContracts({
    contracts: recentIds.map((id) => ({
      ...ESCROW,
      functionName: 'getPayment' as const,
      args: [id] as const,
      chainId: TARGET_CHAIN_ID,
    })),
    query: { enabled: recentIds.length > 0 },
  })

  const allIds = [...(payerIds ?? []), ...(recipientIds ?? [])]
  const myIds = [...new Set(allIds.map(String))].map((s) => BigInt(s))
  const myTotal = myIds.length

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl px-6 py-8"
        style={{
          background: 'linear-gradient(135deg, rgba(139,124,248,0.15) 0%, rgba(172,198,233,0.08) 100%)',
          border: '1px solid var(--border-strong)',
        }}
      >
        <div
          className="absolute right-0 top-0 h-full w-1/2 opacity-5"
          style={{ background: 'radial-gradient(ellipse at top right, var(--violet) 0%, transparent 70%)' }}
        />
        <div className="relative">
          <div className="mb-1 flex items-center gap-2">
            <TokenUSDC variant="branded" size={16} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Your USDC Balance
            </span>
          </div>
          <div
            className="display flex items-baseline gap-2 text-5xl font-bold tabular-nums"
            style={{ color: 'var(--ink)' }}
          >
            {isConnected ? (usdcBalance !== undefined ? formatUsdc(usdcBalance) : '...') : '—'}
            <span className="text-2xl font-medium" style={{ color: 'var(--muted)' }}>
              USDC
            </span>
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--subtle)' }}>
            {isConnected
              ? `${formatAddress(address!)} on Arc Testnet`
              : 'Connect your wallet to get started'}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Payments"
          value={totalCountN > 0 ? totalCountN.toString() : '—'}
          icon={DollarSign}
          accent="var(--accent)"
        />
        <StatCard
          label="My Payments"
          value={isConnected ? myTotal : '—'}
          icon={TrendingUp}
          accent="var(--violet)"
        />
        <StatCard
          label="Pending"
          value={
            isConnected
              ? String((payerIds?.length ?? 0) + (recipientIds?.length ?? 0))
              : '—'
          }
          icon={Clock}
          accent="#f59e0b"
        />
        <StatCard
          label="Active"
          value={isConnected ? (payerIds?.length ?? 0) + (recipientIds?.length ?? 0) : '—'}
          icon={CheckCircle2}
          accent="var(--success)"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onCreatePayment}
          className="flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'var(--accent)', color: '#0a1628' }}
        >
          <Plus className="size-4" />
          Create Payment
        </button>
        <button
          onClick={onMyPayments}
          className="flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'var(--surface-strong)',
            border: '1px solid var(--border)',
            color: 'var(--ink-2)',
          }}
        >
          My Payments
          <ArrowRight className="size-4" />
        </button>
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="display mb-4 text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Recent Activity
        </h2>
        <div
          className="overflow-hidden rounded-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {recentLoading ? (
            <div className="flex items-center justify-center gap-2 py-10" style={{ color: 'var(--muted)' }}>
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Loading activity...</span>
            </div>
          ) : !recentPayments || recentPayments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <DollarSign className="size-8 opacity-20" style={{ color: 'var(--muted)' }} />
              <p className="text-sm" style={{ color: 'var(--subtle)' }}>
                No payments yet. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {recentPayments.map((result, i) => {
                if (result.status !== 'success') return null
                const p = result.result as PaymentStruct
                const expired = isDeadlinePassed(p.deadline)
                return (
                  <button
                    key={i}
                    onClick={() => onViewPayment(p.id)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-9 items-center justify-center rounded-xl text-sm font-bold"
                        style={{ background: 'var(--surface-strong)', color: 'var(--accent)' }}
                      >
                        #{Number(p.id)}
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                          {p.description || '(No description)'}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: 'var(--subtle)' }}>
                          {formatAddress(p.payer)} → {formatAddress(p.recipient)}
                          {expired && p.status === PaymentStatus.Funded && (
                            <span className="ml-2" style={{ color: 'var(--danger)' }}>
                              Expired
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="tabular-nums text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                          {formatUsdc(p.amount)} USDC
                        </div>
                        <div className="text-xs" style={{ color: 'var(--subtle)' }}>
                          {formatDeadline(p.deadline)}
                        </div>
                      </div>
                      <StatusBadge status={p.status} size="sm" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
