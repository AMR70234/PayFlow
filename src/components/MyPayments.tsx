import { useState } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { Loader2, ArrowUpRight, ArrowDownLeft, Inbox } from 'lucide-react'
import { PAYFLOW_ESCROW, TARGET_CHAIN_ID, PaymentStatus, type PaymentStruct } from '../contract'
import { formatUsdc, formatAddress, formatDeadline, isDeadlinePassed } from '../utils'
import StatusBadge from './StatusBadge'

// Explicitly typed for useReadContracts (requires Abi not any[])
const ESCROW_TYPED = {
  address: PAYFLOW_ESCROW.address,
  abi: PAYFLOW_ESCROW.abi,
}

interface MyPaymentsProps {
  onViewPayment: (id: bigint) => void
}

type TabFilter = 'all' | 'pending' | 'active' | 'completed' | 'refunded'
type DirectionTab = 'outgoing' | 'incoming'

const DIRECTION_TABS: { key: DirectionTab; label: string; icon: React.ElementType }[] = [
  { key: 'outgoing', label: 'Sent', icon: ArrowUpRight },
  { key: 'incoming', label: 'Received', icon: ArrowDownLeft },
]

const STATUS_FILTERS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Awaiting Deposit' },
  { key: 'active', label: 'Funded' },
  { key: 'completed', label: 'Completed' },
  { key: 'refunded', label: 'Refunded' },
]

function matchesFilter(p: PaymentStruct, filter: TabFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'pending': return p.status === PaymentStatus.Created
    case 'active': return p.status === PaymentStatus.Funded || p.status === PaymentStatus.Released
    case 'completed': return p.status === PaymentStatus.Claimed
    case 'refunded': return p.status === PaymentStatus.Refunded
  }
}

export default function MyPayments({ onViewPayment }: MyPaymentsProps) {
  const { address, isConnected } = useAccount()
  const [direction, setDirection] = useState<DirectionTab>('outgoing')
  const [filter, setFilter] = useState<TabFilter>('all')

  const { data: payerIdsRaw, isLoading: payerLoading } = useReadContract({
    ...PAYFLOW_ESCROW,
    functionName: 'getPayerPayments',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const { data: recipientIdsRaw, isLoading: recipientLoading } = useReadContract({
    ...PAYFLOW_ESCROW,
    functionName: 'getRecipientPayments',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const payerIds = payerIdsRaw as readonly bigint[] | undefined
  const recipientIds = recipientIdsRaw as readonly bigint[] | undefined
  const activeIds = direction === 'outgoing' ? (payerIds ?? []) : (recipientIds ?? [])
  const isLoading = direction === 'outgoing' ? payerLoading : recipientLoading

  const { data: payments, isLoading: paymentsLoading } = useReadContracts({
    contracts: [...activeIds].reverse().map((id) => ({
      ...ESCROW_TYPED,
      functionName: 'getPayment' as const,
      args: [id] as const,
      chainId: TARGET_CHAIN_ID,
    })),
    query: { enabled: activeIds.length > 0 },
  })

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <Inbox className="size-10 opacity-20" style={{ color: 'var(--muted)' }} />
        <p style={{ color: 'var(--muted)' }}>Connect your wallet to view your payments.</p>
      </div>
    )
  }

  const allPayments = (payments ?? []).flatMap((r) =>
    r.status === 'success' ? [r.result as PaymentStruct] : []
  )
  const filtered = allPayments.filter((p) => matchesFilter(p, filter))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
          My Payments
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Track your sent and received payment agreements.
        </p>
      </div>

      {/* Direction tabs */}
      <div className="flex gap-2">
        {DIRECTION_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setDirection(key); setFilter('all') }}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
            style={
              direction === key
                ? {
                    background: 'var(--surface-strong)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--ink)',
                  }
                : {
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }
            }
          >
            <Icon className="size-4" />
            {label}
            {direction === key && (
              <span
                className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                style={{ background: 'var(--accent)', color: '#0a1628' }}
              >
                {activeIds.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={
              filter === key
                ? { background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', color: 'var(--ink)' }
                : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div
        className="overflow-hidden rounded-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {isLoading || paymentsLoading ? (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Inbox className="size-8 opacity-20" style={{ color: 'var(--muted)' }} />
            <p className="text-sm" style={{ color: 'var(--subtle)' }}>
              {activeIds.length === 0
                ? direction === 'outgoing'
                  ? "You haven't created any payments yet."
                  : "You haven't received any payments yet."
                : 'No payments match this filter.'}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map((p) => {
              const expired = isDeadlinePassed(p.deadline)
              const needsAction =
                (direction === 'outgoing' &&
                  (p.status === PaymentStatus.Created || p.status === PaymentStatus.Funded)) ||
                (direction === 'incoming' && p.status === PaymentStatus.Released)

              return (
                <button
                  key={Number(p.id)}
                  onClick={() => onViewPayment(p.id)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                      style={{
                        background: needsAction ? 'rgba(172,198,233,0.12)' : 'var(--surface-strong)',
                        color: needsAction ? 'var(--accent)' : 'var(--subtle)',
                        border: needsAction ? '1px solid rgba(172,198,233,0.25)' : '1px solid transparent',
                      }}
                    >
                      #{Number(p.id)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                        {p.description || '(No description)'}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
                        <span>
                          {direction === 'outgoing'
                            ? `To: ${formatAddress(p.recipient)}`
                            : `From: ${formatAddress(p.payer)}`}
                        </span>
                        <span>·</span>
                        <span style={{ color: expired && p.status === PaymentStatus.Funded ? 'var(--danger)' : undefined }}>
                          {formatDeadline(p.deadline)}
                          {expired && p.status === PaymentStatus.Funded ? ' (expired)' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <div className="tabular-nums text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                        {formatUsdc(p.amount)} USDC
                      </div>
                    </div>
                    <StatusBadge status={p.status} size="sm" />
                    {needsAction && (
                      <div
                        className="size-2 rounded-full"
                        style={{ background: 'var(--accent)' }}
                        title="Action needed"
                      />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
