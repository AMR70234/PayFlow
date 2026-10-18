import { PaymentStatus, STATUS_LABELS, STATUS_COLORS } from '../contract'
import { CheckCircle2, Clock, RefreshCcw, Send, Unlock } from 'lucide-react'

interface StatusBadgeProps {
  status: number
  size?: 'sm' | 'md'
}

function StatusIcon({ status, size }: { status: number; size: string }) {
  const cls = size === 'sm' ? 'size-3' : 'size-3.5'
  switch (status as PaymentStatus) {
    case PaymentStatus.Created: return <Clock className={cls} />
    case PaymentStatus.Funded: return <Send className={cls} />
    case PaymentStatus.Released: return <Unlock className={cls} />
    case PaymentStatus.Claimed: return <CheckCircle2 className={cls} />
    case PaymentStatus.Refunded: return <RefreshCcw className={cls} />
    default: return <Clock className={cls} />
  }
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const color = STATUS_COLORS[status as PaymentStatus] ?? '#8ba4c0'
  const label = STATUS_LABELS[status as PaymentStatus] ?? 'Unknown'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      }`}
      style={{
        background: `${color}1a`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      <StatusIcon status={status} size={size} />
      {label}
    </span>
  )
}
