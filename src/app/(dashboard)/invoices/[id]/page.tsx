import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InvoiceDetailClient } from './InvoiceDetailClient'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) redirect('/onboarding')

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, clients(name, email, phone), projects(project_name, service_address)')
    .eq('id', id)
    .eq('organization_id', userRecord.organization_id)
    .single()

  if (!invoice) notFound()

  const clientData = (Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients) as
    { name: string; email: string | null; phone: string | null } | null
  const projectData = (Array.isArray(invoice.projects) ? invoice.projects[0] : invoice.projects) as
    { project_name: string; service_address: string } | null

  return (
    <InvoiceDetailClient
      invoice={{ ...invoice, clients: clientData, projects: projectData }}
    />
  )
}
