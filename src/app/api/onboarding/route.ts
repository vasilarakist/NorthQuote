import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  // Verify the caller has a valid session
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Guard: don't allow onboarding if the user already has an org
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already onboarded' }, { status: 409 })
  }

  const body = await request.json()
  const {
    name, phone, address, city, province_state, postal_zip, country,
    trade_type, gst_hst_number, logo_url, referral_code,
  } = body

  if (!name) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  }

  // Use the service role client to bypass RLS for account creation
  const service = await createServiceClient()

  // 1. Create the organization
  const { data: org, error: orgError } = await service
    .from('organizations')
    .insert({
      name,
      phone: phone || null,
      address: address || null,
      city: city || null,
      province_state: province_state || null,
      postal_zip: postal_zip || null,
      country: country || 'CA',
      trade_type: trade_type || null,
      gst_hst_number: gst_hst_number || null,
      logo_url: logo_url || null,
      referral_code,
    })
    .select()
    .single()

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 })
  }

  // 2. Create the user record linked to the new org
  const { error: userError } = await service
    .from('users')
    .insert({
      organization_id: org.id,
      email: user.email!,
      full_name: user.user_metadata?.full_name || null,
      role: 'owner',
      auth_id: user.id,
    })

  if (userError) {
    // Roll back the org to avoid orphaned records
    await service.from('organizations').delete().eq('id', org.id)
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  return NextResponse.json({ organization_id: org.id })
}
