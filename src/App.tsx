import { useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import CreatePayment from './components/CreatePayment'
import PaymentDetail from './components/PaymentDetail'
import MyPayments from './components/MyPayments'

type View =
  | { page: 'dashboard' }
  | { page: 'create' }
  | { page: 'detail'; paymentId: bigint }
  | { page: 'my-payments' }

export default function App() {
  const [view, setView] = useState<View>({ page: 'dashboard' })

  function goToDetail(id: bigint) {
    if (id > 0n) {
      setView({ page: 'detail', paymentId: id })
    } else {
      setView({ page: 'my-payments' })
    }
  }

  function getTitle(): string | undefined {
    switch (view.page) {
      case 'create': return 'New Payment'
      case 'detail': return `Payment #${Number((view).paymentId)}`
      case 'my-payments': return 'My Payments'
      default: return undefined
    }
  }

  function getOnBack(): (() => void) | undefined {
    if (view.page === 'dashboard') return undefined
    return () => setView({ page: 'dashboard' })
  }

  return (
    <Layout title={getTitle()} onBack={getOnBack()}>
      {view.page === 'dashboard' && (
        <Dashboard
          onCreatePayment={() => setView({ page: 'create' })}
          onViewPayment={(id) => setView({ page: 'detail', paymentId: id })}
          onMyPayments={() => setView({ page: 'my-payments' })}
        />
      )}

      {view.page === 'create' && (
        <CreatePayment onSuccess={(id) => goToDetail(id)} />
      )}

      {view.page === 'detail' && (
        <PaymentDetail
          paymentId={(view).paymentId}
          onBack={() => setView({ page: 'dashboard' })}
        />
      )}

      {view.page === 'my-payments' && (
        <MyPayments
          onViewPayment={(id) => setView({ page: 'detail', paymentId: id })}
        />
      )}
    </Layout>
  )
}
