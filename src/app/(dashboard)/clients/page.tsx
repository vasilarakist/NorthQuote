import { createClient } from '@/lib/supabase/server'
import { ClientsPageClient } from './ClientsPageClient'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return null

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('organization_id', userRecord.organization_id)
    .order('name', { ascending: true })

  return (
    <ClientsPageClient
      initialClients={clients ?? []}
      organizationId={userRecord.organization_id}
    />
  )
}
