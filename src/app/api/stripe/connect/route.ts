import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!userRecord || userRecord.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can connect Stripe' }, { status: 403 })
  }

  const serviceClient = await createServiceClient()
  const { data: org } = await serviceClient
    .from('organizations')
    .select('id, stripe_account_id, name, email')
    .eq('id', userRecord.organization_id)
    .single()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  // Create or reuse Stripe account
  let stripeAccountId = org.stripe_account_id
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'standard',
      business_profile: { name: org.name ?? undefined },
      email: org.email ?? undefined,
    })
    stripeAccountId = account.id
    await serviceClient
      .from('organizations')
      .update({ stripe_account_id: stripeAccountId })
      .eq('id', org.id)
  }

  // Generate onboarding Account Link
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${APP_URL}/api/stripe/connect`,
    return_url: `${APP_URL}/settings?stripe=connected`,
    type: 'account_onboarding',
  })

  return NextResponse.json({ url: accountLink.url })
}

// GET: re-generate account link (refresh_url redirect target)
export async function GET() {
  return NextResponse.redirect(
    `${APP_URL}/settings`,
    { status: 302 }
  )
}
