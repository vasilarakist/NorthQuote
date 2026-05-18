import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { MilestonePaymentClient } from './MilestonePaymentClient'

export default async function MilestonePaymentPage({
  params,
}: {
  params: Promise<{ token: string; milestoneId: string }>
}) {
  const { token, milestoneId } = await params
  const supabase = await createServiceClient()

  // Load quote via proposal token
  const { data: quote } = await supabase
    .from('quotes')
    .select('id, quote_number, currency, total, status, proposal_token, organizations(name, email, phone, logo_url, brand_color_primary, brand_color_secondary, stripe_account_id), clients(name, email)')
    .eq('proposal_token', token)
    .single()

  if (!quote) notFound()

  // Load the specific milestone
  const { data: milestone } = await supabase
    .from('payment_milestones')
    .select('*')
    .eq('id', milestoneId)
    .eq('quote_id', quote.id)
    .single()

  if (!milestone) notFound()

  // Load all milestones for progress tracker
  const { data: allMilestones } = await supabase
    .from('payment_milestones')
    .select('*')
    .eq('quote_id', quote.id)
    .order('sort_order')

  const org = (Array.isArray(quote.organizations) ? quote.organizations[0] : quote.organizations) as {
    name: string; email: string | null; phone: string | null;
    logo_url: string | null; brand_color_primary: string | null;
    brand_color_secondary: string | null; stripe_account_id: string | null;
  } | null

  const client = (Array.isArray(quote.clients) ? quote.clients[0] : quote.clients) as {
    name: string; email: string | null;
  } | null

  return (
    <MilestonePaymentClient
      quote={{ id: quote.id, quote_number: quote.quote_number, currency: quote.currency, total: quote.total }}
      org={org}
      client={client}
      milestone={milestone}
      allMilestones={allMilestones ?? []}
    />
  )
}
