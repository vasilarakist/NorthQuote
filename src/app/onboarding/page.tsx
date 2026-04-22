'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CANADIAN_PROVINCES, US_STATES, TRADE_TYPES, generateReferralCode } from '@/lib/utils'
import { ChevronRight, Building2 } from 'lucide-react'

const PROVINCES_AND_STATES = [
  { group: 'Canadian Provinces & Territories', options: CANADIAN_PROVINCES },
  { group: 'US States', options: US_STATES },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const [form, setForm] = useState({
    companyName: '',
    phone: '',
    address: '',
    city: '',
    province_state: '',
    postal_zip: '',
    country: 'CA',
    tradeType: '',
    gstHstNumber: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const url = URL.createObjectURL(file)
    setLogoPreview(url)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    try {
      // Upload logo if provided (storage upload uses the browser client directly)
      let logoUrl: string | null = null
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop()
        const fileName = `${user.id}/logo.${fileExt}`
        const { error: uploadError } = await supabase.storage
          .from('org-assets')
          .upload(fileName, logoFile, { upsert: true })
        if (!uploadError) {
          const { data } = supabase.storage.from('org-assets').getPublicUrl(fileName)
          logoUrl = data.publicUrl
        }
      }

      // Create organization + user via the server-side API route which uses the
      // service role client to bypass RLS (correct pattern for account creation).
      const referralCode = generateReferralCode(form.companyName)
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.companyName,
          phone: form.phone || null,
          address: form.address || null,
          city: form.city || null,
          province_state: form.province_state || null,
          postal_zip: form.postal_zip || null,
          country: form.country,
          trade_type: form.tradeType || null,
          gst_hst_number: form.gstHstNumber || null,
          logo_url: logoUrl,
          referral_code: referralCode,
        }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || 'Something went wrong. Please try again.')
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setError(message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-serif text-2xl text-white">NorthQuote</span>
          </div>
          <p className="text-navy-300 text-sm">Let&apos;s set up your company</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-amber-500' : 'bg-navy-700'
              }`}
            />
          ))}
        </div>

        <div className="card shadow-xl">
          {step === 1 && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="font-serif text-xl text-navy-900">Company details</h2>
                  <p className="text-sm text-gray-500">Step 1 of 2</p>
                </div>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); setStep(2) }}
                className="space-y-4"
              >
                {/* Logo upload */}
                <div>
                  <label className="label">Company logo <span className="text-gray-400 font-normal">(optional)</span></label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-gray-400 text-center px-1">Logo</span>
                      )}
                    </div>
                    <label className="btn-secondary cursor-pointer text-xs">
                      Upload logo
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handleLogoChange}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="label">Company name <span className="text-red-500">*</span></label>
                  <input
                    name="companyName"
                    type="text"
                    value={form.companyName}
                    onChange={handleChange}
                    className="input"
                    placeholder="Smith Electrical Ltd."
                    required
                  />
                </div>

                <div>
                  <label className="label">Business phone <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    className="input"
                    placeholder="+1 (416) 555-0100"
                  />
                </div>

                <div>
                  <label className="label">Trade type <span className="text-red-500">*</span></label>
                  <select
                    name="tradeType"
                    value={form.tradeType}
                    onChange={handleChange}
                    className="input"
                    required
                  >
                    <option value="">Select your trade…</option>
                    {TRADE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn-primary w-full">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="font-serif text-xl text-navy-900">Address & tax info</h2>
                  <p className="text-sm text-gray-500">Step 2 of 2</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="label">Street address</label>
                  <input
                    name="address"
                    type="text"
                    value={form.address}
                    onChange={handleChange}
                    className="input"
                    placeholder="123 Main St"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">City</label>
                    <input
                      name="city"
                      type="text"
                      value={form.city}
                      onChange={handleChange}
                      className="input"
                      placeholder="Toronto"
                    />
                  </div>
                  <div>
                    <label className="label">Postal / ZIP</label>
                    <input
                      name="postal_zip"
                      type="text"
                      value={form.postal_zip}
                      onChange={handleChange}
                      className="input"
                      placeholder="M5V 2T6"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Country</label>
                    <select
                      name="country"
                      value={form.country}
                      onChange={handleChange}
                      className="input"
                    >
                      <option value="CA">Canada</option>
                      <option value="US">United States</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Province / State</label>
                    <select
                      name="province_state"
                      value={form.province_state}
                      onChange={handleChange}
                      className="input"
                    >
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
                </div>

                <div>
                  <label className="label">GST/HST number <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    name="gstHstNumber"
                    type="text"
                    value={form.gstHstNumber}
                    onChange={handleChange}
                    className="input"
                    placeholder="123456789 RT0001"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="btn-secondary flex-1"
                  >
                    Back
                  </button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Setting up…' : 'Launch NorthQuote'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
