import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { milestone_id } = await request.json()
  if (!milestone_id) return NextResponse.json({ error: 'milestone_id required' }, { status: 400 })

  const serviceClient = await createServiceClient()

  // Load milestone + quote + org + client
  const { data: milestone } = await serviceClient
    .from('payment_milestones')
    .select('*, quotes(id, organization_id, proposal_token, currency, quote_number, organizations(name, email, brand_color_primary), clients(name, email, phone))')
    .eq('id', milestone_id)
    .single()

  if (!milestone) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })

  const quote = milestone.quotes as {
    id: string; organization_id: string; proposal_token: string | null;
    currency: string; quote_number: string;
    organizations: { name: string; email: string | null; brand_color_primary: string | null } | null
    clients: { name: string; email: string | null; phone: string | null } | null
  } | null

  const org = quote?.organizations
    ? (Array.isArray(quote.organizations) ? (quote.organizations as { name: string; email: string | null; brand_color_primary: string | null }[])[0] : quote.organizations as { name: string; email: string | null; brand_color_primary: string | null })
    : null
  const client = quote?.clients
    ? (Array.isArray(quote.clients) ? (quote.clients as { name: string; email: string | null; phone: string | null }[])[0] : quote.clients as { name: string; email: string | null; phone: string | null })
    : null

  // Verify the milestone belongs to the authenticated contractor's org
  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single()

  if (!userRecord || userRecord.organization_id !== quote?.organization_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (milestone.status === 'paid') {
    return NextResponse.json({ error: 'Milestone already paid' }, { status: 400 })
  }

  // Mark as requested
  await serviceClient
    .from('payment_milestones')
    .update({ status: 'requested' })
    .eq('id', milestone_id)

  const amountCents = milestone.amount_cents ?? 0
  const amount = amountCents / 100
  const currency = quote?.currency ?? 'CAD'
  const amountFormatted = new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
  const brandColor = org?.brand_color_primary ?? '#0F1C2E'
  const paymentUrl = `${APP_URL}/proposal/${quote?.proposal_token}/milestone/${milestone_id}`

  // Send email to client
  if (client?.email && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: `${org?.name ?? 'NorthQuote'} <noreply@northquote.com>`,
        to: client.email,
        subject: `Payment request: ${milestone.label} — ${amountFormatted}`,
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12)">
        <tr><td style="background:${brandColor};padding:28px 32px">
          <div style="font-weight:600;font-size:18px;color:#fff">${org?.name ?? 'Your Contractor'}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.7)">Payment Request · ${quote?.quote_number ?? ''}</div>
        </td></tr>
        <tr><td style="background:#fff;padding:32px">
          <h1 style="margin:0 0 8px;font-size:22px;color:#111827">Hi ${client.name?.split(' ')[0] ?? 'there'},</h1>
          <p style="margin:0 0 20px;color:#6b7280;font-size:15px">
            A payment of <strong>${amountFormatted}</strong> is now due for <strong>${milestone.label}</strong>.
          </p>
          <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;text-align:center">
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:6px">${milestone.label}</div>
            <div style="font-size:32px;font-weight:700;color:#111827">${amountFormatted}</div>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center">
              <a href="${paymentUrl}" style="display:inline-block;background:${brandColor};color:#fff;font-weight:600;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:8px">
                Pay ${amountFormatted} &rarr;
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center">
            Or copy this link: <a href="${paymentUrl}" style="color:${brandColor}">${paymentUrl}</a>
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
            ${org?.email ? `<a href="mailto:${org.email}" style="color:#9ca3af">${org.email}</a>` : ''}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      })
    } catch (err) {
      console.error('Milestone payment request email error:', err)
    }
  }

  return NextResponse.json({ success: true, payment_url: paymentUrl })
}
