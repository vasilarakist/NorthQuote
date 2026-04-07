import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quote_id } = await request.json()
  if (!quote_id) return NextResponse.json({ error: 'quote_id required' }, { status: 400 })

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const orgId = userRecord.organization_id

  // Load quote
  const { data: quote } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quote_id)
    .eq('organization_id', orgId)
    .single()
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  // Check for existing invoice
  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('quote_id', quote_id)
    .limit(1)
    .single()
  if (existing) {
    return NextResponse.json({ invoice_id: existing.id, already_exists: true })
  }

  // Load line items
  const { data: lineItems } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quote_id)
    .order('position')

  // Generate invoice number
  const { count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  const now = new Date()
  const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String((count ?? 0) + 1).padStart(4, '0')}`

  // Default due date: 30 days from now
  const dueDate = new Date(now.getTime() + 30 * 86_400_000).toISOString().split('T')[0]

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      organization_id: orgId,
      quote_id: quote_id,
      project_id: quote.project_id,
      client_id: quote.client_id,
      invoice_number: invoiceNumber,
      status: 'draft',
      amount: quote.subtotal,
      tax_amount: quote.tax_amount,
      total: quote.total,
      currency: quote.currency,
      due_date: dueDate,
      invoice_date: now.toISOString().split('T')[0],
      line_items: lineItems ?? [],
      notes_to_client: quote.notes_to_client,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoice_id: invoice.id })
}
