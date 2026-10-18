import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { ArrowLeft, Zap } from 'lucide-react'
import { formatAddress } from '../utils'
import { TARGET_CHAIN_ID } from '../contract'
import { TokenUSDC } from '@web3icons/react'

interface LayoutProps {
  children: React.ReactNode
  title?: string
  onBack?: () => void
}

export default function Layout({ children, title, onBack }: LayoutProps) {
  const { address, chainId, isConnected } = useAccount()
  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Nav */}
      <header
        className="sticky top-0 z-40 border-b px-4 py-3"
        style={{
          background: 'rgba(13,27,47,0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="flex size-8 items-center justify-center rounded-xl transition-colors hover:bg-white/8"
                style={{ color: 'var(--muted)' }}
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div
                className="flex size-7 items-center justify-center rounded-lg"
                style={{ background: 'var(--violet-subtle)' }}
              >
                <Zap className="size-3.5" style={{ color: 'var(--violet)' }} />
              </div>
              <span className="display text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                PayFlow
              </span>
              {title && (
                <>
                  <span style={{ color: 'var(--subtle)' }}>/</span>
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>
                    {title}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {wrongChain && (
              <div
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{ background: 'rgba(232,105,122,0.15)', color: 'var(--danger)' }}
              >
                Wrong network
              </div>
            )}
            {isConnected && address && (
              <div
                className="hidden items-center gap-1.5 rounded-xl px-3 py-1.5 sm:flex"
                style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
              >
                <TokenUSDC variant="branded" size={14} />
                <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>
                  {formatAddress(address)}
                </span>
              </div>
            )}
            <ConnectKitButton.Custom>
              {({ isConnected, show }) => (
                <button
                  onClick={show}
                  className="rounded-xl px-4 py-2 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={
                    isConnected
                      ? {
                          background: 'var(--surface-strong)',
                          border: '1px solid var(--border)',
                          color: 'var(--ink-2)',
                        }
                      : {
                          background: 'var(--accent)',
                          color: '#0a1628',
                        }
                  }
                >
                  {isConnected ? 'Connected' : 'Connect Wallet'}
                </button>
              )}
            </ConnectKitButton.Custom>
          </div>
        </div>
      </header>

      {/* Wrong chain banner */}
      {wrongChain && (
        <div
          className="border-b px-4 py-2 text-center text-xs font-medium"
          style={{
            background: 'rgba(232,105,122,0.1)',
            borderColor: 'rgba(232,105,122,0.2)',
            color: 'var(--danger)',
          }}
        >
          Switch to Arc Testnet to use PayFlow
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  )
}
