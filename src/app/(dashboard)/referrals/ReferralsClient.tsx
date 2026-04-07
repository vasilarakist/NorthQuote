'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Link2, Copy, CheckCircle2, Users, Gift, TrendingUp } from 'lucide-react'

interface ReferralRow {
  id: string
  status: string
  credit_amount: number | null
  credited_at: string | null
  created_at: string
  referral_code_used: string
}

interface Props {
  referralCode: string | null
  orgName: string
  billingCredits: number
  referrals: ReferralRow[]
}

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  pending:   { label: 'Pending',   class: 'bg-yellow-100 text-yellow-700' },
  converted: { label: 'Converted', class: 'bg-blue-100 text-blue-700' },
  credited:  { label: 'Credited',  class: 'bg-green-100 text-green-700' },
}

export function ReferralsClient({ referralCode, billingCredits, referrals }: Props) {
  const [copied, setCopied] = useState(false)

  const referralLink = referralCode
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://northquote.app'}/signup?ref=${referralCode}`
    : null

  function copyLink() {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const totalReferrals = referrals.length
  const conversions = referrals.filter((r) => r.status === 'converted' || r.status === 'credited').length
  const totalCreditsEarned = referrals.reduce((s, r) => s + (r.credit_amount ?? 0), 0)

  const STATS = [
    { label: 'Total Referrals', value: totalReferrals, icon: Users, color: 'text-navy-900', bg: 'bg-navy-50' },
    { label: 'Conversions', value: conversions, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Credits Earned', value: formatCurrency(totalCreditsEarned), icon: Gift, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Available Credits', value: formatCurrency(billingCredits), icon: CheckCircle2, color: 'text-purple-600', bg: 'bg-purple-50' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl text-navy-900">Referrals</h1>
        <p className="text-gray-500 text-sm mt-0.5">Earn billing credits by referring other contractors</p>
      </div>

      {/* Referral link */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
            <Link2 className="w-4.5 h-4.5 text-amber-500" size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Your Referral Link</h2>
            <p className="text-xs text-gray-500">Share with contractors — earn $25 credit per paid signup</p>
          </div>
        </div>

        {referralLink ? (
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            <span className="text-sm text-gray-700 truncate flex-1 font-mono">{referralLink}</span>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-900 text-white text-xs font-medium hover:bg-navy-800 transition-colors flex-shrink-0"
            >
              {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            Your referral code is being generated. Refresh the page in a moment.
          </div>
        )}

        {referralCode && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Code:</span>
            <code className="text-xs font-mono bg-gray-100 rounded px-2 py-0.5 text-navy-900 tracking-wider">
              {referralCode}
            </code>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {STATS.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card text-center">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mx-auto mb-2`}>
              <Icon className={`w-4.5 h-4.5 ${color}`} size={18} />
            </div>
            <div className="text-xl font-bold text-navy-900">{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="card bg-navy-50 border-navy-100">
        <h3 className="font-semibold text-navy-900 mb-4">How it works</h3>
        <ol className="space-y-3">
          {[
            'Share your unique referral link with other contractors.',
            'They sign up using your link and start their free trial.',
            'When they make their first paid subscription payment, you earn a $25 billing credit.',
            'Credits are automatically applied to your next invoice.',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">{i + 1}</span>
              </div>
              <span className="text-sm text-navy-800">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Referral history */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Referral History</h2>
        </div>
        {referrals.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {referrals.map((r) => {
              const s = STATUS_LABELS[r.status] ?? { label: r.status, class: 'bg-gray-100 text-gray-600' }
              return (
                <div key={r.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-gray-900">Referral via <code className="font-mono text-xs bg-gray-100 rounded px-1">{r.referral_code_used}</code></div>
                    <div className="text-xs text-gray-400 mt-0.5">{formatDate(r.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {r.credit_amount ? (
                      <span className="text-sm font-medium text-green-600">+{formatCurrency(r.credit_amount)}</span>
                    ) : null}
                    <span className={`badge ${s.class}`}>{s.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No referrals yet</p>
            <p className="text-gray-400 text-xs mt-1">Share your link to start earning credits</p>
          </div>
        )}
      </div>
    </div>
  )
}
