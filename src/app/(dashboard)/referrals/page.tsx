import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReferralsClient } from './ReferralsClient'

export default async function ReferralsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, organizations(referral_code, name, billing_credits)')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) redirect('/onboarding')

  const orgRaw = userRecord.organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as {
    referral_code: string | null
    name: string
    billing_credits: number | null
  } | null

  // Fetch referrals where this org is the referrer
  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, status, credit_amount, credited_at, created_at, referral_code_used')
    .eq('referrer_org_id', userRecord.organization_id)
    .order('created_at', { ascending: false })

  return (
    <ReferralsClient
      referralCode={org?.referral_code ?? null}
      orgName={org?.name ?? ''}
      billingCredits={org?.billing_credits ?? 0}
      referrals={referrals ?? []}
    />
  )
}
