import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// QuickBooks Online IIF/CSV format for invoice import
// Columns: InvoiceNo, Customer, InvoiceDate, DueDate, Item, Qty, Rate, Amount, TaxAmount, Total
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, organizations(name, gst_hst_number)')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const orgId = userRecord.organization_id

  // Only export paid (finalized) invoices
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      *,
      clients(name, email, address, city, province_state, postal_zip),
      projects(project_name)
    `)
    .eq('organization_id', orgId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invoices || invoices.length === 0) {
    return NextResponse.json({ error: 'No paid invoices to export.' }, { status: 404 })
  }

  // Build CSV rows (QuickBooks Online import format)
  const headers = [
    'Invoice No',
    'Customer',
    'Invoice Date',
    'Due Date',
    'Item Description',
    'Qty',
    'Rate',
    'Amount',
    'Tax Amount',
    'Total',
    'Currency',
    'Payment Date',
    'Payment Method',
  ]

  const rows: string[][] = []

  for (const inv of invoices) {
    const clientRaw = inv.clients
    const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as { name: string; email: string | null } | null
    const projectRaw = inv.projects
    const project = (Array.isArray(projectRaw) ? projectRaw[0] : projectRaw) as { project_name: string } | null

    const lineItems = Array.isArray(inv.line_items) ? inv.line_items : []
    const invoiceDate = inv.invoice_date ? inv.invoice_date.split('T')[0] : inv.created_at.split('T')[0]
    const dueDate = inv.due_date ?? ''
    const paidDate = inv.paid_at ? inv.paid_at.split('T')[0] : ''

    if (lineItems.length > 0) {
      lineItems.forEach((item: { description: string; quantity: number; unit_price: number; total: number }) => {
        rows.push([
          inv.invoice_number,
          client?.name ?? '',
          invoiceDate,
          dueDate,
          item.description ?? project?.project_name ?? '',
          String(item.quantity ?? 1),
          String(item.unit_price ?? 0),
          String(item.total ?? 0),
          '',
          '',
          inv.currency,
          paidDate,
          inv.payment_method ?? '',
        ])
      })
      // Tax row
      if (inv.tax_amount > 0) {
        rows.push([
          inv.invoice_number,
          client?.name ?? '',
          invoiceDate,
          dueDate,
          'Tax',
          '1',
          String(inv.tax_amount),
          String(inv.tax_amount),
          String(inv.tax_amount),
          String(inv.total),
          inv.currency,
          paidDate,
          inv.payment_method ?? '',
        ])
      }
    } else {
      // No line items — single summary row
      rows.push([
        inv.invoice_number,
        client?.name ?? '',
        invoiceDate,
        dueDate,
        project?.project_name ?? 'Services',
        '1',
        String(inv.amount),
        String(inv.amount),
        String(inv.tax_amount),
        String(inv.total),
        inv.currency,
        paidDate,
        inv.payment_method ?? '',
      ])
    }
  }

  // Serialize to CSV
  function escapeCell(val: string): string {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  const csv = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\r\n')

  const orgName = (Array.isArray(userRecord.organizations)
    ? userRecord.organizations[0]
    : userRecord.organizations) as { name: string } | null

  const filename = `NorthQuote-QuickBooks-${orgName?.name?.replace(/[^a-z0-9]/gi, '_') ?? 'export'}-${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
