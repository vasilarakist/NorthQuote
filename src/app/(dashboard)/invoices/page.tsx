import { createClient } from '@/lib/supabase/server'
import { InvoicesListClient } from './InvoicesListClient'

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return null

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total, currency, due_date, paid_at, created_at, clients(name), projects(project_name)')
    .eq('organization_id', userRecord.organization_id)
    .order('created_at', { ascending: false })

  const normalized = (invoices ?? []).map((inv) => ({
    ...inv,
    clients: (Array.isArray(inv.clients) ? inv.clients[0] : inv.clients) as { name: string } | null | undefined,
    projects: (Array.isArray(inv.projects) ? inv.projects[0] : inv.projects) as { project_name: string } | null | undefined,
  }))

  return <InvoicesListClient initialInvoices={normalized} />
}
