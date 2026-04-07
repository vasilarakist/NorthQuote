import Stripe from 'stripe'

// Lazily instantiated so build-time doesn't fail without env vars
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true })
  }
  return _stripe
}

// Convenience re-export used by API routes
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string, unknown>)[prop as string]
  },
})

// Processing fee helpers
export const CARD_FEE_PERCENT = 0.029  // 2.9%
export const CARD_FEE_FIXED = 0.30     // $0.30

export function calcCardFee(amount: number): number {
  return Math.round((amount * CARD_FEE_PERCENT + CARD_FEE_FIXED) * 100) / 100
}
