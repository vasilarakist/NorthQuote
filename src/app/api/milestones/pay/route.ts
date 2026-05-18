import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { stripe, calcCardFee } from '@/lib/stripe'

export async function POST(request: Request) {
  const { milestone_id, payment_method_type } = await request.json()
  if (!milestone_id) return NextResponse.json({ error: 'milestone_id required' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: milestone } = await supabase
    .from('payment_milestones')
    .select('*, quotes(id, currency, organization_id, organizations(stripe_account_id))')
    .eq('id', milestone_id)
    .single()

  if (!milestone) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })
  if (milestone.status === 'paid') return NextResponse.json({ error: 'Already paid' }, { status: 400 })

  const quote = milestone.quotes as {
    id: string; currency: string; organization_id: string;
    organizations: { stripe_account_id: string | null } | null
  } | null

  const org = quote?.organizations
    ? (Array.isArray(quote.organizations)
        ? (quote.organizations as { stripe_account_id: string | null }[])[0]
        : quote.organizations as { stripe_account_id: string | null })
    : null

  const baseAmountCents = milestone.amount_cents ?? 0
  const currency = (quote?.currency ?? 'CAD').toLowerCase()
  const stripeAccountId = org?.stripe_account_id ?? null

  const isCard = payment_method_type !== 'bank'
  const cardFeeCents = isCard ? Math.round(calcCardFee(baseAmountCents / 100) * 100) : 0
  const totalCents = baseAmountCents + cardFeeCents

  try {
    const params: Parameters<typeof stripe.paymentIntents.create>[0] = {
      amount: totalCents,
      currency,
      payment_method_types: payment_method_type === 'bank' ? ['us_bank_account', 'acss_debit'] : ['card'],
      metadata: { milestone_id, quote_id: milestone.quote_id },
    }

    if (stripeAccountId) {
      params.transfer_data = { destination: stripeAccountId }
      params.application_fee_amount = Math.round(totalCents * 0.015)
    }

    const paymentIntent = await stripe.paymentIntents.create(params)
    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      amount_cents: totalCents,
      base_amount_cents: baseAmountCents,
      card_fee_cents: cardFeeCents,
    })
  } catch (err) {
    console.error('Milestone PaymentIntent error:', err)
    return NextResponse.json({ error: 'Failed to create payment intent' }, { status: 500 })
  }
}
