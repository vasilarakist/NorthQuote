import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { ProposalClient } from './ProposalClient'
import { Resend } from 'resend'

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

  // Mark quote as "viewed" if still in "sent" status, and notify contractor on first open
  if (quote.status === 'sent') {
    await supabase
      .from('quotes')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', quote.id)

    // Send email notification to contractor on first open
    try {
      const org = (Array.isArray(quote.organizations) ? quote.organizations[0] : quote.organizations) as {
        id: string; name: string; email: string | null;
      } | null
      const client = (Array.isArray(quote.clients) ? quote.clients[0] : quote.clients) as {
        name: string;
      } | null

      // Get contractor email: org.email or look up users table
      let contractorEmail = org?.email ?? null
      if (!contractorEmail && org?.id) {
        const { data: orgUser } = await supabase
          .from('users')
          .select('email')
          .eq('organization_id', org.id)
          .limit(1)
          .single()
        contractorEmail = orgUser?.email ?? null
      }

      if (contractorEmail && process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: `NorthQuote <noreply@northquote.com>`,
          to: contractorEmail,
          subject: `${client?.name ?? 'Your client'} just opened your proposal`,
          html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12)">
        <tr><td style="background:#0F1C2E;padding:24px 32px">
          <div style="font-weight:700;font-size:18px;color:#fff">NorthQuote</div>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Good news! &#127881;</p>
          <p style="margin:0 0 20px;color:#6b7280;font-size:15px">
            <strong>${client?.name ?? 'Your client'}</strong> just opened your proposal <strong>${quote.quote_number}</strong>.
          </p>
          <p style="margin:0;color:#9ca3af;font-size:13px">They may be reviewing it right now — stay ready!</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        })
      }
    } catch (err) {
      // Non-critical — don't block the proposal page
      console.error('Contractor notification error:', err)
    }
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
