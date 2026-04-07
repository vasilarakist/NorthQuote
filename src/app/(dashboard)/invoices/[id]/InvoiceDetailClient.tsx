'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Invoice } from '@/types/database'
import { LineItemsEditor, type LineItemDraft } from '@/components/ui/LineItemsEditor'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import {
  ArrowLeft, User, FolderOpen, Calendar, Receipt,
  CheckCircle2, Loader2, FileText, Send,
} from 'lucide-react'
import Link from 'next/link'

type InvoiceWithJoins = Invoice & {
  clients: { name: string; email: string | null; phone: string | null } | null
  projects: { project_name: string; service_address: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  draft:   'bg-gray-100 text-gray-700',
  sent:    'bg-blue-100 text-blue-700',
  paid:    'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
}

function toLineItemDrafts(items: Invoice['line_items']): LineItemDraft[] {
  if (!items) return []
  return (items as unknown as LineItemDraft[]).map((item) => ({
    _id: (item as { id?: string }).id ?? crypto.randomUUID(),
    description: item.description ?? '',
    category: item.category ?? 'material',
    quantity: Number(item.quantity) ?? 1,
    unit: item.unit ?? 'each',
    unit_price: Number(item.unit_price) ?? 0,
    markup_percent: Number(item.markup_percent) ?? 0,
    total: Number(item.total) ?? 0,
  }))
}

export function InvoiceDetailClient({ invoice }: { invoice: InvoiceWithJoins }) {
  const router = useRouter()
  const lineItems = toLineItemDrafts(invoice.line_items)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function markSent() {
    setActionLoading('sent')
    const supabase = createClient()
    await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoice.id)
    setActionLoading(null)
    router.refresh()
  }

  async function markPaid() {
    setActionLoading('paid')
    const supabase = createClient()
    await supabase.from('invoices').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: 'cash',
    }).eq('id', invoice.id)
    setActionLoading(null)
    router.refresh()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/invoices')} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl text-navy-900">{invoice.invoice_number}</h1>
              <span className={cn('badge capitalize', STATUS_COLORS[invoice.status] ?? 'bg-gray-100 text-gray-600')}>
                {invoice.status}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              Issued {invoice.invoice_date ? formatDate(invoice.invoice_date) : formatDate(invoice.created_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {invoice.quote_id && (
            <Link href={`/quotes/${invoice.quote_id}`} className="btn-secondary text-xs">
              <FileText size={13} /> View Quote
            </Link>
          )}
          {invoice.status === 'draft' && (
            <button
              onClick={markSent}
              disabled={actionLoading === 'sent'}
              className="btn-primary"
            >
              {actionLoading === 'sent' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Mark as Sent
            </button>
          )}
          {(invoice.status === 'sent' || invoice.status === 'overdue') && (
            <button
              onClick={markPaid}
              disabled={actionLoading === 'paid'}
              className="btn-primary"
            >
              {actionLoading === 'paid' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Mark as Paid
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Meta cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card flex items-center gap-3">
          <div className="w-9 h-9 bg-navy-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <User className="w-4.5 h-4.5 text-navy-900" size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Client</div>
            <div className="font-medium text-gray-900 truncate">{invoice.clients?.name ?? '—'}</div>
            {invoice.clients?.email && <div className="text-xs text-gray-400 truncate">{invoice.clients.email}</div>}
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-4.5 h-4.5 text-amber-500" size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Project</div>
            <div className="font-medium text-gray-900 truncate">{invoice.projects?.project_name ?? '—'}</div>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Calendar className="w-4.5 h-4.5 text-green-600" size={18} />
          </div>
          <div>
            <div className="text-xs text-gray-500">Due date</div>
            <div className={cn('font-medium', invoice.status === 'overdue' ? 'text-red-600' : 'text-gray-900')}>
              {invoice.due_date ? formatDate(invoice.due_date) : '—'}
            </div>
            {invoice.paid_at && (
              <div className="text-xs text-green-600">Paid {formatDate(invoice.paid_at)}</div>
            )}
          </div>
        </div>
      </div>

      {/* Line items */}
      {lineItems.length > 0 && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">Line Items</h2>
          <LineItemsEditor items={lineItems} onChange={() => {}} readOnly currency={invoice.currency} />
        </div>
      )}

      {/* Notes */}
      {invoice.notes_to_client && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-2 text-sm">Notes</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes_to_client}</p>
        </div>
      )}

      {/* Totals */}
      <div className="card ml-auto max-w-sm space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>{formatCurrency(invoice.amount, invoice.currency)}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Tax</span>
          <span>{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold text-gray-900 pt-2 border-t border-gray-200">
          <span>Total ({invoice.currency})</span>
          <span>{formatCurrency(invoice.total, invoice.currency)}</span>
        </div>
        {invoice.payment_method && (
          <div className="text-xs text-gray-400 text-right capitalize">
            Paid via {invoice.payment_method}
          </div>
        )}
      </div>
    </div>
  )
}
