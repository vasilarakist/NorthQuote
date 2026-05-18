'use client'

import { useState, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { formatCurrency } from '@/lib/utils'
import { calcCardFee } from '@/lib/stripe'
import { cn } from '@/lib/utils'
import type { PaymentMilestone } from '@/types/database'
import { CheckCircle2, Loader2, Shield, CreditCard, Building2, Clock, DollarSign } from 'lucide-react'

interface Props {
  quote: { id: string; quote_number: string; currency: string; total: number }
  org: {
    name: string; email: string | null; phone: string | null;
    logo_url: string | null; brand_color_primary: string | null;
    brand_color_secondary: string | null; stripe_account_id: string | null;
  } | null
  client: { name: string; email: string | null } | null
  milestone: PaymentMilestone
  allMilestones: PaymentMilestone[]
}

const STATUS_CONFIG = {
  paid:      { label: 'Paid',      color: 'text-green-600',  dot: 'bg-green-500' },
  requested: { label: 'Due',       color: 'text-amber-600',  dot: 'bg-amber-500' },
  pending:   { label: 'Upcoming',  color: 'text-gray-400',   dot: 'bg-gray-300'  },
}

const TRIGGER_LABELS = {
  on_acceptance: 'On acceptance',
  manual: 'Progress payment',
  on_date: 'On date',
}

// ── Payment form (inside Stripe Elements) ─────────────────────────
function MilestonePayForm({
  amountCents,
  currency,
  onSuccess,
  onError,
}: { amountCents: number; currency: string; onSuccess: () => void; onError: (m: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true)
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (error) {
      onError(error.message ?? 'Payment failed.')
      setPaying(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || paying}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-3 transition-colors"
      >
        {paying
          ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
          : <>Pay {formatCurrency(amountCents / 100, currency)} &rarr;</>}
      </button>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────
export function MilestonePaymentClient({ quote, org, client, milestone, allMilestones }: Props) {
  const primary = org?.brand_color_primary ?? '#0F1C2E'

  const [step, setStep] = useState<'pay' | 'paid'>(milestone.status === 'paid' ? 'paid' : 'pay')
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank'>('card')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadingIntent, setLoadingIntent] = useState(false)
  const [error, setError] = useState('')
  const [paidMilestoneId, setPaidMilestoneId] = useState<string | null>(
    milestone.status === 'paid' ? milestone.id : null
  )

  const [stripePromise] = useState(() =>
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
      : null
  )

  const baseAmount = (milestone.amount_cents ?? 0) / 100
  const cardFee = useMemo(() => calcCardFee(baseAmount), [baseAmount])
  const totalWithFee = paymentMethod === 'card' ? baseAmount + cardFee : baseAmount
  const hasStripe = Boolean(org?.stripe_account_id && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

  async function loadPaymentIntent() {
    setLoadingIntent(true)
    setError('')
    const res = await fetch('/api/milestones/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestone_id: milestone.id, payment_method_type: paymentMethod }),
    })
    const data = await res.json()
    if (!res.ok || !data.client_secret) {
      setError(data.error ?? 'Failed to initialize payment.')
      setLoadingIntent(false)
      return
    }
    setClientSecret(data.client_secret)
    setLoadingIntent(false)
  }

  function handleMethodChange(method: 'card' | 'bank') {
    setPaymentMethod(method)
    setClientSecret(null) // reset so we get a new intent with correct method
  }

  // Show milestone list with current milestone optimistically marked paid
  const displayMilestones = allMilestones.map(m =>
    m.id === paidMilestoneId ? { ...m, status: 'paid' as const } : m
  )
  const allPaid = displayMilestones.every(m => m.status === 'paid')

  if (step === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f8f9fa' }}>
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              {allPaid ? 'Fully Paid!' : 'Payment Received!'}
            </h1>
            <p className="text-gray-500">
              {allPaid
                ? 'All payments for this project are complete.'
                : `Your ${milestone.label.toLowerCase()} payment of ${formatCurrency(baseAmount, quote.currency)} has been received.`}
            </p>
          </div>

          {/* Milestone progress tracker */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900 text-sm">Payment Schedule</h2>
            <div className="space-y-3">
              {displayMilestones.map((m) => {
                const cfg = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.pending
                const amt = (m.amount_cents ?? 0) / 100
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', cfg.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">{m.label}</div>
                      <div className="text-xs text-gray-400">{TRIGGER_LABELS[m.trigger_type] ?? m.trigger_type}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-gray-900">{formatCurrency(amt, quote.currency)}</div>
                      <div className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {org?.email && (
            <p className="text-center text-sm text-gray-400">
              Questions? <a href={`mailto:${org.email}`} className="underline">{org.email}</a>
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fa' }}>
      {/* Header */}
      <header style={{ backgroundColor: primary }} className="text-white">
        <div className="max-w-xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {org?.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg"
                style={{ backgroundColor: org?.brand_color_secondary ?? '#D4943C' }}
              >
                {org?.name?.charAt(0) ?? 'N'}
              </div>
            )}
            <div>
              <div className="font-semibold text-lg leading-tight">{org?.name}</div>
              <div className="text-xs opacity-70">Payment Request</div>
            </div>
          </div>
          <div className="text-right text-xs opacity-60 hidden sm:block">{quote.quote_number}</div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-5">
        {/* Payment summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${primary}18` }}>
              <DollarSign size={20} style={{ color: primary }} />
            </div>
            <div>
              <div className="font-semibold text-gray-900">{milestone.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {TRIGGER_LABELS[milestone.trigger_type] ?? milestone.trigger_type}
                {milestone.percentage && ` · ${milestone.percentage}% of total`}
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-gray-100 text-center">
            <div className="text-3xl font-bold text-gray-900">
              {formatCurrency(baseAmount, quote.currency)}
            </div>
            <div className="text-sm text-gray-400 mt-1">{quote.currency}</div>
          </div>
        </div>

        {/* Payment schedule tracker */}
        {allMilestones.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock size={14} className="text-gray-400" /> Full Payment Schedule
            </h2>
            <div className="space-y-2">
              {allMilestones.map((m) => {
                const cfg = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.pending
                const isCurrent = m.id === milestone.id
                const amt = (m.amount_cents ?? 0) / 100
                return (
                  <div key={m.id} className={cn('flex items-center gap-3 py-1.5 px-2 rounded-lg', isCurrent && 'bg-amber-50')}>
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
                    <div className="flex-1 min-w-0">
                      <span className={cn('text-sm', isCurrent ? 'font-semibold text-gray-900' : 'text-gray-600')}>
                        {m.label}
                        {isCurrent && <span className="ml-1.5 text-xs font-normal text-amber-600">← this payment</span>}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-medium text-gray-900">{formatCurrency(amt, quote.currency)}</div>
                      <div className={cn('text-xs', cfg.color)}>{cfg.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Payment form */}
        {hasStripe ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <div>
              <h2 className="font-semibold text-gray-900 mb-1">Pay Now</h2>
              <p className="text-sm text-gray-500">Secure payment powered by Stripe</p>
            </div>

            {/* Payment method toggle */}
            <div className="grid grid-cols-2 gap-2">
              {(['card', 'bank'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => handleMethodChange(method)}
                  className={cn(
                    'flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all',
                    paymentMethod === method ? 'border-current' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                  style={paymentMethod === method ? { borderColor: primary, color: primary } : {}}
                >
                  {method === 'card' ? <CreditCard size={15} /> : <Building2 size={15} />}
                  {method === 'card' ? 'Card' : 'Bank Transfer'}
                </button>
              ))}
            </div>

            {paymentMethod === 'card' && (
              <p className="text-xs text-gray-400">
                A {formatCurrency(cardFee, quote.currency)} processing fee (2.9% + $0.30) applies to card payments.
                Total: {formatCurrency(totalWithFee, quote.currency)}.
              </p>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            {!clientSecret ? (
              <button
                onClick={loadPaymentIntent}
                disabled={loadingIntent}
                className="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-white font-medium transition-colors disabled:opacity-60"
                style={{ backgroundColor: primary }}
              >
                {loadingIntent
                  ? <><Loader2 size={16} className="animate-spin" /> Preparing…</>
                  : <>Continue to payment &rarr;</>}
              </button>
            ) : (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance: { theme: 'stripe' } }}
              >
                <MilestonePayForm
                  amountCents={Math.round(totalWithFee * 100)}
                  currency={quote.currency}
                  onSuccess={() => {
                    setPaidMilestoneId(milestone.id)
                    setStep('paid')
                  }}
                  onError={setError}
                />
              </Elements>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-400 justify-center">
              <Shield size={12} /> Payments processed securely by Stripe
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
            <p className="text-sm text-amber-700">Online payment is not available. Please contact {org?.name} directly.</p>
            {org?.email && (
              <a href={`mailto:${org.email}`} className="mt-2 block text-sm font-medium text-amber-700 underline">{org.email}</a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
