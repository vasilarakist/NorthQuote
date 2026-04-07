import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuoteDetailClient } from './QuoteDetailClient'

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, organizations(province_state)')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) redirect('/onboarding')

  const orgRaw = userRecord.organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { province_state: string | null } | null

  const [{ data: quote }, { data: lineItems }, { data: versions }] = await Promise.all([
    supabase
      .from('quotes')
      .select('*, clients(name, email, phone), projects(project_name, service_address)')
      .eq('id', id)
      .eq('organization_id', userRecord.organization_id)
      .single(),
    supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', id)
      .order('position'),
    supabase
      .from('quote_versions')
      .select('*')
      .eq('quote_id', id)
      .order('version_number', { ascending: false }),
  ])

  if (!quote) notFound()

  const clientRaw = quote.clients
  const projectRaw = quote.projects
  const clientData = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as { name: string; email: string | null; phone: string | null } | null
  const projectData = (Array.isArray(projectRaw) ? projectRaw[0] : projectRaw) as { project_name: string; service_address: string } | null

  return (
    <QuoteDetailClient
      quote={{ ...quote, clients: clientData, projects: projectData }}
      lineItems={lineItems ?? []}
      provinceState={org?.province_state ?? 'ON'}
      versions={versions ?? []}
    />
  )
}
