import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import twilio from 'twilio'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function buildEmailHtml({
  orgName, orgEmail, orgPhone, logoUrl, brandColor,
  clientName, quoteNumber, scopeSummary, proposalUrl,
}: {
  orgName: string; orgEmail: string | null; orgPhone: string | null;
  logoUrl: string | null; brandColor: string;
  clientName: string; quoteNumber: string; scopeSummary: string | null;
  proposalUrl: string;
}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12)">
        <!-- Header -->
        <tr><td style="background:${brandColor};padding:28px 32px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>${logoUrl ? `<img src="${logoUrl}" width="40" height="40" style="border-radius:8px;object-fit:cover">` : `<div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,.2);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#fff">${orgName.charAt(0)}</div>`}</td>
              <td style="padding-left:12px;vertical-align:middle">
                <div style="font-weight:600;font-size:18px;color:#fff">${orgName}</div>
                <div style="font-size:12px;color:rgba(255,255,255,.7)">Professional Proposal</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#fff;padding:32px">
          <h1 style="margin:0 0 8px;font-size:22px;color:#111827">Hi ${clientName},</h1>
          <p style="margin:0 0 20px;color:#6b7280;font-size:15px">Your proposal <strong>${quoteNumber}</strong> from ${orgName} is ready for your review.</p>
          ${scopeSummary ? `<div style="background:#f9fafb;border-left:3px solid ${brandColor};border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">${scopeSummary}</p>
          </div>` : ''}
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center">
              <a href="${proposalUrl}" style="display:inline-block;background:${brandColor};color:#fff;font-weight:600;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:8px">
                View &amp; Accept Proposal &rarr;
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center">Or copy this link: <a href="${proposalUrl}" style="color:${brandColor}">${proposalUrl}</a></p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
            ${orgEmail ? `<a href="mailto:${orgEmail}" style="color:#9ca3af">${orgEmail}</a>` : ''}
            ${orgEmail && orgPhone ? ' &nbsp;·&nbsp; ' : ''}
            ${orgPhone ? `<a href="tel:${orgPhone}" style="color:#9ca3af">${orgPhone}</a>` : ''}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quote_id, send_email, send_sms, client_phone_override } = await request.json()

  const serviceClient = await createServiceClient()

  // Load quote + org + client
  const { data: quote } = await serviceClient
    .from('quotes')
    .select('*, organizations(name, email, phone, logo_url, brand_color_primary), clients(name, email, phone)')
    .eq('id', quote_id)
    .single()

  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const org = (Array.isArray(quote.organizations) ? quote.organizations[0] : quote.organizations) as {
    name: string; email: string | null; phone: string | null;
    logo_url: string | null; brand_color_primary: string | null;
  } | null

  const client = (Array.isArray(quote.clients) ? quote.clients[0] : quote.clients) as {
    name: string; email: string | null; phone: string | null;
  } | null

  // Ensure proposal_token exists
  let token = quote.proposal_token
  if (!token) {
    const { data: updated } = await serviceClient
      .from('quotes')
      .update({ proposal_token: crypto.randomUUID() })
      .eq('id', quote_id)
      .select('proposal_token')
      .single()
    token = updated?.proposal_token
  }

  const proposalUrl = `${APP_URL}/proposal/${token}`

  // Update quote status
  await serviceClient
    .from('quotes')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', quote_id)

  const errors: string[] = []

  // Send email
  if (send_email && client?.email) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: `${org?.name ?? 'NorthQuote'} <proposals@northquote.app>`,
        to: client.email,
        subject: `Your proposal from ${org?.name ?? 'your contractor'} is ready`,
        html: buildEmailHtml({
          orgName: org?.name ?? 'Your Contractor',
          orgEmail: org?.email ?? null,
          orgPhone: org?.phone ?? null,
          logoUrl: org?.logo_url ?? null,
          brandColor: org?.brand_color_primary ?? '#0F1C2E',
          clientName: client.name,
          quoteNumber: quote.quote_number,
          scopeSummary: quote.notes_to_client,
          proposalUrl,
        }),
      })
    } catch (err) {
      console.error('Email send error:', err)
      errors.push('Email delivery failed.')
    }
  }

  // Send SMS
  const smsPhone = client_phone_override || client?.phone
  if (send_sms && smsPhone) {
    try {
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      await twilioClient.messages.create({
        body: `Hi ${client?.name?.split(' ')[0] ?? 'there'}, ${org?.name ?? 'your contractor'} sent you a proposal. View and accept it here: ${proposalUrl}`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: smsPhone,
      })
    } catch (err) {
      console.error('SMS send error:', err)
      errors.push('SMS delivery failed.')
    }
  }

  // Log event
  await serviceClient.from('quote_events').insert({
    quote_id,
    event_type: 'sent',
  })

  return NextResponse.json({
    proposal_url: proposalUrl,
    errors: errors.length ? errors : undefined,
  })
}
