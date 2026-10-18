import { useState, useEffect, useRef } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { parseUnits, isAddress } from 'viem'
import { toast } from 'sonner'
import { Info, ExternalLink, Calendar, DollarSign, User, FileText } from 'lucide-react'
import { PAYFLOW_ESCROW, TARGET_CHAIN_ID, USDC_DECIMALS } from '../contract'
import { explorerTx, parseOnchainError } from '../utils'
import TxButton from './TxButton'

interface CreatePaymentProps {
  onSuccess: (paymentId: bigint) => void
}

const QUICK_AMOUNTS = ['5', '10', '25', '50', '100']

// Computed once at module load (not during render) — safe because it's a constant string
const MIN_DATE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

export default function CreatePayment({ onSuccess }: CreatePaymentProps) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineTime, setDeadlineTime] = useState('23:59')
  const [formError, setFormError] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Navigate on success
  const navigatedRef = useRef(false)
  useEffect(() => {
    if (isSuccess && !navigatedRef.current) {
      navigatedRef.current = true
      toast.success('Payment created! Deposit USDC to activate it.')
      onSuccess(0n)
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute deadline ts at action time, not render time
  function getDeadlineTs(): number {
    if (!deadlineDate) return 0
    return Math.floor(new Date(`${deadlineDate}T${deadlineTime}`).getTime() / 1000)
  }

  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID
  const recipientValid = isAddress(recipient) && recipient.toLowerCase() !== address?.toLowerCase()
  const amountValid = !!amount && Number(amount) > 0
  // deadline validity checked at submit time to avoid Date.now() in render
  const hasDeadlineDate = !!deadlineDate

  const ready =
    isConnected &&
    !wrongChain &&
    recipientValid &&
    amountValid &&
    hasDeadlineDate &&
    description.trim().length > 0

  function handleAmountChange(v: string) {
    const clean = v.replace(/[^0-9.]/g, '')
    if (clean === '' || /^\d*\.?\d{0,6}$/.test(clean)) setAmount(clean)
  }

  function handleSubmit() {
    setFormError('')
    if (wrongChain) {
      switchChain({ chainId: TARGET_CHAIN_ID })
      return
    }
    if (!ready) return
    const deadlineTs = getDeadlineTs()
    if (deadlineTs <= Date.now() / 1000) {
      setFormError('Deadline must be in the future.')
      return
    }
    try {
      writeContract({
        ...PAYFLOW_ESCROW,
        functionName: 'createPayment',
        args: [
          recipient,
          parseUnits(amount, USDC_DECIMALS),
          description.trim(),
          BigInt(deadlineTs),
        ],
      })
    } catch (e) {
      setFormError(parseOnchainError(e))
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
          Create a Payment
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Deposit USDC into escrow. Funds release when you approve — refund after the deadline.
        </p>
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* Recipient */}
        <div>
          <label
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--muted)' }}
          >
            <User className="size-3.5" /> Recipient Address
          </label>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="mono w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors placeholder:opacity-30"
            style={{
              background: 'var(--surface-strong)',
              border: `1px solid ${recipient && !isAddress(recipient) ? 'var(--danger)' : 'var(--border)'}`,
              color: 'var(--ink)',
            }}
          />
          {recipient && !isAddress(recipient) && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
              Enter a valid Ethereum address.
            </p>
          )}
          {recipient &&
            isAddress(recipient) &&
            recipient.toLowerCase() === address?.toLowerCase() && (
              <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                Recipient cannot be your own address.
              </p>
            )}
        </div>

        {/* Amount */}
        <div>
          <label
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--muted)' }}
          >
            <DollarSign className="size-3.5" /> Amount (USDC)
          </label>
          <div
            className="rounded-xl px-4 py-3"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
          >
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:opacity-20"
              style={{ color: 'var(--ink)' }}
            />
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              USDC
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => setAmount(a)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors hover:bg-white/10"
                style={{
                  background: amount === a ? 'var(--surface-strong)' : 'var(--surface)',
                  border: `1px solid ${amount === a ? 'var(--border-strong)' : 'var(--border)'}`,
                  color: amount === a ? 'var(--ink)' : 'var(--muted)',
                }}
              >
                ${a}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--muted)' }}
          >
            <FileText className="size-3.5" /> Description / Reference
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Logo design, invoice #42, milestone 1..."
            rows={2}
            className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none placeholder:opacity-30"
            style={{
              background: 'var(--surface-strong)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          />
        </div>

        {/* Deadline */}
        <div>
          <label
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--muted)' }}
          >
            <Calendar className="size-3.5" /> Deadline
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={deadlineDate}
              min={MIN_DATE}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                background: 'var(--surface-strong)',
                border: '1px solid var(--border)',
                color: 'var(--ink)',
                colorScheme: 'dark',
              }}
            />
            <input
              type="time"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
              className="rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                background: 'var(--surface-strong)',
                border: '1px solid var(--border)',
                color: 'var(--ink)',
                colorScheme: 'dark',
              }}
            />
          </div>
        </div>
      </div>

      {/* How it works */}
      <div
        className="space-y-2 rounded-2xl p-4"
        style={{
          background: 'rgba(139,124,248,0.07)',
          border: '1px solid rgba(139,124,248,0.18)',
        }}
      >
        <div
          className="flex items-center gap-2 text-xs font-semibold"
          style={{ color: 'var(--violet)' }}
        >
          <Info className="size-3.5" /> How this works
        </div>
        <ul className="space-y-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          <li>1. Create the payment record onchain (this transaction).</li>
          <li>2. Approve and deposit USDC into the escrow contract.</li>
          <li>3. Release payment once work is delivered.</li>
          <li>4. Recipient claims USDC directly from the contract.</li>
          <li>5. If deadline passes, you can refund yourself.</li>
        </ul>
      </div>

      {formError && (
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(232,105,122,0.1)',
            border: '1px solid rgba(232,105,122,0.2)',
            color: 'var(--danger)',
          }}
        >
          {formError}
        </p>
      )}

      <div className="space-y-2">
        <TxButton
          onClick={handleSubmit}
          disabled={!ready}
          isPending={isPending}
          isConfirming={isConfirming}
          isSuccess={isSuccess}
          label={
            !isConnected
              ? 'Connect Wallet First'
              : wrongChain
              ? 'Switch to Arc Testnet'
              : 'Create Payment'
          }
          successLabel="Payment Created!"
        />

        {isSuccess && hash && (
          <a
            href={explorerTx(hash)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs"
            style={{ color: 'var(--accent)' }}
          >
            View transaction <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
        After creating, deposit USDC in a second transaction to activate the payment.
      </p>
    </div>
  )
}
