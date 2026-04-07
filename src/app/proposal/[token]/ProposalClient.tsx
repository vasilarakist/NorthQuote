'use client'

import { useState, useMemo, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { SignaturePad } from '@/components/ui/SignaturePad'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calcCardFee } from '@/lib/stripe'
import { cn } from '@/lib/utils'
import type { QuoteLineItem } from '@/types/database'
import {
  CheckCircle2, XCircle, PenLine, CreditCard, Building2,
  ChevronRight, Loader2, Shield, Phone, Mail,
} from 'lucide-react'

type Step = 'view' | 'signing' | 'declined_form' | 'payment' | 'paid' | 'declined' | 'complete'

interface TierQuote { id: string; tier: string; total: number; proposal_token: string | null }

interface Org {
  id: string; name: string; email: string | null; phone: string | null;
  logo_url: string | null; brand_color_primary: string | null; brand_color_secondary: string | null;
  stripe_account_id: string | null; gst_hst_number: string | null; province_state: string | null;
}

interface Client { id: string; name: string; email: string | null; phone: string | null }
interface Project { id: string; project_name: string; service_address: string }

interface Props {
  quote: {
    id: string; quote_number: string; status: string; tier: string;
    subtotal: number; tax_amount: number; tax_rate: number | null; tax_type: string | null;
    total: number; currency: string; valid_until: string | null;
    notes_to_client: string | null; ai_generated: boolean;
  }
  org: Org | null
  client: Client | null
  project: Project | null
  lineItems: QuoteLineItem[]
  tierQuotes: TierQuote[]
  clientIp: string | null
}

const TIER_LABELS: Record<string, string> = { good: 'Good', better: 'Better', best: 'Best' }
const CATEGORY_COLORS: Record<string, string> = {
  material: 'text-blue-600', labour: 'text-green-600',
  permit: 'text-orange-500', other: 'text-gray-500',
}

// ── Payment form (inside Stripe Elements context) ─────────────────
function PaymentForm({
  total, onSuccess, onError,
}: { total: number; onSuccess: () => void; onError: (msg: string) => void }) {
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
        {paying ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <>Pay {formatCurrency(total)} &rarr;</>}
      </button>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────
export function ProposalClient({ quote, org, client, project, lineItems, tierQuotes, clientIp }: Props) {
  const primary = org?.brand_color_primary ?? '#0F1C2E'
  const accent  = org?.brand_color_secondary ?? '#D4943C'

  const [step, setStep] = useState<Step>(
    quote.status === 'accepted' ? 'paid' : quote.status === 'declined' ? 'declined' : 'view'
  )
  const [selectedTier, setSelectedTier] = useState(quote.tier)
  const [signatureData, setSignatureData] = useState<string>('')
  const [declineReason, setDeclineReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank'>('card')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripePromise] = useState(() =>
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
      : null
  )

  const cardFee = useMemo(() => calcCardFee(quote.total), [quote.total])
  const totalWithFee = paymentMethod === 'card' ? quote.total + cardFee : quote.total
  const hasStripe = Boolean(org?.stripe_account_id && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

  // Log signature_started event
  async function logEvent(eventType: string) {
    await fetch('/api/proposals/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote_id: quote.id, event_type: eventType }),
    })
  }

  async function handleAcceptClick() {
    await logEvent('signature_started')
    setStep('signing')
  }

  async function handleSignSubmit() {
    if (!signatureData) { setError('Please provide your signature.'); return }
    setError('')
    setLoading(true)

    const res = await fetch('/api/proposals/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote_id: quote.id, signature_data: signatureData }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Something went wrong.'); setLoading(false); return }

    if (hasStripe) {
      // Create payment intent
      const piRes = await fetch('/api/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_id: quote.id,
          amount: Math.round(totalWithFee * 100), // cents
          currency: quote.currency.toLowerCase(),
          stripe_account_id: org?.stripe_account_id,
          payment_method_types: paymentMethod === 'bank' ? ['us_bank_account', 'acss_debit'] : ['card'],
        }),
      })
      const piData = await piRes.json()
      if (piData.client_secret) {
        setClientSecret(piData.client_secret)
        setStep('payment')
        setLoading(false)
        return
      }
    }

    setStep('paid')
    setLoading(false)
  }

  async function handleDeclineSubmit() {
    setLoading(true)
    const res = await fetch('/api/proposals/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote_id: quote.id, reason: declineReason }),
    })
    if (res.ok) setStep('declined')
    setLoading(false)
  }

  // Current quote data for display
  const currentTierQuote = tierQuotes.find((t) => t.tier === selectedTier) ?? null

  if (step === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f8f9fa' }}>
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">You&apos;re all set!</h1>
          <p className="text-gray-500 mb-1">Quote accepted &amp; signed.</p>
          <p className="text-gray-500">{org?.name} will be in touch shortly.</p>
          {org?.phone && (
            <p className="mt-4 text-sm text-gray-400">Questions? Call <a href={`tel:${org.phone}`} className="underline">{org.phone}</a></p>
          )}
        </div>
      </div>
    )
  }

  if (step === 'declined') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f8f9fa' }}>
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Proposal declined</h1>
          <p className="text-gray-500">Thank you for letting us know. {org?.name} has been notified.</p>
          {org?.email && (
            <p className="mt-4 text-sm text-gray-400">Questions? <a href={`mailto:${org.email}`} className="underline">{org.email}</a></p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fa' }}>
      {/* Contractor header */}
      <header style={{ backgroundColor: primary }} className="text-white">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {org?.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-10 h-10 rounded-lg object-cover bg-white/10" />
            ) : (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg" style={{ backgroundColor: accent }}>
                {org?.name?.charAt(0) ?? 'N'}
              </div>
            )}
            <div>
              <div className="font-semibold text-lg leading-tight">{org?.name}</div>
              <div className="text-xs opacity-70">Professional Proposal</div>
            </div>
          </div>
          <div className="text-right text-xs opacity-60 hidden sm:block">
            <div>{quote.quote_number}</div>
            {quote.valid_until && <div>Valid until {formatDate(quote.valid_until)}</div>}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Hi {client?.name?.split(' ')[0] ?? 'there'}, here&apos;s your proposal
          </h1>
          {project && (
            <p className="text-gray-500 text-sm mt-1">{project.project_name} · {project.service_address}</p>
          )}
        </div>

        {/* Scope summary */}
        {quote.notes_to_client && (
          <div className="rounded-xl p-5 border-l-4" style={{ borderColor: accent, background: 'white' }}>
            <p className="text-gray-700 leading-relaxed">{quote.notes_to_client}</p>
          </div>
        )}

        {/* Tier comparison cards */}
        {tierQuotes.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Choose your option</p>
            <div className="grid grid-cols-3 gap-3">
              {tierQuotes.map((tq) => {
                const isRecommended = tq.tier === 'better'
                const isSelected = selectedTier === tq.tier
                return (
                  <button
                    key={tq.id}
                    onClick={() => {
                      setSelectedTier(tq.tier)
                      if (tq.proposal_token) window.location.href = `/proposal/${tq.proposal_token}`
                    }}
                    className={cn(
                      'relative rounded-xl p-4 text-center border-2 transition-all text-left',
                      isSelected
                        ? 'shadow-md'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    )}
                    style={isSelected ? { borderColor: accent, backgroundColor: 'white' } : {}}
                  >
                    {isRecommended && (
                      <div
                        className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
                        style={{ backgroundColor: accent }}
                      >
                        ★ Recommended
                      </div>
                    )}
                    <div className="font-bold text-gray-900 mt-1 text-sm">{TIER_LABELS[tq.tier] ?? tq.tier}</div>
                    <div className="text-lg font-bold mt-1" style={{ color: isSelected ? accent : primary }}>
                      {formatCurrency(tq.total)}
                    </div>
                    {isSelected && (
                      <div className="mt-2 text-xs font-medium" style={{ color: accent }}>Selected ✓</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Scope of Work</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {lineItems.map((item) => (
              <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{item.description}</div>
                  <div className="text-xs mt-0.5" style={{ color: accent }}>
                    <span className={cn('capitalize text-xs', CATEGORY_COLORS[item.category] ?? 'text-gray-400')}>
                      {item.category}
                    </span>
                    <span className="text-gray-400 ml-2">{item.quantity} {item.unit}</span>
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-900 flex-shrink-0">
                  {formatCurrency(item.total, quote.currency)}
                </div>
              </div>
            ))}
          </div>
          {/* Totals */}
          <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(quote.subtotal, quote.currency)}</span>
            </div>
            {quote.tax_amount > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>{quote.tax_type ?? 'Tax'} ({((quote.tax_rate ?? 0) * 100).toFixed(3).replace(/\.?0+$/, '')}%)</span>
                <span>{formatCurrency(quote.tax_amount, quote.currency)}</span>
              </div>
            )}
            {step === 'payment' && paymentMethod === 'card' && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Card processing fee (2.9% + $0.30)</span>
                <span>{formatCurrency(cardFee, quote.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total ({quote.currency})</span>
              <span style={{ color: primary }}>
                {formatCurrency(step === 'payment' && paymentMethod === 'card' ? totalWithFee : quote.total, quote.currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Action section */}
        {step === 'view' && quote.status !== 'accepted' && quote.status !== 'declined' && (
          <div className="space-y-3">
            <button
              onClick={handleAcceptClick}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-4 text-white font-semibold text-lg transition-colors hover:opacity-90"
              style={{ backgroundColor: primary }}
            >
              <PenLine size={20} /> Accept &amp; Sign Proposal
            </button>
            <button
              onClick={() => setStep('declined_form')}
              className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-2"
            >
              Decline this proposal
            </button>
          </div>
        )}

        {/* Signing step */}
        {step === 'signing' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <div>
              <h2 className="font-semibold text-gray-900 mb-1">Your signature</h2>
              <p className="text-sm text-gray-500">By signing, you agree to the scope and pricing above.</p>
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <SignaturePad onSave={setSignatureData} />
            <div className="flex gap-3">
              <button onClick={() => setStep('view')} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button
                onClick={handleSignSubmit}
                disabled={loading || !signatureData}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {hasStripe ? 'Continue to Payment' : 'Accept Proposal'}
              </button>
            </div>
          </div>
        )}

        {/* Payment step */}
        {step === 'payment' && clientSecret && stripePromise && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <div>
              <h2 className="font-semibold text-gray-900 mb-1">Payment</h2>
              <p className="text-sm text-gray-500">Secure payment powered by Stripe</p>
            </div>

            {/* Payment method toggle */}
            <div className="grid grid-cols-2 gap-2">
              {(['card', 'bank'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    'flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all',
                    paymentMethod === method ? 'border-current' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                  style={paymentMethod === method ? { borderColor: accent, color: primary } : {}}
                >
                  {method === 'card' ? <CreditCard size={16} /> : <Building2 size={16} />}
                  {method === 'card' ? 'Credit / Debit Card' : 'Bank Transfer'}
                </button>
              ))}
            </div>
            {paymentMethod === 'card' && (
              <p className="text-xs text-gray-400">
                A {formatCurrency(cardFee)} processing fee (2.9% + $0.30) applies to card payments.
              </p>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
              <PaymentForm
                total={totalWithFee}
                onSuccess={() => setStep('paid')}
                onError={setError}
              />
            </Elements>

            <div className="flex items-center gap-2 text-xs text-gray-400 justify-center">
              <Shield size={12} /> Payments processed securely by Stripe
            </div>
          </div>
        )}

        {/* Decline form */}
        {step === 'declined_form' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Decline proposal</h2>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Reason (optional)</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none resize-none"
                rows={3}
                placeholder="Let them know why, so they can improve their quote…"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('view')} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button
                onClick={handleDeclineSubmit}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Already accepted/declined */}
        {quote.status === 'accepted' && step === 'view' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <div className="font-medium text-green-800">Proposal accepted</div>
              <div className="text-sm text-green-600">{org?.name} has been notified.</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pb-4 space-y-1">
          {(org?.email || org?.phone) && (
            <div className="flex items-center justify-center gap-4">
              {org.email && (
                <a href={`mailto:${org.email}`} className="flex items-center gap-1 hover:text-gray-600 transition-colors">
                  <Mail size={11} /> {org.email}
                </a>
              )}
              {org.phone && (
                <a href={`tel:${org.phone}`} className="flex items-center gap-1 hover:text-gray-600 transition-colors">
                  <Phone size={11} /> {org.phone}
                </a>
              )}
            </div>
          )}
          {org?.gst_hst_number && <div>GST/HST: {org.gst_hst_number}</div>}
          <div>Powered by NorthQuote</div>
        </div>
      </div>
    </div>
  )
}
