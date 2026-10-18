import { useState, useEffect } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { ExternalLink, Loader2, RefreshCw, Shield } from 'lucide-react'
import {
  PAYFLOW_ESCROW,
  USDC_ADDRESS,
  TARGET_CHAIN_ID,
  PaymentStatus,
  type PaymentStruct,
} from '../contract'
import {
  formatUsdc,
  formatAddress,
  formatDeadline,
  isDeadlinePassed,
  explorerTx,
  explorerAddress,
  parseOnchainError,
} from '../utils'
import StatusBadge from './StatusBadge'
import TxButton from './TxButton'

interface PaymentDetailProps {
  paymentId: bigint
  onBack: () => void
}

type TxStep = 'idle' | 'approving' | 'transacting' | 'done'

export default function PaymentDetail({ paymentId }: PaymentDetailProps) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  const [step, setStep] = useState<TxStep>('idle')
  const [txError, setTxError] = useState('')

  const { data: paymentRaw, isLoading, refetch } = useReadContract({
    ...PAYFLOW_ESCROW,
    functionName: 'getPayment',
    args: [paymentId],
    chainId: TARGET_CHAIN_ID,
  })

  const payment = paymentRaw as PaymentStruct | undefined

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && payment ? [address, PAYFLOW_ESCROW.address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address && !!payment },
  })

  const {
    writeContract,
    data: writeHash,
    isPending: writePending,
    reset: resetWrite,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: writeHash })

  // Refetch contract state after a tx confirms
  useEffect(() => {
    if (!isSuccess || !writeHash) return
    toast.success('Transaction confirmed!')
    const tid = setTimeout(() => {
      setStep('done')
      void refetch()
      void refetchAllowance()
    }, 500)
    return () => clearTimeout(tid)
  }, [isSuccess, writeHash]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derived — no separate state needed
  const latestHash = isSuccess ? writeHash : undefined

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20" style={{ color: 'var(--muted)' }}>
        <Loader2 className="size-5 animate-spin" />
        <span>Loading payment...</span>
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="py-20 text-center" style={{ color: 'var(--muted)' }}>
        Payment #{Number(paymentId)} not found.
      </div>
    )
  }

  const isPayer = address?.toLowerCase() === payment.payer.toLowerCase()
  const isRecipient = address?.toLowerCase() === payment.recipient.toLowerCase()
  const expired = isDeadlinePassed(payment.deadline)
  const allowance = allowanceRaw
  const hasSufficientAllowance = allowance !== undefined ? allowance >= payment.amount : false

  function handleSwitchChain() {
    switchChain({ chainId: TARGET_CHAIN_ID })
  }

  function handleApprove() {
    setTxError('')
    setStep('approving')
    try {
      writeContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PAYFLOW_ESCROW.address, payment!.amount],
        chainId: TARGET_CHAIN_ID,
      })
    } catch (e) {
      setTxError(parseOnchainError(e))
      setStep('idle')
    }
  }

  function handleFund() {
    setTxError('')
    setStep('transacting')
    try {
      writeContract({
        ...PAYFLOW_ESCROW,
        functionName: 'fundPayment',
        args: [paymentId],
        chainId: TARGET_CHAIN_ID,
      })
    } catch (e) {
      setTxError(parseOnchainError(e))
      setStep('idle')
    }
  }

  function handleRelease() {
    setTxError('')
    try {
      writeContract({
        ...PAYFLOW_ESCROW,
        functionName: 'releasePayment',
        args: [paymentId],
        chainId: TARGET_CHAIN_ID,
      })
    } catch (e) {
      setTxError(parseOnchainError(e))
    }
  }

  function handleClaim() {
    setTxError('')
    try {
      writeContract({
        ...PAYFLOW_ESCROW,
        functionName: 'claimPayment',
        args: [paymentId],
        chainId: TARGET_CHAIN_ID,
      })
    } catch (e) {
      setTxError(parseOnchainError(e))
    }
  }

  function handleRefund() {
    setTxError('')
    try {
      writeContract({
        ...PAYFLOW_ESCROW,
        functionName: 'refundPayment',
        args: [paymentId],
        chainId: TARGET_CHAIN_ID,
      })
    } catch (e) {
      setTxError(parseOnchainError(e))
    }
  }

  function handleReset() {
    setStep('idle')
    setTxError('')
    resetWrite()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="mono text-xs" style={{ color: 'var(--subtle)' }}>
              Payment #{Number(paymentId)}
            </span>
            <StatusBadge status={payment.status} />
          </div>
          <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
            {payment.description || '(No description)'}
          </h1>
        </div>
        <div className="text-right">
          <div className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUsdc(payment.amount)}
          </div>
          <div className="text-sm" style={{ color: 'var(--muted)' }}>USDC</div>
        </div>
      </div>

      {/* Details card */}
      <div
        className="divide-y overflow-hidden rounded-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {[
          { label: 'Payer', value: payment.payer, isAddr: true, suffix: isPayer ? ' (you)' : '' },
          {
            label: 'Recipient',
            value: payment.recipient,
            isAddr: true,
            suffix: isRecipient ? ' (you)' : '',
          },
          { label: 'Amount', value: `${formatUsdc(payment.amount)} USDC`, isAddr: false, suffix: '' },
          {
            label: 'Deadline',
            value: formatDeadline(payment.deadline),
            isAddr: false,
            suffix: expired ? ' (expired)' : '',
          },
          { label: 'Created', value: formatDeadline(payment.createdAt), isAddr: false, suffix: '' },
        ].map(({ label, value, isAddr, suffix }) => (
          <div
            key={label}
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>
              {label}
            </span>
            <div className="flex items-center gap-1.5">
              {isAddr ? (
                <a
                  href={explorerAddress(value)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono flex items-center gap-1 text-xs hover:underline"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {formatAddress(value)}
                  <ExternalLink className="size-3 opacity-50" />
                </a>
              ) : (
                <span
                  className="text-sm font-medium tabular-nums"
                  style={{
                    color: suffix.includes('expired') ? 'var(--danger)' : 'var(--ink-2)',
                  }}
                >
                  {value}
                </span>
              )}
              {suffix && !suffix.includes('expired') && (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {suffix}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {isConnected && !wrongChain && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
            Available Actions
          </h2>

          {/* Payer: Fund */}
          {isPayer && payment.status === PaymentStatus.Created && (
            <div
              className="space-y-3 rounded-2xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                Deposit{' '}
                <strong style={{ color: 'var(--ink)' }}>{formatUsdc(payment.amount)} USDC</strong>{' '}
                into escrow. Two transactions: approve then fund.
              </div>
              {!hasSufficientAllowance ? (
                <TxButton
                  onClick={handleApprove}
                  isPending={writePending && step === 'approving'}
                  isConfirming={isConfirming && step === 'approving'}
                  label={`Step 1: Approve ${formatUsdc(payment.amount)} USDC`}
                  variant="secondary"
                />
              ) : (
                <TxButton
                  onClick={handleFund}
                  isPending={writePending && step === 'transacting'}
                  isConfirming={isConfirming && step === 'transacting'}
                  label={`Step 2: Deposit ${formatUsdc(payment.amount)} USDC`}
                />
              )}
              {hasSufficientAllowance && (
                <p className="text-xs" style={{ color: 'var(--success)' }}>
                  Allowance granted. Ready to deposit.
                </p>
              )}
            </div>
          )}

          {/* Payer: Release */}
          {isPayer && payment.status === PaymentStatus.Funded && (
            <div
              className="space-y-3 rounded-2xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                Release funds to the recipient once the work is delivered.
              </div>
              <TxButton
                onClick={handleRelease}
                isPending={writePending}
                isConfirming={isConfirming}
                label="Release to Recipient"
              />
            </div>
          )}

          {/* Payer: Refund after deadline */}
          {isPayer && payment.status === PaymentStatus.Funded && expired && (
            <div
              className="space-y-3 rounded-2xl p-4"
              style={{
                background: 'rgba(232,105,122,0.07)',
                border: '1px solid rgba(232,105,122,0.2)',
              }}
            >
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                The deadline has passed. Reclaim your USDC.
              </div>
              <TxButton
                onClick={handleRefund}
                isPending={writePending}
                isConfirming={isConfirming}
                label="Refund to Me"
                variant="danger"
              />
            </div>
          )}

          {/* Recipient: Claim */}
          {isRecipient && payment.status === PaymentStatus.Released && (
            <div
              className="space-y-3 rounded-2xl p-4"
              style={{
                background: 'rgba(110,212,156,0.07)',
                border: '1px solid rgba(110,212,156,0.2)',
              }}
            >
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                The payer released the funds. Claim your{' '}
                <strong style={{ color: 'var(--success)' }}>{formatUsdc(payment.amount)} USDC</strong>.
              </div>
              <TxButton
                onClick={handleClaim}
                isPending={writePending}
                isConfirming={isConfirming}
                label="Claim Funds"
                successLabel="Funds Claimed!"
                isSuccess={isSuccess && step === 'done'}
              />
            </div>
          )}

          {/* Terminal states */}
          {payment.status === PaymentStatus.Claimed && (
            <div
              className="flex items-center gap-3 rounded-2xl p-4"
              style={{
                background: 'rgba(110,212,156,0.07)',
                border: '1px solid rgba(110,212,156,0.2)',
              }}
            >
              <Shield className="size-5" style={{ color: 'var(--success)' }} />
              <span className="text-sm" style={{ color: 'var(--success)' }}>
                Payment completed. USDC delivered to recipient.
              </span>
            </div>
          )}

          {payment.status === PaymentStatus.Refunded && (
            <div
              className="flex items-center gap-3 rounded-2xl p-4"
              style={{
                background: 'rgba(96,122,150,0.1)',
                border: '1px solid rgba(96,122,150,0.2)',
              }}
            >
              <RefreshCw className="size-5" style={{ color: 'var(--subtle)' }} />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                Payment refunded to payer.
              </span>
            </div>
          )}
        </div>
      )}

      {wrongChain && (
        <TxButton onClick={handleSwitchChain} label="Switch to Arc Testnet" variant="secondary" />
      )}

      {txError && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(232,105,122,0.1)',
            border: '1px solid rgba(232,105,122,0.2)',
            color: 'var(--danger)',
          }}
        >
          {txError}
          <button onClick={handleReset} className="ml-2 text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {latestHash && (
        <a
          href={explorerTx(latestHash)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs"
          style={{ color: 'var(--accent)' }}
        >
          View latest transaction <ExternalLink className="size-3" />
        </a>
      )}

      <button
        onClick={() => {
          void refetch()
          void refetchAllowance()
        }}
        className="flex w-full items-center justify-center gap-1.5 text-xs"
        style={{ color: 'var(--subtle)' }}
      >
        <RefreshCw className="size-3" /> Refresh
      </button>
    </div>
  )
}
