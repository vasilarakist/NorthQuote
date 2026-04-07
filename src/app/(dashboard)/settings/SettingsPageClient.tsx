'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Organization, FollowUpSettings } from '@/types/database'
import { CANADIAN_PROVINCES, US_STATES, TRADE_TYPES } from '@/lib/utils'
import { Building2, User, Tag, CreditCard, Bell, CheckCircle2, Loader2, ExternalLink, Download, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  organization: Organization | null
  user: { organization_id: string; full_name: string | null; role: string; email: string }
}

const PROVINCES_AND_STATES = [
  { group: 'Canadian Provinces & Territories', options: CANADIAN_PROVINCES },
  { group: 'US States', options: US_STATES },
]

const DEFAULT_FOLLOW_UP: FollowUpSettings = {
  quote_not_opened_hours: 24,
  quote_not_accepted_hours: 72,
  invoice_overdue_days: 3,
  sms_enabled: true,
  email_enabled: true,
}

export function SettingsPageClient({ organization, user }: Props) {
  const searchParams = useSearchParams()
  const stripeConnectedParam = searchParams.get('stripe') === 'connected'

  const [orgForm, setOrgForm] = useState({
    name: organization?.name ?? '',
    email: organization?.email ?? '',
    phone: organization?.phone ?? '',
    address: organization?.address ?? '',
    city: organization?.city ?? '',
    province_state: organization?.province_state ?? '',
    postal_zip: organization?.postal_zip ?? '',
    country: organization?.country ?? 'CA',
    trade_type: organization?.trade_type ?? '',
    gst_hst_number: organization?.gst_hst_number ?? '',
  })
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgSuccess, setOrgSuccess] = useState(false)
  const [orgError, setOrgError] = useState('')

  // Follow-up settings
  const [followUpSettings, setFollowUpSettings] = useState<FollowUpSettings>(
    organization?.follow_up_settings ?? DEFAULT_FOLLOW_UP
  )
  const [fuLoading, setFuLoading] = useState(false)
  const [fuSuccess, setFuSuccess] = useState(false)

  // Stripe Connect
  const [stripeLoading, setStripeLoading] = useState(false)
  const stripeConnected = stripeConnectedParam || Boolean(organization?.stripe_account_id)

  // Exports
  const [qbLoading, setQbLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [exportError, setExportError] = useState('')

  async function handleQbExport() {
    setQbLoading(true)
    setExportError('')
    const res = await fetch('/api/export/quickbooks')
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '') ?? 'quickbooks-export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const data = await res.json()
      setExportError(data.error ?? 'Export failed.')
    }
    setQbLoading(false)
  }

  async function handleDataExport() {
    setDataLoading(true)
    setExportError('')
    const res = await fetch('/api/export/data')
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '') ?? 'northquote-export.zip'
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const data = await res.json()
      setExportError(data.error ?? 'Export failed.')
    }
    setDataLoading(false)
  }

  function handleOrgChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setOrgForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setOrgSuccess(false)
  }

  async function handleOrgSave(e: React.FormEvent) {
    e.preventDefault()
    setOrgError('')
    setOrgLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('organizations').update({
      name: orgForm.name, email: orgForm.email || null, phone: orgForm.phone || null,
      address: orgForm.address || null, city: orgForm.city || null,
      province_state: orgForm.province_state || null, postal_zip: orgForm.postal_zip || null,
      country: orgForm.country, trade_type: orgForm.trade_type || null,
      gst_hst_number: orgForm.gst_hst_number || null,
    }).eq('id', user.organization_id)
    if (error) { setOrgError(error.message) } else { setOrgSuccess(true) }
    setOrgLoading(false)
  }

  async function handleFollowUpSave(e: React.FormEvent) {
    e.preventDefault()
    setFuLoading(true)
    const supabase = createClient()
    await supabase.from('organizations').update({ follow_up_settings: followUpSettings }).eq('id', user.organization_id)
    setFuSuccess(true)
    setFuLoading(false)
    setTimeout(() => setFuSuccess(false), 3000)
  }

  async function handleStripeConnect() {
    setStripeLoading(true)
    const res = await fetch('/api/stripe/connect', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else setStripeLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="font-serif text-2xl text-navy-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage your company profile and integrations</p>
      </div>

      {/* ── Company Profile ── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-navy-50 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-navy-900" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Company Profile</h2>
            <p className="text-xs text-gray-500">Appears on all quotes and invoices</p>
          </div>
        </div>
        <form onSubmit={handleOrgSave} className="space-y-4">
          {orgError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{orgError}</div>}
          {orgSuccess && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">Settings saved.</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Company name <span className="text-red-500">*</span></label>
              <input name="name" type="text" value={orgForm.name} onChange={handleOrgChange} className="input" required />
            </div>
            <div>
              <label className="label">Business email</label>
              <input name="email" type="email" value={orgForm.email} onChange={handleOrgChange} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input name="phone" type="tel" value={orgForm.phone} onChange={handleOrgChange} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Trade type</label>
              <select name="trade_type" value={orgForm.trade_type} onChange={handleOrgChange} className="input">
                <option value="">Select…</option>
                {TRADE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Street address</label>
              <input name="address" type="text" value={orgForm.address} onChange={handleOrgChange} className="input" />
            </div>
            <div>
              <label className="label">City</label>
              <input name="city" type="text" value={orgForm.city} onChange={handleOrgChange} className="input" />
            </div>
            <div>
              <label className="label">Postal / ZIP</label>
              <input name="postal_zip" type="text" value={orgForm.postal_zip} onChange={handleOrgChange} className="input" />
            </div>
            <div>
              <label className="label">Country</label>
              <select name="country" value={orgForm.country} onChange={handleOrgChange} className="input">
                <option value="CA">Canada</option>
                <option value="US">United States</option>
              </select>
            </div>
            <div>
              <label className="label">Province / State</label>
              <select name="province_state" value={orgForm.province_state} onChange={handleOrgChange} className="input">
                <option value="">Select…</option>
                {PROVINCES_AND_STATES.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">GST/HST number</label>
              <input name="gst_hst_number" type="text" value={orgForm.gst_hst_number} onChange={handleOrgChange} className="input" placeholder="123456789 RT0001" />
            </div>
          </div>
          <div className="pt-2">
            <button type="submit" disabled={orgLoading} className="btn-primary">
              {orgLoading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Stripe Connect ── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Stripe Payments</h2>
            <p className="text-xs text-gray-500">Accept payments directly from your proposals</p>
          </div>
        </div>

        {stripeConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-green-800">Stripe account connected</div>
                {organization?.stripe_account_id && (
                  <div className="text-xs text-green-600 font-mono">{organization.stripe_account_id}</div>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Your clients can pay directly from their proposal page. Funds go directly to your Stripe account.
            </p>
            <button
              onClick={handleStripeConnect}
              disabled={stripeLoading}
              className="btn-secondary text-sm"
            >
              {stripeLoading ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
              Manage Stripe Dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600 space-y-1">
              <p className="font-medium text-gray-900">Connect your Stripe account to:</p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-500">
                <li>Accept card and bank transfer payments on proposals</li>
                <li>Automatically update invoice status on payment</li>
                <li>Show transparent processing fees to clients</li>
              </ul>
            </div>
            <button
              onClick={handleStripeConnect}
              disabled={stripeLoading || user.role !== 'owner'}
              className="btn-primary"
            >
              {stripeLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
              {stripeLoading ? 'Connecting…' : 'Connect Stripe Account'}
            </button>
            {user.role !== 'owner' && (
              <p className="text-xs text-amber-600">Only account owners can connect Stripe.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Follow-Up Automation ── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Automated Follow-Ups</h2>
            <p className="text-xs text-gray-500">Remind clients at the right moment — automatically</p>
          </div>
        </div>

        <form onSubmit={handleFollowUpSave} className="space-y-5">
          {/* Channel toggles */}
          <div className="grid grid-cols-2 gap-3">
            <label className={cn(
              'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors',
              followUpSettings.email_enabled ? 'border-navy-900 bg-navy-50' : 'border-gray-200'
            )}>
              <input
                type="checkbox"
                checked={followUpSettings.email_enabled}
                onChange={(e) => setFollowUpSettings((s) => ({ ...s, email_enabled: e.target.checked }))}
                className="rounded"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">Email follow-ups</div>
                <div className="text-xs text-gray-400">via Resend</div>
              </div>
            </label>
            <label className={cn(
              'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors',
              followUpSettings.sms_enabled ? 'border-navy-900 bg-navy-50' : 'border-gray-200'
            )}>
              <input
                type="checkbox"
                checked={followUpSettings.sms_enabled}
                onChange={(e) => setFollowUpSettings((s) => ({ ...s, sms_enabled: e.target.checked }))}
                className="rounded"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">SMS follow-ups</div>
                <div className="text-xs text-gray-400">via Twilio</div>
              </div>
            </label>
          </div>

          {/* Timing */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900">Quote not opened</div>
                <div className="text-xs text-gray-500">SMS reminder if client hasn&apos;t opened the proposal</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={followUpSettings.quote_not_opened_hours}
                  onChange={(e) => setFollowUpSettings((s) => ({ ...s, quote_not_opened_hours: parseInt(e.target.value) || 24 }))}
                  className="input w-20 text-right text-sm"
                />
                <span className="text-sm text-gray-500">hrs</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900">Quote not accepted</div>
                <div className="text-xs text-gray-500">Email follow-up after client views but doesn&apos;t accept</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={followUpSettings.quote_not_accepted_hours}
                  onChange={(e) => setFollowUpSettings((s) => ({ ...s, quote_not_accepted_hours: parseInt(e.target.value) || 72 }))}
                  className="input w-20 text-right text-sm"
                />
                <span className="text-sm text-gray-500">hrs</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900">Invoice overdue</div>
                <div className="text-xs text-gray-500">Payment reminder after due date</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={followUpSettings.invoice_overdue_days}
                  onChange={(e) => setFollowUpSettings((s) => ({ ...s, invoice_overdue_days: parseInt(e.target.value) || 3 }))}
                  className="input w-20 text-right text-sm"
                />
                <span className="text-sm text-gray-500">days</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={fuLoading} className="btn-primary">
              {fuLoading ? 'Saving…' : 'Save Follow-Up Settings'}
            </button>
            {fuSuccess && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 size={14} /> Saved
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── Account Info ── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-navy-50 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-navy-900" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Account</h2>
            <p className="text-xs text-gray-500">Your personal account information</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="label">Email</div>
            <div className="input bg-gray-50 text-gray-500 cursor-not-allowed">{user.email}</div>
          </div>
          <div>
            <div className="label">Role</div>
            <div className="input bg-gray-50 text-gray-500 cursor-not-allowed capitalize">{user.role}</div>
          </div>
        </div>
      </div>

      {/* ── QuickBooks Export ── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">QuickBooks Export</h2>
            <p className="text-xs text-gray-500">Download paid invoices formatted for QuickBooks import</p>
          </div>
        </div>
        {exportError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{exportError}</div>
        )}
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600 mb-4">
          <p className="font-medium text-gray-900 mb-1">What&apos;s included:</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-500 text-xs">
            <li>All paid invoices with line items</li>
            <li>Customer names, dates, amounts, and tax</li>
            <li>Ready for QuickBooks Online CSV import</li>
            <li>Drafts and estimates are excluded</li>
          </ul>
        </div>
        <button
          onClick={handleQbExport}
          disabled={qbLoading}
          className="btn-secondary"
        >
          {qbLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {qbLoading ? 'Exporting…' : 'Export for QuickBooks'}
        </button>
      </div>

      {/* ── Data Export ── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
            <Download className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Export All Data</h2>
            <p className="text-xs text-gray-500">Download everything — clients, quotes, and invoices as CSV files</p>
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600 mb-4">
          <p className="font-medium text-gray-900 mb-1">You&apos;ll receive a .zip containing:</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-500 text-xs">
            <li>clients.csv — all client records</li>
            <li>quotes.csv — all quotes with status and totals</li>
            <li>invoices.csv — all invoices with payment info</li>
          </ul>
        </div>
        <button
          onClick={handleDataExport}
          disabled={dataLoading}
          className="btn-primary"
        >
          {dataLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {dataLoading ? 'Preparing download…' : 'Download All Data'}
        </button>
      </div>

      {/* ── Referral ── */}
      {organization?.referral_code && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
              <Tag className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Referral Code</h2>
              <p className="text-xs text-gray-500">Share with other contractors to earn credits</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono text-navy-900 tracking-wider">
              {organization.referral_code}
            </code>
            <button onClick={() => navigator.clipboard.writeText(organization.referral_code!)} className="btn-secondary text-xs">
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
