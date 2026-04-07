'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { InvoiceStatus } from '@/types/database'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Receipt, ChevronUp, ChevronDown } from 'lucide-react'

interface InvoiceRow {
  id: string
  invoice_number: string
  status: InvoiceStatus
  total: number
  currency: string
  due_date: string | null
  paid_at: string | null
  created_at: string
  clients: { name: string } | null | undefined
  projects: { project_name: string } | null | undefined
}

interface Props { initialInvoices: InvoiceRow[] }

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-700',
  paid:     'bg-green-100 text-green-700',
  overdue:  'bg-red-100 text-red-700',
}

const ALL_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue']
type SortField = 'created_at' | 'status' | 'total' | 'due_date'
type SortDir = 'asc' | 'desc'

export function InvoicesListClient({ initialInvoices }: Props) {
  const [invoices] = useState<InvoiceRow[]>(initialInvoices)
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: invoices.length }
    ALL_STATUSES.forEach((s) => { acc[s] = invoices.filter((i) => i.status === s).length })
    return acc
  }, [invoices])

  const sorted = useMemo(() => {
    let result = statusFilter === 'all' ? invoices : invoices.filter((i) => i.status === statusFilter)
    return [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'created_at') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      else if (sortField === 'total') cmp = a.total - b.total
      else if (sortField === 'status') cmp = a.status.localeCompare(b.status)
      else if (sortField === 'due_date') {
        const da = a.due_date ? new Date(a.due_date).getTime() : 0
        const db = b.due_date ? new Date(b.due_date).getTime() : 0
        cmp = da - db
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [invoices, statusFilter, sortField, sortDir])

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronDown size={12} className="text-gray-300" />
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-navy-900" /> : <ChevronDown size={12} className="text-navy-900" />
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-navy-900">Invoices</h1>
        <p className="text-gray-500 text-sm mt-0.5">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} total</p>
      </div>

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
              <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-xs',
                statusFilter === status ? 'bg-navy-900 text-white' : 'bg-gray-200 text-gray-600'
              )}>{counts[status]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {sorted.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice #</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Project</th>
                  <th onClick={() => handleSort('status')} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none">
                    <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                  </th>
                  <th onClick={() => handleSort('total')} className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none">
                    <span className="flex items-center justify-end gap-1">Total <SortIcon field="total" /></span>
                  </th>
                  <th onClick={() => handleSort('due_date')} className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none hidden sm:table-cell">
                    <span className="flex items-center justify-end gap-1">Due <SortIcon field="due_date" /></span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link href={`/invoices/${inv.id}`} className="font-medium text-navy-900 hover:text-amber-500 transition-colors">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 text-gray-600">{inv.clients?.name ?? '—'}</td>
                    <td className="px-6 py-3.5 text-gray-600 max-w-[160px] truncate hidden md:table-cell">{inv.projects?.project_name ?? '—'}</td>
                    <td className="px-6 py-3.5">
                      <span className={cn('badge capitalize', STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600')}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium text-gray-900">{formatCurrency(inv.total, inv.currency)}</td>
                    <td className="px-6 py-3.5 text-right text-gray-400 hidden sm:table-cell">
                      {inv.paid_at ? (
                        <span className="text-green-600">Paid {formatDate(inv.paid_at)}</span>
                      ) : inv.due_date ? (
                        formatDate(inv.due_date)
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center">
            <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-serif text-lg text-gray-700 mb-1">
              {statusFilter !== 'all' ? `No ${statusFilter} invoices` : 'No invoices yet'}
            </h3>
            <p className="text-gray-500 text-sm">Convert an accepted quote to generate your first invoice.</p>
          </div>
        )}
      </div>
    </div>
  )
}
