import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check if onboarding is complete
  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, organizations(name)')
    .eq('auth_id', user.id)
    .single()

  if (!userRecord) redirect('/onboarding')

  const orgRaw = userRecord.organizations
  const orgName = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw as { name: string } | null)?.name

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar orgName={orgName} userEmail={user.email} />

      {/* Main content */}
      <div className="lg:pl-60">
        {/* Top padding for mobile header */}
        <div className="lg:hidden h-14" />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
