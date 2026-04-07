'use client'

import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, CheckCircle2, XCircle, Clock, DollarSign, FileText } from 'lucide-react'

interface QuoteRow {
  id: string
  status: string
  total: number
  currency: string
  created_at: string
  sent_at: string | null
  accepted_at: string | null
  declined_at: string | null
  ai_generated: boolean
  tier: string
}

interface InvoiceRow {
  total: number
  paid_at: string | null
  created_at: string
}

interface Props {
  quotes: QuoteRow[]
  paidInvoices: InvoiceRow[]
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  sent: '#3b82f6',
  viewed: '#f59e0b',
  accepted: '#22c55e',
  declined: '#ef4444',
  expired: '#f97316',
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function AnalyticsClient({ quotes, paidInvoices }: Props) {
  const stats = useMemo(() => {
    const sent = quotes.filter((q) => q.status !== 'draft')
    const accepted = quotes.filter((q) => q.status === 'accepted')
    const declined = quotes.filter((q) => q.status === 'declined')

    const winRate = sent.length > 0
      ? Math.round((accepted.length / (accepted.length + declined.length || 1)) * 100)
      : 0

    const avgValue = sent.length > 0
      ? sent.reduce((s, q) => s + q.total, 0) / sent.length
      : 0

    // Average days from sent_at to accepted_at
    const acceptedWithTimes = accepted.filter((q) => q.sent_at && q.accepted_at)
    const avgDaysToAccept = acceptedWithTimes.length > 0
      ? acceptedWithTimes.reduce((sum, q) => {
          const diff = new Date(q.accepted_at!).getTime() - new Date(q.sent_at!).getTime()
          return sum + diff / (1000 * 60 * 60 * 24)
        }, 0) / acceptedWithTimes.length
      : 0

    const totalRevenue = paidInvoices.reduce((s, i) => s + i.total, 0)

    return { winRate, avgValue, avgDaysToAccept, totalRevenue, acceptedCount: accepted.length, declinedCount: declined.length, totalSent: sent.length }
  }, [quotes, paidInvoices])

  // Quote status distribution
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    quotes.forEach((q) => {
      counts[q.status] = (counts[q.status] ?? 0) + 1
    })
    return Object.entries(counts).map(([status, count]) => ({ status, count }))
  }, [quotes])

  // Revenue by month (last 12 months)
  const revenueByMonth = useMemo(() => {
    const now = new Date()
    const months: { month: string; revenue: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ month: MONTH_NAMES[d.getMonth()], revenue: 0 })
    }
    paidInvoices.forEach((inv) => {
      const d = new Date(inv.paid_at ?? inv.created_at)
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
      if (monthsAgo >= 0 && monthsAgo < 12) {
        months[11 - monthsAgo].revenue += inv.total
      }
    })
    return months
  }, [paidInvoices])

  // Quotes created by month (last 12)
  const quotesByMonth = useMemo(() => {
    const now = new Date()
    const months: { month: string; quotes: number; accepted: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ month: MONTH_NAMES[d.getMonth()], quotes: 0, accepted: 0 })
    }
    quotes.forEach((q) => {
      const d = new Date(q.created_at)
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
      if (monthsAgo >= 0 && monthsAgo < 12) {
        months[11 - monthsAgo].quotes++
        if (q.status === 'accepted') months[11 - monthsAgo].accepted++
      }
    })
    return months
  }, [quotes])

  const STAT_CARDS = [
    {
      label: 'Win Rate',
      value: `${stats.winRate}%`,
      sub: `${stats.acceptedCount} accepted / ${stats.declinedCount} declined`,
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Avg Quote Value',
      value: formatCurrency(stats.avgValue),
      sub: `across ${stats.totalSent} sent quotes`,
      icon: FileText,
      color: 'text-navy-900',
      bg: 'bg-navy-50',
    },
    {
      label: 'Avg Time to Accept',
      value: stats.avgDaysToAccept > 0 ? `${stats.avgDaysToAccept.toFixed(1)}d` : '—',
      sub: 'from sent to signed',
      icon: Clock,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(stats.totalRevenue),
      sub: 'from paid invoices',
      icon: DollarSign,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl text-navy-900">Analytics</h1>
        <p className="text-gray-500 text-sm mt-0.5">Win rate, revenue trends, and quoting performance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="card space-y-1">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
              <Icon className={`w-4.5 h-4.5 ${color}`} size={18} />
            </div>
            <div className="text-2xl font-bold text-navy-900">{value}</div>
            <div className="text-xs text-gray-500 font-medium">{label}</div>
            <div className="text-xs text-gray-400">{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue by month */}
        <div className="card lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-6">Revenue by Month</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueByMonth} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip
                formatter={(v) => [formatCurrency(Number(v)), 'Revenue']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Bar dataKey="revenue" fill="#D4943C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quote status donut */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Quote Status</h2>
          {statusDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {statusDistribution.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#cbd5e1'} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value) => <span style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{value}</span>}
                />
                <Tooltip
                  formatter={(v, name) => [v, name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Quotes volume chart */}
      <div className="card">
        <div className="flex items-center gap-6 mb-6">
          <h2 className="font-semibold text-gray-900">Quote Volume (12 months)</h2>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-navy-900 inline-block" /> All Quotes</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Accepted</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={quotesByMonth} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
            <Bar dataKey="quotes" name="All Quotes" fill="#0F1C2E" radius={[3, 3, 0, 0]} />
            <Bar dataKey="accepted" name="Accepted" fill="#22c55e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Win/loss summary */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-navy-900">{stats.acceptedCount}</div>
            <div className="text-sm text-gray-500">Quotes accepted</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <XCircle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-navy-900">{stats.declinedCount}</div>
            <div className="text-sm text-gray-500">Quotes declined</div>
          </div>
        </div>
      </div>
    </div>
  )
}
