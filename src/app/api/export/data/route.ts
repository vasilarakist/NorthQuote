import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

function toCSV(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  function cell(v: string | number | boolean | null | undefined): string {
    const s = v == null ? '' : String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  return [
    headers.map(cell).join(','),
    ...rows.map((row) => row.map(cell).join(',')),
  ].join('\r\n')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, organizations(name)')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const orgId = userRecord.organization_id

  // Fetch all data in parallel
  const [
    { data: clients },
    { data: quotes },
    { data: invoices },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at'),
    supabase
      .from('quotes')
      .select('*, clients(name), projects(project_name)')
      .eq('organization_id', orgId)
      .order('created_at'),
    supabase
      .from('invoices')
      .select('*, clients(name), projects(project_name)')
      .eq('organization_id', orgId)
      .order('created_at'),
  ])

  // Build CSVs
  const clientsCSV = toCSV(
    ['ID', 'Name', 'Email', 'Phone', 'Address', 'City', 'Province/State', 'Postal/ZIP', 'Notes', 'Created At'],
    (clients ?? []).map((c) => [
      c.id, c.name, c.email, c.phone, c.address, c.city,
      c.province_state, c.postal_zip, c.notes, c.created_at,
    ])
  )

  const quotesCSV = toCSV(
    ['ID', 'Quote Number', 'Client', 'Project', 'Status', 'Tier', 'Subtotal', 'Tax Amount', 'Total', 'Currency', 'Valid Until', 'AI Generated', 'Sent At', 'Accepted At', 'Declined At', 'Created At'],
    (quotes ?? []).map((q) => {
      const client = Array.isArray(q.clients) ? q.clients[0] : q.clients
      const project = Array.isArray(q.projects) ? q.projects[0] : q.projects
      return [
        q.id, q.quote_number, (client as { name: string } | null)?.name ?? '',
        (project as { project_name: string } | null)?.project_name ?? '',
        q.status, q.tier, q.subtotal, q.tax_amount, q.total, q.currency,
        q.valid_until, q.ai_generated, q.sent_at, q.accepted_at, q.declined_at, q.created_at,
      ]
    })
  )

  const invoicesCSV = toCSV(
    ['ID', 'Invoice Number', 'Client', 'Project', 'Status', 'Amount', 'Tax Amount', 'Total', 'Currency', 'Due Date', 'Invoice Date', 'Paid At', 'Payment Method', 'Created At'],
    (invoices ?? []).map((i) => {
      const client = Array.isArray(i.clients) ? i.clients[0] : i.clients
      const project = Array.isArray(i.projects) ? i.projects[0] : i.projects
      return [
        i.id, i.invoice_number, (client as { name: string } | null)?.name ?? '',
        (project as { project_name: string } | null)?.project_name ?? '',
        i.status, i.amount, i.tax_amount, i.total, i.currency,
        i.due_date, i.invoice_date, i.paid_at, i.payment_method, i.created_at,
      ]
    })
  )

  // Build ZIP
  const zip = new JSZip()
  const exportDate = new Date().toISOString().split('T')[0]
  zip.file(`clients-${exportDate}.csv`, clientsCSV)
  zip.file(`quotes-${exportDate}.csv`, quotesCSV)
  zip.file(`invoices-${exportDate}.csv`, invoicesCSV)

  const zipUint8 = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })

  const orgName = (Array.isArray(userRecord.organizations)
    ? userRecord.organizations[0]
    : userRecord.organizations) as { name: string } | null

  const filename = `NorthQuote-Export-${orgName?.name?.replace(/[^a-z0-9]/gi, '_') ?? 'data'}-${exportDate}.zip`

  return new NextResponse(zipUint8 as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
