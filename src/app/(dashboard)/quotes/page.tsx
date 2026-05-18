import { createClient } from '@/lib/supabase/server'
import { QuotesListClient } from './QuotesListClient'

export type PaymentStatus = 'none' | 'partial' | 'full'

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
    .select('id, quote_number, status, total, currency, created_at, sent_at, has_payment_schedule, clients(name), projects(project_name)')
    .eq('organization_id', userRecord.organization_id)
    .order('created_at', { ascending: false })

  const quoteIds = (quotes ?? []).map((q) => q.id)

  // Batch-load milestones and invoices for all quotes
  const [{ data: allMilestones }, { data: allInvoices }] = await Promise.all([
    quoteIds.length > 0
      ? supabase.from('payment_milestones').select('quote_id, status').in('quote_id', quoteIds)
      : Promise.resolve({ data: [] }),
    quoteIds.length > 0
      ? supabase.from('invoices').select('quote_id, status').in('quote_id', quoteIds)
      : Promise.resolve({ data: [] }),
  ])

  // Build lookup maps
  const milestonesByQuote = new Map<string, string[]>()
  for (const m of allMilestones ?? []) {
    const arr = milestonesByQuote.get(m.quote_id) ?? []
    arr.push(m.status)
    milestonesByQuote.set(m.quote_id, arr)
  }
  const invoiceByQuote = new Map<string, string>()
  for (const inv of allInvoices ?? []) {
    invoiceByQuote.set(inv.quote_id, inv.status)
  }

  function computePaymentStatus(quoteId: string, hasSchedule: boolean): PaymentStatus {
    const milestones = milestonesByQuote.get(quoteId) ?? []
    if (hasSchedule && milestones.length > 0) {
      const paidCount = milestones.filter((s) => s === 'paid').length
      if (paidCount === 0) return 'none'
      if (paidCount === milestones.length) return 'full'
      return 'partial'
    }
    const invoiceStatus = invoiceByQuote.get(quoteId)
    if (invoiceStatus === 'paid') return 'full'
    return 'none'
  }

  // Normalize Supabase join shape
  const normalized = (quotes ?? []).map((q) => {
    const clientRaw = q.clients
    const projectRaw = q.projects
    return {
      ...q,
      clients: (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as { name: string } | null | undefined,
      projects: (Array.isArray(projectRaw) ? projectRaw[0] : projectRaw) as { project_name: string } | null | undefined,
      paymentStatus: computePaymentStatus(q.id, q.has_payment_schedule ?? false),
    }
  })

  return <QuotesListClient initialQuotes={normalized} organizationId={userRecord.organization_id} />
}
