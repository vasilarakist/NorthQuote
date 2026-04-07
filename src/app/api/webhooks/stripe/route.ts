import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  switch (event.type) {
    // ── Payment succeeded ─────────────────────────────────────────
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      const quoteId = pi.metadata?.quote_id

      if (quoteId) {
        // Find invoice linked to this quote
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (invoice) {
          await supabase.from('invoices').update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: pi.id,
            payment_method: pi.payment_method_types?.[0] ?? 'card',
          }).eq('id', invoice.id)
        }
      }
      break
    }

    // ── Payment failed ────────────────────────────────────────────
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent
      const quoteId = pi.metadata?.quote_id

      if (quoteId) {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (invoice) {
          await supabase.from('invoices').update({
            stripe_payment_intent_id: pi.id,
          }).eq('id', invoice.id)
        }
      }
      break
    }

    // ── Stripe Connect account updated ────────────────────────────
    case 'account.updated': {
      const account = event.data.object as Stripe.Account
      const chargesEnabled = account.charges_enabled
      const detailsSubmitted = account.details_submitted

      if (detailsSubmitted) {
        await supabase
          .from('organizations')
          .update({
            subscription_status: chargesEnabled ? 'active' : 'incomplete',
          })
          .eq('stripe_account_id', account.id)
      }
      break
    }

    default:
      // Unhandled event type — ignore
      break
  }

  return NextResponse.json({ received: true })
}
