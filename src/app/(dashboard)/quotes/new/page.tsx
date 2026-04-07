import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuoteBuilderClient } from './QuoteBuilderClient'

export default async function NewQuotePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, organizations(province_state, trade_type)')
    .eq('auth_id', user.id)
    .single()

  if (!userRecord) redirect('/onboarding')

  const orgRaw = userRecord.organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { province_state: string | null; trade_type: string | null } | null

  const orgId = userRecord.organization_id

  const [{ data: clients }, { data: projects }, { data: priceBookItems }] = await Promise.all([
    supabase.from('clients').select('*').eq('organization_id', orgId).order('name'),
    supabase.from('projects').select('*').eq('organization_id', orgId).eq('status', 'active').order('project_name'),
    supabase.from('price_book_items').select('*').eq('organization_id', orgId).order('name'),
  ])

  return (
    <QuoteBuilderClient
      organizationId={orgId}
      tradeType={org?.trade_type ?? 'general'}
      provinceState={org?.province_state ?? 'ON'}
      initialClients={clients ?? []}
      initialProjects={projects ?? []}
      priceBookItems={priceBookItems ?? []}
    />
  )
}
