import { createClient } from '@/lib/supabase/server'
import { SettingsPageClient } from './SettingsPageClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, full_name, role')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return null

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', userRecord.organization_id)
    .single()

  return (
    <SettingsPageClient
      organization={org}
      user={{ ...userRecord, email: user.email ?? '' }}
    />
  )
}
