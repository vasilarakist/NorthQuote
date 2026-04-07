import { createClient } from '@/lib/supabase/server'
import { FileText, Plus } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700',
}

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return null

  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, quote_number, status, total, currency, created_at, clients(name), projects(project_name)')
    .eq('organization_id', userRecord.organization_id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Quotes</h1>
          <p className="text-gray-500 text-sm mt-0.5">{quotes?.length ?? 0} quotes total</p>
        </div>
        <Link href="/quotes/new" className="btn-amber">
          <Plus size={16} />
          New Quote
        </Link>
      </div>

      <div className="card p-0 overflow-hidden">
        {quotes && quotes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Quote #</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotes.map((quote) => {
                  const clientRaw = quote.clients
                  const projectRaw = quote.projects
                  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as { name: string } | null | undefined
                  const project = (Array.isArray(projectRaw) ? projectRaw[0] : projectRaw) as { project_name: string } | null | undefined
                  return (
                    <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <Link href={`/quotes/${quote.id}`} className="font-medium text-navy-900 hover:text-amber-500 transition-colors">
                          {quote.quote_number}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{client?.name ?? '—'}</td>
                      <td className="px-6 py-4 text-gray-600 max-w-[180px] truncate">{project?.project_name ?? '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`badge capitalize ${STATUS_COLORS[quote.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {quote.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">
                        {formatCurrency(quote.total, quote.currency)}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-500">
                        {formatDate(quote.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-serif text-lg text-gray-700 mb-1">No quotes yet</h3>
            <p className="text-gray-500 text-sm mb-4">Create your first AI-powered quote in minutes</p>
            <Link href="/quotes/new" className="btn-amber">
              <Plus size={16} />
              New Quote
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
