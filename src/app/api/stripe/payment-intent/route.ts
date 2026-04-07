import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function POST(request: Request) {
  const { quote_id, amount, currency, stripe_account_id, payment_method_types } = await request.json()

  if (!amount || !currency) {
    return NextResponse.json({ error: 'amount and currency are required' }, { status: 400 })
  }

  try {
    const params: Parameters<typeof stripe.paymentIntents.create>[0] = {
      amount: Math.round(amount), // already in cents from client
      currency: currency.toLowerCase(),
      payment_method_types: payment_method_types ?? ['card'],
      metadata: { quote_id: quote_id ?? '' },
    }

    if (stripe_account_id) {
      params.transfer_data = { destination: stripe_account_id }
      params.application_fee_amount = Math.round(amount * 0.015) // 1.5% platform fee
    }

    const paymentIntent = await stripe.paymentIntents.create(params)
    return NextResponse.json({ client_secret: paymentIntent.client_secret })
  } catch (err) {
    console.error('PaymentIntent error:', err)
    return NextResponse.json({ error: 'Failed to create payment intent' }, { status: 500 })
  }
}
