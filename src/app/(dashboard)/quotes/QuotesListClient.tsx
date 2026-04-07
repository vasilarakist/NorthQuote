'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { QuoteStatus } from '@/types/database'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { FileText, Plus, Copy, Trash2, Loader2, ChevronUp, ChevronDown, Sparkles } from 'lucide-react'

interface QuoteRow {
  id: string
  quote_number: string
  status: QuoteStatus
  total: number
  currency: string
  created_at: string
  sent_at: string | null
  clients: { name: string } | null | undefined
  projects: { project_name: string } | null | undefined
}

interface Props {
  initialQuotes: QuoteRow[]
  organizationId: string
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-700',
  viewed:   'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired:  'bg-orange-100 text-orange-700',
}

const ALL_STATUSES: QuoteStatus[] = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']

type SortField = 'created_at' | 'status' | 'total'
type SortDir = 'asc' | 'desc'

export function QuotesListClient({ initialQuotes, organizationId }: Props) {
  const router = useRouter()
  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes)
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: quotes.length }
    ALL_STATUSES.forEach((s) => { acc[s] = quotes.filter((q) => q.status === s).length })
    return acc
  }, [quotes])

  const sorted = useMemo(() => {
    let result = statusFilter === 'all' ? quotes : quotes.filter((q) => q.status === statusFilter)
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'created_at') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      else if (sortField === 'total') cmp = a.total - b.total
      else if (sortField === 'status') cmp = a.status.localeCompare(b.status)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [quotes, statusFilter, sortField, sortDir])

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronDown size={12} className="text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-navy-900" />
      : <ChevronDown size={12} className="text-navy-900" />
  }

  async function handleDuplicate(quote: QuoteRow) {
    setDuplicatingId(quote.id)
    const supabase = createClient()

    const { count } = await supabase
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)

    const now = new Date()
    const newNumber = `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String((count ?? 0) + 1).padStart(4, '0')}`

    // Get original quote data
    const { data: orig } = await supabase.from('quotes').select('*').eq('id', quote.id).single()
    const { data: origItems } = await supabase.from('quote_line_items').select('*').eq('quote_id', quote.id).order('position')

    if (!orig) { setDuplicatingId(null); return }

    const { data: newQ, error } = await supabase
      .from('quotes')
      .insert({
        organization_id: orig.organization_id,
        project_id: orig.project_id,
        client_id: orig.client_id,
        quote_number: newNumber,
        version: 1,
        status: 'draft',
        tier: orig.tier,
        subtotal: orig.subtotal,
        tax_amount: orig.tax_amount,
        tax_rate: orig.tax_rate,
        tax_type: orig.tax_type,
        total: orig.total,
        currency: orig.currency,
        valid_until: orig.valid_until,
        ai_generated: orig.ai_generated,
        ai_prompt: orig.ai_prompt,
        notes_to_client: orig.notes_to_client,
        internal_notes: orig.internal_notes,
      })
      .select()
      .single()

    if (!error && newQ && origItems) {
      await supabase.from('quote_line_items').insert(
        origItems.map((item: { description: string; category: string; quantity: number; unit: string | null; unit_price: number; markup_percent: number | null; total: number; from_price_book: boolean }, idx: number) => ({
          quote_id: newQ.id,
          position: idx,
          description: item.description,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          markup_percent: item.markup_percent,
          total: item.total,
          from_price_book: item.from_price_book,
        }))
      )
      router.push(`/quotes/${newQ.id}`)
    }
    setDuplicatingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this quote? This cannot be undone.')) return
    setDeletingId(id)
    const supabase = createClient()
    await supabase.from('quotes').delete().eq('id', id)
    setQuotes((prev) => prev.filter((q) => q.id !== id))
    setDeletingId(null)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Quotes</h1>
          <p className="text-gray-500 text-sm mt-0.5">{quotes.length} quote{quotes.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link href="/quotes/new" className="btn-amber">
          <Plus size={16} />
          New Quote
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 flex-wrap bg-gray-100 p-1 rounded-lg w-fit">
        {(['all', ...ALL_STATUSES] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
              statusFilter === status ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {status === 'all' ? 'All' : status}
            {(counts[status] ?? 0) > 0 && (
              <span className={cn(
                'ml-1.5 rounded-full px-1.5 py-0.5 text-xs',
                statusFilter === status ? 'bg-navy-900 text-white' : 'bg-gray-200 text-gray-600'
              )}>
                {counts[status]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {sorted.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Quote #</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Project</th>
                  <th
                    onClick={() => handleSort('status')}
                    className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                  >
                    <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                  </th>
                  <th
                    onClick={() => handleSort('total')}
                    className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                  >
                    <span className="flex items-center justify-end gap-1">Total <SortIcon field="total" /></span>
                  </th>
                  <th
                    onClick={() => handleSort('created_at')}
                    className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none hidden sm:table-cell"
                  >
                    <span className="flex items-center justify-end gap-1">Date <SortIcon field="created_at" /></span>
                  </th>
                  <th className="w-24 px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-3.5">
                      <Link
                        href={`/quotes/${quote.id}`}
                        className="font-medium text-navy-900 hover:text-amber-500 transition-colors flex items-center gap-1.5"
                      >
                        {quote.quote_number}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 text-gray-600">{quote.clients?.name ?? '—'}</td>
                    <td className="px-6 py-3.5 text-gray-600 max-w-[160px] truncate hidden md:table-cell">
                      {quote.projects?.project_name ?? '—'}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={cn('badge capitalize', STATUS_COLORS[quote.status] ?? 'bg-gray-100 text-gray-600')}>
                        {quote.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium text-gray-900">
                      {formatCurrency(quote.total, quote.currency)}
                    </td>
                    <td className="px-6 py-3.5 text-right text-gray-400 hidden sm:table-cell">
                      {formatDate(quote.created_at)}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="p-1.5 rounded text-gray-400 hover:text-navy-900 hover:bg-gray-100 transition-colors"
                          title="Edit"
                        >
                          <FileText size={13} />
                        </Link>
                        <button
                          onClick={() => handleDuplicate(quote)}
                          disabled={duplicatingId === quote.id}
                          className="p-1.5 rounded text-gray-400 hover:text-navy-900 hover:bg-gray-100 transition-colors disabled:opacity-50"
                          title="Duplicate"
                        >
                          {duplicatingId === quote.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Copy size={13} />
                          }
                        </button>
                        <button
                          onClick={() => handleDelete(quote.id)}
                          disabled={deletingId === quote.id}
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === quote.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-serif text-lg text-gray-700 mb-1">
              {statusFilter !== 'all' ? `No ${statusFilter} quotes` : 'No quotes yet'}
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              {statusFilter !== 'all' ? 'Try a different filter' : 'Create your first AI-powered quote in minutes'}
            </p>
            {statusFilter === 'all' && (
              <Link href="/quotes/new" className="btn-amber">
                <Plus size={16} />
                New Quote
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
