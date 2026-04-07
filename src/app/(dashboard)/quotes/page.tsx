import { createClient } from '@/lib/supabase/server'
import { QuotesListClient } from './QuotesListClient'

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return null

  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, quote_number, status, total, currency, created_at, sent_at, clients(name), projects(project_name)')
    .eq('organization_id', userRecord.organization_id)
    .order('created_at', { ascending: false })

  // Normalize Supabase join shape
  const normalized = (quotes ?? []).map((q) => {
    const clientRaw = q.clients
    const projectRaw = q.projects
    return {
      ...q,
      clients: (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as { name: string } | null | undefined,
      projects: (Array.isArray(projectRaw) ? projectRaw[0] : projectRaw) as { project_name: string } | null | undefined,
    }
  })

  return <QuotesListClient initialQuotes={normalized} organizationId={userRecord.organization_id} />
}
