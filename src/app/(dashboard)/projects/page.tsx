import { createClient } from '@/lib/supabase/server'
import { ProjectsPageClient } from './ProjectsPageClient'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return null

  const [{ data: projects }, { data: clients }] = await Promise.all([
    supabase
      .from('projects')
      .select('*, clients(id, name, email, phone)')
      .eq('organization_id', userRecord.organization_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('clients')
      .select('id, name')
      .eq('organization_id', userRecord.organization_id)
      .order('name', { ascending: true }),
  ])

  return (
    <ProjectsPageClient
      initialProjects={projects ?? []}
      clients={clients ?? []}
      organizationId={userRecord.organization_id}
    />
  )
}
