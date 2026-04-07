'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Organization } from '@/types/database'
import { CANADIAN_PROVINCES, US_STATES, TRADE_TYPES } from '@/lib/utils'
import { Building2, User, Tag } from 'lucide-react'

interface Props {
  organization: Organization | null
  user: { organization_id: string; full_name: string | null; role: string; email: string }
}

const PROVINCES_AND_STATES = [
  { group: 'Canadian Provinces & Territories', options: CANADIAN_PROVINCES },
  { group: 'US States', options: US_STATES },
]

export function SettingsPageClient({ organization, user }: Props) {
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

  function handleOrgChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setOrgForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setOrgSuccess(false)
  }

  async function handleOrgSave(e: React.FormEvent) {
    e.preventDefault()
    setOrgError('')
    setOrgLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('organizations')
      .update({
        name: orgForm.name,
        email: orgForm.email || null,
        phone: orgForm.phone || null,
        address: orgForm.address || null,
        city: orgForm.city || null,
        province_state: orgForm.province_state || null,
        postal_zip: orgForm.postal_zip || null,
        country: orgForm.country,
        trade_type: orgForm.trade_type || null,
        gst_hst_number: orgForm.gst_hst_number || null,
      })
      .eq('id', user.organization_id)

    if (error) { setOrgError(error.message) } else { setOrgSuccess(true) }
    setOrgLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="font-serif text-2xl text-navy-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage your company profile and account</p>
      </div>

      {/* Company Settings */}
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
          {orgError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{orgError}</div>
          )}
          {orgSuccess && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">Settings saved successfully.</div>
          )}

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
                    {group.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
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

      {/* Account Info */}
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

      {/* Referral */}
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
            <button
              onClick={() => navigator.clipboard.writeText(organization.referral_code!)}
              className="btn-secondary text-xs"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
