import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { ProposalClient } from './ProposalClient'

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServiceClient()

  // Load quote via proposal token — uses service role to bypass RLS auth
  const { data: quote } = await supabase
    .from('quotes')
    .select(`
      *,
      organizations(
        id, name, email, phone, logo_url,
        brand_color_primary, brand_color_secondary,
        stripe_account_id, gst_hst_number, province_state
      ),
      clients(id, name, email, phone),
      projects(id, project_name, service_address),
      quote_line_items(*)
    `)
    .eq('proposal_token', token)
    .single()

  if (!quote) notFound()

  // Check for sibling tier quotes (Good/Better/Best)
  let tierQuotes: { id: string; tier: string; total: number; proposal_token: string | null }[] = []
  if (quote.tier !== 'single') {
    const { data: siblings } = await supabase
      .from('quotes')
      .select('id, tier, total, proposal_token')
      .eq('project_id', quote.project_id)
      .in('tier', ['good', 'better', 'best'])
      .in('status', ['sent', 'viewed', 'accepted'])
      .order('tier')
    tierQuotes = siblings ?? []
  }

  // Record "opened" event
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() ?? null
  const ua = headersList.get('user-agent') ?? null

  await supabase.from('quote_events').insert({
    quote_id: quote.id,
    event_type: 'opened',
    ip_address: ip,
    user_agent: ua,
  })

  // Mark quote as "viewed" if still in "sent" status
  if (quote.status === 'sent') {
    await supabase
      .from('quotes')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', quote.id)
  }

  // Normalize Supabase join shapes
  const org = (Array.isArray(quote.organizations) ? quote.organizations[0] : quote.organizations) as {
    id: string; name: string; email: string | null; phone: string | null;
    logo_url: string | null; brand_color_primary: string | null;
    brand_color_secondary: string | null; stripe_account_id: string | null;
    gst_hst_number: string | null; province_state: string | null;
  } | null

  const client = (Array.isArray(quote.clients) ? quote.clients[0] : quote.clients) as {
    id: string; name: string; email: string | null; phone: string | null;
  } | null

  const project = (Array.isArray(quote.projects) ? quote.projects[0] : quote.projects) as {
    id: string; project_name: string; service_address: string;
  } | null

  const lineItems = Array.isArray(quote.quote_line_items) ? quote.quote_line_items : []

  return (
    <ProposalClient
      quote={quote}
      org={org}
      client={client}
      project={project}
      lineItems={lineItems}
      tierQuotes={tierQuotes}
      clientIp={ip}
    />
  )
}
