import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

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
  if (!process.env.RESEND_API_KEY) return
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
  } catch (err) {
    console.error('Contractor payment notification error:', err)
  }
}

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  switch (event.type) {
    // ── Payment succeeded ─────────────────────────────────────────
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      const milestoneId = pi.metadata?.milestone_id
      const quoteId = pi.metadata?.quote_id

      if (milestoneId) {
        // Milestone payment — mark milestone as paid
        await supabase.from('payment_milestones').update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: pi.id,
        }).eq('id', milestoneId)

        // Notify contractor
        const { data: ms } = await supabase
          .from('payment_milestones')
          .select('label, amount_cents, quote_id')
          .eq('id', milestoneId)
          .single()
        if (ms) {
          const { data: allMs } = await supabase
            .from('payment_milestones')
            .select('status')
            .eq('quote_id', ms.quote_id)
          const paidCount = (allMs ?? []).filter((m) => m.status === 'paid').length
          const totalCount = (allMs ?? []).length

          const { data: qInfo } = await supabase
            .from('quotes')
            .select('id, quote_number, currency, organization_id, organizations(name, email), clients(name)')
            .eq('id', ms.quote_id)
            .single()
          if (qInfo) {
            const org = (Array.isArray(qInfo.organizations) ? qInfo.organizations[0] : qInfo.organizations) as { name: string; email: string | null } | null
            const client = (Array.isArray(qInfo.clients) ? qInfo.clients[0] : qInfo.clients) as { name: string } | null
            let contractorEmail = org?.email ?? null
            if (!contractorEmail) {
              const { data: u } = await supabase.from('users').select('email').eq('organization_id', qInfo.organization_id).limit(1).single()
              contractorEmail = u?.email ?? null
            }
            if (contractorEmail) {
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
            }
          }
        }
      } else if (quoteId) {
        // Full payment — find invoice linked to this quote
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (invoice) {
          await supabase.from('invoices').update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: pi.id,
            payment_method: pi.payment_method_types?.[0] ?? 'card',
          }).eq('id', invoice.id)
        }

        // Notify contractor for full payment
        const { data: qInfo } = await supabase
          .from('quotes')
          .select('id, quote_number, total, currency, organization_id, organizations(name, email), clients(name)')
          .eq('id', quoteId)
          .single()
        if (qInfo) {
          const org = (Array.isArray(qInfo.organizations) ? qInfo.organizations[0] : qInfo.organizations) as { name: string; email: string | null } | null
          const client = (Array.isArray(qInfo.clients) ? qInfo.clients[0] : qInfo.clients) as { name: string } | null
          let contractorEmail = org?.email ?? null
          if (!contractorEmail) {
            const { data: u } = await supabase.from('users').select('email').eq('organization_id', qInfo.organization_id).limit(1).single()
            contractorEmail = u?.email ?? null
          }
          if (contractorEmail) {
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
          }
        }
      }
      break
    }

    // ── Payment failed ────────────────────────────────────────────
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent
      const quoteId = pi.metadata?.quote_id

      if (quoteId) {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (invoice) {
          await supabase.from('invoices').update({
            stripe_payment_intent_id: pi.id,
          }).eq('id', invoice.id)
        }
      }
      break
    }

    // ── Stripe Connect account updated ────────────────────────────
    case 'account.updated': {
      const account = event.data.object as Stripe.Account
      const chargesEnabled = account.charges_enabled
      const detailsSubmitted = account.details_submitted

      if (detailsSubmitted) {
        await supabase
          .from('organizations')
          .update({
            subscription_status: chargesEnabled ? 'active' : 'incomplete',
          })
          .eq('stripe_account_id', account.id)
      }
      break
    }

    default:
      // Unhandled event type — ignore
      break
  }

  return NextResponse.json({ received: true })
}
