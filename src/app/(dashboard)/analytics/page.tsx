import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AnalyticsClient } from './AnalyticsClient'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) redirect('/onboarding')

  const orgId = userRecord.organization_id

  // Fetch all quotes for analytics
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, status, total, currency, created_at, sent_at, accepted_at, declined_at, ai_generated, tier')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  // Fetch paid invoices for revenue
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total, paid_at, created_at')
    .eq('organization_id', orgId)
    .eq('status', 'paid')

  return (
    <AnalyticsClient
      quotes={quotes ?? []}
      paidInvoices={invoices ?? []}
    />
  )
}
