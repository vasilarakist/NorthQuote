import { createClient } from '@/lib/supabase/server'
import { FileText, Users, FolderOpen, TrendingUp, Plus } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, full_name, organizations(name, subscription_plan)')
    .eq('auth_id', user.id)
    .single()

  if (!userRecord) return null

  const orgId = userRecord.organization_id

  // Fetch stats in parallel
  const [
    { count: quoteCount },
    { count: clientCount },
    { count: projectCount },
    { data: recentQuotes },
  ] = await Promise.all([
    supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase.from('projects').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
    supabase
      .from('quotes')
      .select('id, quote_number, status, total, currency, created_at, clients(name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const orgName = (userRecord.organizations as { name: string; subscription_plan: string } | { name: string; subscription_plan: string }[] | null) && !Array.isArray(userRecord.organizations)
    ? (userRecord.organizations as { name: string; subscription_plan: string }).name
    : Array.isArray(userRecord.organizations) && userRecord.organizations.length > 0
    ? userRecord.organizations[0].name
    : undefined
  const firstName = userRecord.full_name?.split(' ')[0] ?? 'there'

  const STATS = [
    { label: 'Total Quotes', value: quoteCount ?? 0, icon: FileText, color: 'text-navy-900', bg: 'bg-navy-50' },
    { label: 'Clients', value: clientCount ?? 0, icon: Users, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Active Projects', value: projectCount ?? 0, icon: FolderOpen, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'This Month', value: formatCurrency(0), icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
  ]

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-yellow-100 text-yellow-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    expired: 'bg-orange-100 text-orange-700',
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Good day, {firstName}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{orgName} — here&apos;s your overview</p>
        </div>
        <Link href="/quotes/new" className="btn-amber">
          <Plus size={16} />
          New Quote
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <div className="text-xl font-semibold text-navy-900">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Quotes */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-serif text-lg text-navy-900">Recent Quotes</h2>
          <Link href="/quotes" className="text-sm text-amber-500 hover:text-amber-600 font-medium transition-colors">
            View all
          </Link>
        </div>

        {recentQuotes && recentQuotes.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {recentQuotes.map((quote) => {
              const clientRaw = quote.clients
              const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as { name: string } | null | undefined
              return (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-navy-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-navy-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {quote.quote_number}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{client?.name ?? '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`badge ${STATUS_COLORS[quote.status] ?? 'bg-gray-100 text-gray-600'} capitalize`}>
                      {quote.status}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(quote.total, quote.currency)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No quotes yet</p>
            <Link href="/quotes/new" className="btn-primary mt-4 inline-flex">
              <Plus size={16} />
              Create your first quote
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
