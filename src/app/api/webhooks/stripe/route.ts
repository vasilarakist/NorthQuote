import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

// Health-check — lets you verify the route is reachable without a Stripe signature.
// Visit /api/webhooks/stripe in a browser to confirm a 200 before testing with Stripe.
export function GET() {
  return NextResponse.json({ ok: true, message: 'Stripe webhook active' })
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

async function sendContractorPaymentNotification({
  contractorEmail,
  contractorName,
  clientName,
  amountFormatted,
  quoteNumber,
  quoteId,
  label,
  paidCount,
  totalCount,
}: {
  contractorEmail: string
  contractorName: string
  clientName: string
  amountFormatted: string
  quoteNumber: string
  quoteId: string
  label: string
  paidCount: number
  totalCount: number
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[webhook] RESEND_API_KEY not set — skipping contractor notification')
    return
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  const quoteUrl = `${APP_URL}/quotes/${quoteId}`
  const scheduleNote = totalCount > 1 ? ` ${paidCount} of ${totalCount} milestone${totalCount !== 1 ? 's' : ''} paid.` : ''
  try {
    await resend.emails.send({
      from: 'NorthQuote <noreply@northquote.com>',
      to: contractorEmail,
      subject: `Payment received — ${clientName} paid ${amountFormatted}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12)">
        <tr><td style="background:#16a34a;padding:24px 32px">
          <div style="font-weight:700;font-size:18px;color:#fff">&#x1F4B0; Payment Received</div>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 16px;font-size:15px;color:#374151">
            <strong>${clientName}</strong> just paid the <strong>${label}</strong> on quote <strong>${quoteNumber}</strong>.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#15803d">${amountFormatted}</div>
            ${scheduleNote ? `<div style="font-size:13px;color:#166534;margin-top:4px">${scheduleNote}</div>` : ''}
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${quoteUrl}" style="display:inline-block;background:#0F1C2E;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px">
                View Quote &rarr;
              </a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(`[webhook] Contractor notification sent to ${contractorEmail}`)
  } catch (err) {
    console.error('[webhook] Contractor payment notification error:', err)
  }
}

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  console.log('[webhook] Received Stripe webhook, sig present:', !!sig)

  if (!sig) {
    console.error('[webhook] Missing Stripe-Signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // Determine which webhook secret to use.
  // Events from a connected account (direct charges) carry an `account` field
  // and must be verified with STRIPE_CONNECT_WEBHOOK_SECRET if configured.
  // Platform events (destination charges) use STRIPE_WEBHOOK_SECRET.
  // We try the platform secret first; if that fails and a connect secret exists, try that.
  let event: Stripe.Event | null = null

  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET

  if (!platformSecret && !connectSecret) {
    console.error('[webhook] No webhook secret env vars set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 })
  }

  if (platformSecret) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, platformSecret)
      console.log('[webhook] Verified with STRIPE_WEBHOOK_SECRET, event:', event.type, 'id:', event.id)
    } catch (err) {
      console.warn('[webhook] Platform secret verification failed:', (err as Error).message)
    }
  }

  if (!event && connectSecret) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, connectSecret)
      console.log('[webhook] Verified with STRIPE_CONNECT_WEBHOOK_SECRET, event:', event.type, 'id:', event.id)
    } catch (err) {
      console.warn('[webhook] Connect secret verification failed:', (err as Error).message)
    }
  }

  if (!event) {
    console.error('[webhook] Signature verification failed with all available secrets')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Always return 200 to Stripe after signature verification succeeds.
  // We process asynchronously so Stripe never retries due to internal errors.
  processEvent(event).catch((err) => {
    console.error('[webhook] Unhandled error in processEvent:', err)
  })

  return NextResponse.json({ received: true })
}

async function processEvent(event: Stripe.Event) {
  const supabase = await createServiceClient()
  console.log('[webhook] Processing event:', event.type, 'account:', (event as { account?: string }).account ?? 'platform')

  switch (event.type) {
    // ── Payment succeeded ─────────────────────────────────────────
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      const milestoneId = pi.metadata?.milestone_id
      const quoteId = pi.metadata?.quote_id

      console.log('[webhook] payment_intent.succeeded — pi.id:', pi.id, 'milestoneId:', milestoneId, 'quoteId:', quoteId)

      if (milestoneId) {
        // ── Milestone payment ──
        console.log('[webhook] Updating milestone', milestoneId, 'to paid')
        const { error: updateErr } = await supabase
          .from('payment_milestones')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: pi.id,
          })
          .eq('id', milestoneId)

        if (updateErr) {
          console.error('[webhook] Failed to update milestone status:', updateErr)
        } else {
          console.log('[webhook] Milestone', milestoneId, 'marked paid')
        }

        // Fetch milestone details for the notification
        const { data: ms, error: msErr } = await supabase
          .from('payment_milestones')
          .select('label, amount_cents, quote_id')
          .eq('id', milestoneId)
          .single()

        if (msErr || !ms) {
          console.error('[webhook] Failed to fetch milestone:', msErr)
          break
        }

        console.log('[webhook] Milestone fetched:', ms.label, ms.amount_cents, 'quote_id:', ms.quote_id)

        const { data: allMs } = await supabase
          .from('payment_milestones')
          .select('status')
          .eq('quote_id', ms.quote_id)

        const paidCount = (allMs ?? []).filter((m) => m.status === 'paid').length
        const totalCount = (allMs ?? []).length
        console.log('[webhook] Milestone progress:', paidCount, '/', totalCount)

        const { data: qInfo, error: qErr } = await supabase
          .from('quotes')
          .select('id, quote_number, currency, organization_id, organizations(name, email), clients(name)')
          .eq('id', ms.quote_id)
          .single()

        if (qErr || !qInfo) {
          console.error('[webhook] Failed to fetch quote for milestone notification:', qErr)
          break
        }

        const org = (Array.isArray(qInfo.organizations) ? qInfo.organizations[0] : qInfo.organizations) as { name: string; email: string | null } | null
        const client = (Array.isArray(qInfo.clients) ? qInfo.clients[0] : qInfo.clients) as { name: string } | null
        let contractorEmail = org?.email ?? null

        if (!contractorEmail) {
          const { data: u } = await supabase
            .from('users')
            .select('email')
            .eq('organization_id', qInfo.organization_id)
            .limit(1)
            .single()
          contractorEmail = u?.email ?? null
          console.log('[webhook] Resolved contractor email from users table:', contractorEmail)
        }

        if (!contractorEmail) {
          console.warn('[webhook] No contractor email found for org', qInfo.organization_id)
          break
        }

        const amount = (ms.amount_cents ?? 0) / 100
        const amountFormatted = new Intl.NumberFormat('en-CA', { style: 'currency', currency: qInfo.currency ?? 'CAD' }).format(amount)

        await sendContractorPaymentNotification({
          contractorEmail,
          contractorName: org?.name ?? 'Contractor',
          clientName: client?.name ?? 'Your client',
          amountFormatted,
          quoteNumber: qInfo.quote_number,
          quoteId: qInfo.id,
          label: ms.label,
          paidCount,
          totalCount,
        })
      } else if (quoteId) {
        // ── Full single payment ──
        console.log('[webhook] Full payment for quote', quoteId)

        const { data: invoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (invoice) {
          const { error: invErr } = await supabase
            .from('invoices')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: pi.id,
              payment_method: pi.payment_method_types?.[0] ?? 'card',
            })
            .eq('id', invoice.id)

          if (invErr) {
            console.error('[webhook] Failed to update invoice status:', invErr)
          } else {
            console.log('[webhook] Invoice', invoice.id, 'marked paid')
          }
        } else {
          console.warn('[webhook] No invoice found for quote', quoteId, '— skipping invoice update')
        }

        const { data: qInfo, error: qErr } = await supabase
          .from('quotes')
          .select('id, quote_number, total, currency, organization_id, organizations(name, email), clients(name)')
          .eq('id', quoteId)
          .single()

        if (qErr || !qInfo) {
          console.error('[webhook] Failed to fetch quote for full payment notification:', qErr)
          break
        }

        const org = (Array.isArray(qInfo.organizations) ? qInfo.organizations[0] : qInfo.organizations) as { name: string; email: string | null } | null
        const client = (Array.isArray(qInfo.clients) ? qInfo.clients[0] : qInfo.clients) as { name: string } | null
        let contractorEmail = org?.email ?? null

        if (!contractorEmail) {
          const { data: u } = await supabase
            .from('users')
            .select('email')
            .eq('organization_id', qInfo.organization_id)
            .limit(1)
            .single()
          contractorEmail = u?.email ?? null
          console.log('[webhook] Resolved contractor email from users table:', contractorEmail)
        }

        if (!contractorEmail) {
          console.warn('[webhook] No contractor email found for org', qInfo.organization_id)
          break
        }

        const amountFormatted = new Intl.NumberFormat('en-CA', { style: 'currency', currency: qInfo.currency ?? 'CAD' }).format(qInfo.total ?? 0)

        await sendContractorPaymentNotification({
          contractorEmail,
          contractorName: org?.name ?? 'Contractor',
          clientName: client?.name ?? 'Your client',
          amountFormatted,
          quoteNumber: qInfo.quote_number,
          quoteId: qInfo.id,
          label: 'Full Payment',
          paidCount: 1,
          totalCount: 1,
        })
      } else {
        console.warn('[webhook] payment_intent.succeeded has no milestone_id or quote_id in metadata — ignoring')
      }
      break
    }

    // ── Payment failed ────────────────────────────────────────────
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent
      const quoteId = pi.metadata?.quote_id
      console.log('[webhook] payment_intent.payment_failed — quoteId:', quoteId)

      if (quoteId) {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (invoice) {
          await supabase
            .from('invoices')
            .update({ stripe_payment_intent_id: pi.id })
            .eq('id', invoice.id)
        }
      }
      break
    }

    // ── Stripe Connect account updated ────────────────────────────
    case 'account.updated': {
      const account = event.data.object as Stripe.Account
      console.log('[webhook] account.updated — stripe_account_id:', account.id, 'charges_enabled:', account.charges_enabled)

      if (account.details_submitted) {
        const { error } = await supabase
          .from('organizations')
          .update({
            subscription_status: account.charges_enabled ? 'active' : 'incomplete',
          })
          .eq('stripe_account_id', account.id)

        if (error) console.error('[webhook] Failed to update org subscription_status:', error)
        else console.log('[webhook] Updated org subscription_status for account', account.id)
      }
      break
    }

    default:
      console.log('[webhook] Unhandled event type:', event.type, '— ignoring')
      break
  }
}
