import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Protect with CRON_SECRET — set this in Vercel env and call via Vercel Cron
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const created: string[] = []

  // ── Load all organizations with their follow-up settings ──────
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, follow_up_settings')

  for (const org of orgs ?? []) {
    const settings = (org.follow_up_settings ?? {}) as {
      quote_not_opened_hours?: number
      quote_not_accepted_hours?: number
      invoice_overdue_days?: number
      sms_enabled?: boolean
      email_enabled?: boolean
    }

    const notOpenedHours     = settings.quote_not_opened_hours   ?? 24
    const notAcceptedHours   = settings.quote_not_accepted_hours ?? 72
    const invoiceOverdueDays = settings.invoice_overdue_days     ?? 3
    const smsEnabled         = settings.sms_enabled              ?? true
    const emailEnabled       = settings.email_enabled            ?? true

    // ── 1. Quote sent but not opened in N hours → SMS follow-up ──
    if (smsEnabled) {
      const cutoff = new Date(now.getTime() - notOpenedHours * 3_600_000).toISOString()
      const { data: notOpened } = await supabase
        .from('quotes')
        .select('id')
        .eq('organization_id', org.id)
        .eq('status', 'sent')
        .lt('sent_at', cutoff)
        .is('viewed_at', null)

      for (const quote of notOpened ?? []) {
        // Avoid duplicate follow-ups
        const { count } = await supabase
          .from('follow_ups')
          .select('*', { count: 'exact', head: true })
          .eq('quote_id', quote.id)
          .eq('type', 'quote_not_opened')
        if ((count ?? 0) > 0) continue

        await supabase.from('follow_ups').insert({
          organization_id: org.id,
          quote_id: quote.id,
          type: 'quote_not_opened',
          channel: 'sms',
          scheduled_at: now.toISOString(),
          status: 'pending',
        })
        created.push(`sms:not_opened:${quote.id}`)
      }
    }

    // ── 2. Quote viewed but not accepted in N hours → email follow-up ──
    if (emailEnabled) {
      const cutoff = new Date(now.getTime() - notAcceptedHours * 3_600_000).toISOString()
      const { data: notAccepted } = await supabase
        .from('quotes')
        .select('id')
        .eq('organization_id', org.id)
        .eq('status', 'viewed')
        .lt('viewed_at', cutoff)

      for (const quote of notAccepted ?? []) {
        const { count } = await supabase
          .from('follow_ups')
          .select('*', { count: 'exact', head: true })
          .eq('quote_id', quote.id)
          .eq('type', 'quote_not_accepted')
        if ((count ?? 0) > 0) continue

        await supabase.from('follow_ups').insert({
          organization_id: org.id,
          quote_id: quote.id,
          type: 'quote_not_accepted',
          channel: 'email',
          scheduled_at: now.toISOString(),
          status: 'pending',
        })
        created.push(`email:not_accepted:${quote.id}`)
      }
    }

    // ── 3. Invoice unpaid N days past due → payment reminder ──────
    if (emailEnabled) {
      const cutoff = new Date(now.getTime() - invoiceOverdueDays * 86_400_000)
      const cutoffDate = cutoff.toISOString().split('T')[0]
      const { data: overdueInvoices } = await supabase
        .from('invoices')
        .select('id')
        .eq('organization_id', org.id)
        .in('status', ['sent', 'overdue'])
        .lt('due_date', cutoffDate)

      for (const invoice of overdueInvoices ?? []) {
        // Mark as overdue
        await supabase.from('invoices').update({ status: 'overdue' }).eq('id', invoice.id)

        const { count } = await supabase
          .from('follow_ups')
          .select('*', { count: 'exact', head: true })
          .eq('invoice_id', invoice.id)
          .eq('type', 'invoice_overdue')
        if ((count ?? 0) > 0) continue

        await supabase.from('follow_ups').insert({
          organization_id: org.id,
          invoice_id: invoice.id,
          type: 'invoice_overdue',
          channel: 'email',
          scheduled_at: now.toISOString(),
          status: 'pending',
        })
        created.push(`email:invoice_overdue:${invoice.id}`)
      }
    }
  }

  return NextResponse.json({ created, count: created.length })
}
