import { Loader2 } from 'lucide-react'

interface TxButtonProps {
  onClick: () => void
  disabled?: boolean
  isPending?: boolean
  isConfirming?: boolean
  isSuccess?: boolean
  label: string
  pendingLabel?: string
  confirmingLabel?: string
  successLabel?: string
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  className?: string
}

const VARIANTS = {
  primary: {
    bg: 'var(--accent)',
    color: '#0a1628',
    hoverBg: 'var(--accent-hover)',
  },
  secondary: {
    bg: 'var(--surface-strong)',
    color: 'var(--ink-2)',
    border: 'var(--border)',
  },
  danger: {
    bg: 'rgba(232,105,122,0.15)',
    color: 'var(--danger)',
    border: 'rgba(232,105,122,0.3)',
  },
  ghost: {
    bg: 'transparent',
    color: 'var(--muted)',
  },
}

export default function TxButton({
  onClick,
  disabled,
  isPending,
  isConfirming,
  isSuccess,
  label,
  pendingLabel = 'Confirm in wallet...',
  confirmingLabel = 'Confirming...',
  successLabel,
  variant = 'primary',
  className = '',
}: TxButtonProps) {
  const v = VARIANTS[variant]
  const busy = isPending || isConfirming
  const showSuccess = isSuccess && successLabel

  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={{
        background: v.bg,
        color: showSuccess ? 'var(--success)' : v.color,
        border: 'border' in v ? `1px solid ${v.border}` : undefined,
      }}
    >
      {isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {pendingLabel}
        </>
      ) : isConfirming ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {confirmingLabel}
        </>
      ) : showSuccess ? (
        successLabel
      ) : (
        label
      )}
    </button>
  )
}
