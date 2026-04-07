'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Client, Project, PriceBookItem } from '@/types/database'
import { LineItemsEditor, type LineItemDraft, newLineItem } from '@/components/ui/LineItemsEditor'
import { getTaxInfo, calcLineTotal } from '@/lib/taxes'
import { formatCurrency, CANADIAN_PROVINCES, US_STATES } from '@/lib/utils'
import { Sparkles, Loader2, Plus, X, ChevronDown, Wand2, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  organizationId: string
  tradeType: string
  provinceState: string
  initialClients: Client[]
  initialProjects: Project[]
  priceBookItems: PriceBookItem[]
}

const PROVINCES_AND_STATES = [
  { group: 'Canadian Provinces & Territories', options: CANADIAN_PROVINCES },
  { group: 'US States', options: US_STATES },
]

function defaultValidUntil(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}

export function QuoteBuilderClient({
  organizationId,
  tradeType,
  provinceState,
  initialClients,
  initialProjects,
  priceBookItems,
}: Props) {
  const router = useRouter()

  const [clients, setClients] = useState<Client[]>(initialClients)
  const [projects, setProjects] = useState<Project[]>(initialProjects)

  // Form
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [notesToClient, setNotesToClient] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [validUntil, setValidUntil] = useState(defaultValidUntil)

  // Quote mode
  const [tieredMode, setTieredMode] = useState(false)
  const [activeTier, setActiveTier] = useState<'good' | 'better' | 'best'>('good')

  // Line items — single mode
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([])

  // Line items — tiered mode (one set per tier)
  const [goodItems, setGoodItems] = useState<LineItemDraft[]>([])
  const [betterItems, setBetterItems] = useState<LineItemDraft[]>([])
  const [bestItems, setBestItems] = useState<LineItemDraft[]>([])

  // Notes per tier
  const [goodNotes, setGoodNotes] = useState('')
  const [betterNotes, setBetterNotes] = useState('')
  const [bestNotes, setBestNotes] = useState('')

  // AI state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [introLoading, setIntroLoading] = useState(false)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Inline new client modal
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [clientCreating, setClientCreating] = useState(false)

  // Inline new project modal
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectAddress, setNewProjectAddress] = useState('')
  const [projectCreating, setProjectCreating] = useState(false)

  // Derived
  const filteredProjects = useMemo(
    () => projects.filter((p) => p.client_id === clientId && p.status === 'active'),
    [projects, clientId]
  )

  const taxInfo = getTaxInfo(provinceState)

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.total, 0),
    [lineItems]
  )
  const taxAmount = subtotal * taxInfo.rate
  const total = subtotal + taxAmount

  // Tiered totals
  const tierData = useMemo(() => {
    const calc = (items: LineItemDraft[]) => {
      const sub = items.reduce((s, i) => s + i.total, 0)
      const tax = sub * taxInfo.rate
      return { subtotal: sub, taxAmount: tax, total: sub + tax }
    }
    return {
      good: calc(goodItems),
      better: calc(betterItems),
      best: calc(bestItems),
    }
  }, [goodItems, betterItems, bestItems, taxInfo.rate])

  const activeTierItems = activeTier === 'good' ? goodItems : activeTier === 'better' ? betterItems : bestItems
  const setActiveTierItems = activeTier === 'good' ? setGoodItems : activeTier === 'better' ? setBetterItems : setBestItems

  // ─── AI Generate Quote ────────────────────────────────────────
  async function handleGenerateAI() {
    if (!jobDescription.trim()) {
      setAiError('Please describe the job before generating.')
      return
    }
    setAiError('')
    setAiLoading(true)

    const pbForAI = priceBookItems.map((item) => ({
      name: item.name,
      category: item.category,
      unit: item.unit ?? 'each',
      unit_price: item.unit_price,
      markup_percent: item.markup_percent ?? 0,
    }))

    const res = await fetch('/api/ai/generate-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: jobDescription,
        trade_type: tradeType,
        province_state: provinceState,
        price_book_items: pbForAI,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setAiError(data.error ?? 'AI generation failed. Try again.')
      setAiLoading(false)
      return
    }

    const newItems: LineItemDraft[] = (data.line_items ?? []).map(
      (item: Omit<LineItemDraft, '_id' | 'total' | 'ai_generated'>) => ({
        _id: crypto.randomUUID(),
        ...item,
        total: calcLineTotal(item.quantity, item.unit_price, item.markup_percent),
        ai_generated: true,
      })
    )
    setLineItems(newItems)
    setAiLoading(false)
  }

  // ─── AI Generate Intro ────────────────────────────────────────
  async function handleGenerateIntro() {
    if (!lineItems.length) return
    setIntroLoading(true)
    const res = await fetch('/api/ai/generate-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_description: jobDescription,
        trade_type: tradeType,
        line_items: lineItems.map((i) => ({
          description: i.description,
          category: i.category,
          quantity: i.quantity,
          unit: i.unit,
          total: i.total,
        })),
      }),
    })
    const data = await res.json()
    if (res.ok && data.intro) setNotesToClient(data.intro)
    setIntroLoading(false)
  }

  // ─── Inline Create Client ─────────────────────────────────────
  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault()
    setClientCreating(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('clients')
      .insert({
        organization_id: organizationId,
        name: newClientName,
        email: newClientEmail || null,
        phone: newClientPhone || null,
      })
      .select()
      .single()
    if (!error && data) {
      setClients((prev) => [...prev, data])
      setClientId(data.id)
      setProjectId('')
    }
    setNewClientName('')
    setNewClientEmail('')
    setNewClientPhone('')
    setShowNewClient(false)
    setClientCreating(false)
  }

  // ─── Inline Create Project ────────────────────────────────────
  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) return
    setProjectCreating(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('projects')
      .insert({
        organization_id: organizationId,
        client_id: clientId,
        project_name: newProjectName,
        service_address: newProjectAddress,
        status: 'active',
      })
      .select()
      .single()
    if (!error && data) {
      setProjects((prev) => [...prev, data])
      setProjectId(data.id)
    }
    setNewProjectName('')
    setNewProjectAddress('')
    setShowNewProject(false)
    setProjectCreating(false)
  }

  // ─── Save single quote ────────────────────────────────────────
  async function saveSingleQuote(supabase: ReturnType<typeof createClient>, quoteNumber: string, status: 'draft' | 'sent', items: LineItemDraft[], notes: string, tierName: 'single' | 'good' | 'better' | 'best') {
    const sub = items.reduce((s, i) => s + i.total, 0)
    const tax = sub * taxInfo.rate
    const tot = sub + tax

    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .insert({
        organization_id: organizationId,
        project_id: projectId,
        client_id: clientId,
        quote_number: quoteNumber,
        version: 1,
        status,
        tier: tierName,
        subtotal: sub,
        tax_amount: tax,
        tax_rate: taxInfo.rate,
        tax_type: taxInfo.type,
        total: tot,
        currency: 'CAD',
        valid_until: validUntil || null,
        ai_generated: items.some((i) => i.ai_generated),
        ai_prompt: jobDescription || null,
        notes_to_client: notes || null,
        internal_notes: internalNotes || null,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (quoteErr || !quote) throw new Error(quoteErr?.message ?? 'Failed to save quote.')

    const lineItemsPayload = items.map((item, idx) => ({
      quote_id: quote.id, position: idx,
      description: item.description, category: item.category,
      quantity: item.quantity, unit: item.unit,
      unit_price: item.unit_price, markup_percent: item.markup_percent,
      total: item.total, from_price_book: false,
    }))

    if (lineItemsPayload.length) {
      const { error: liErr } = await supabase.from('quote_line_items').insert(lineItemsPayload)
      if (liErr) throw new Error(liErr.message)
    }

    await supabase.from('quote_versions').insert({
      quote_id: quote.id,
      version_number: 1,
      snapshot: { quote, line_items: lineItemsPayload },
    })

    return quote
  }

  // ─── Save Quote ───────────────────────────────────────────────
  const handleSave = useCallback(
    async (status: 'draft' | 'sent') => {
      if (!clientId || !projectId) {
        setSaveError('Please select a client and project.')
        return
      }

      if (tieredMode) {
        if (!goodItems.length || !betterItems.length || !bestItems.length) {
          setSaveError('Add at least one line item to each tier (Good, Better, Best).')
          return
        }
      } else if (!lineItems.length) {
        setSaveError('Add at least one line item.')
        return
      }

      setSaveError('')
      setSaving(true)

      try {
        const supabase = createClient()

        const { count } = await supabase
          .from('quotes')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId)

        const now = new Date()
        const baseNumber = `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String((count ?? 0) + 1).padStart(4, '0')}`

        if (tieredMode) {
          const goodQuote = await saveSingleQuote(supabase, `${baseNumber}-G`, status, goodItems, goodNotes, 'good')
          await saveSingleQuote(supabase, `${baseNumber}-B`, status, betterItems, betterNotes, 'better')
          await saveSingleQuote(supabase, `${baseNumber}-X`, status, bestItems, bestNotes, 'best')
          router.push(`/quotes/${goodQuote.id}`)
        } else {
          const quote = await saveSingleQuote(supabase, baseNumber, status, lineItems, notesToClient, 'single')
          router.push(`/quotes/${quote.id}`)
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save.')
        setSaving(false)
      }
    },
    [
      clientId, projectId, lineItems, goodItems, betterItems, bestItems,
      goodNotes, betterNotes, bestNotes, tieredMode,
      organizationId, taxInfo, validUntil, jobDescription, notesToClient, internalNotes, router,
    ]
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl text-navy-900">New Quote</h1>
        <p className="text-gray-500 text-sm mt-0.5">Generate a professional quote with AI assistance</p>
      </div>

      {saveError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* ── Quote Mode Toggle ── */}
      <div className="card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Quote Type</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {tieredMode ? 'Create 3 tiers — client picks the one that fits' : 'Single quote for the job'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTieredMode((v) => !v)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all',
              tieredMode
                ? 'border-amber-500 bg-amber-50 text-amber-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            )}
          >
            <Layers size={15} />
            {tieredMode ? 'Tiered (Good / Better / Best)' : 'Single Quote'}
          </button>
        </div>
      </div>

      {/* ── Client & Project ── */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Client &amp; Project</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Client select */}
          <div>
            <label className="label">Client <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <select
                value={clientId}
                onChange={(e) => { setClientId(e.target.value); setProjectId('') }}
                className="input flex-1"
                required
              >
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setShowNewClient(true)}
                title="New client"
                className="btn-secondary px-3"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* Project select */}
          <div>
            <label className="label">Project <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="input flex-1"
                disabled={!clientId}
                required
              >
                <option value="">Select project…</option>
                {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setShowNewProject(true)}
                disabled={!clientId}
                title="New project"
                className="btn-secondary px-3 disabled:opacity-40"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Job Description ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Job Description</h2>
          <span className="text-xs text-gray-400">Describe the work — the AI will build the estimate</span>
        </div>
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          className="input resize-none"
          rows={4}
          placeholder="e.g. Replace the main electrical panel from 100A to 200A service upgrade, install 10 new circuits, add 4 pot lights in kitchen, and update smoke detectors throughout the house..."
        />
        {aiError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {aiError}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={aiLoading || !jobDescription.trim()}
            className="btn-amber disabled:opacity-50"
          >
            {aiLoading ? (
              <><Loader2 size={15} className="animate-spin" /> Generating…</>
            ) : (
              <><Sparkles size={15} /> Generate with AI</>
            )}
          </button>
          {lineItems.length > 0 && (
            <span className="text-xs text-gray-500">
              {lineItems.length} item{lineItems.length !== 1 ? 's' : ''} generated
              {lineItems.some((i) => i.ai_generated) && (
                <span className="ml-1 text-amber-500">✦ AI</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Line Items ── */}
      {tieredMode ? (
        <div className="card space-y-4">
          {/* Tier tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(['good', 'better', 'best'] as const).map((tier) => {
              const labels: Record<string, { label: string; sub: string; color: string }> = {
                good:   { label: 'Good',   sub: formatCurrency(tierData.good.total),   color: 'text-gray-700' },
                better: { label: 'Better', sub: formatCurrency(tierData.better.total), color: 'text-navy-900' },
                best:   { label: 'Best',   sub: formatCurrency(tierData.best.total),   color: 'text-amber-600' },
              }
              const isActive = activeTier === tier
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setActiveTier(tier)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all text-center',
                    isActive ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  <div className={cn('font-semibold', isActive ? labels[tier].color : 'text-gray-600')}>
                    {labels[tier].label}
                    {tier === 'better' && <span className="ml-1 text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5">★ Rec.</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{labels[tier].sub}</div>
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 capitalize">{activeTier} — Line Items</h2>
            <button
              type="button"
              onClick={() => setActiveTierItems((prev) => [...prev, newLineItem()])}
              className="btn-secondary text-xs px-3 py-2"
            >
              <Plus size={13} /> Add row
            </button>
          </div>
          <LineItemsEditor items={activeTierItems} onChange={setActiveTierItems} />

          {/* Tier totals summary */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
            {(['good', 'better', 'best'] as const).map((tier) => (
              <div key={tier} className={cn('text-center p-3 rounded-lg', activeTier === tier ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50')}>
                <div className="text-xs text-gray-500 capitalize mb-1">{tier}</div>
                <div className="text-sm font-semibold text-navy-900">{formatCurrency(tierData[tier].total)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Line Items</h2>
            <button
              type="button"
              onClick={() => setLineItems((prev) => [...prev, newLineItem()])}
              className="btn-secondary text-xs px-3 py-2"
            >
              <Plus size={13} /> Add row
            </button>
          </div>
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
        </div>
      )}

      {/* ── Notes & Options ── */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Quote Options</h2>
        {tieredMode ? (
          <div className="space-y-4">
            {(['good', 'better', 'best'] as const).map((tier) => {
              const val = tier === 'good' ? goodNotes : tier === 'better' ? betterNotes : bestNotes
              const setter = tier === 'good' ? setGoodNotes : tier === 'better' ? setBetterNotes : setBestNotes
              return (
                <div key={tier}>
                  <label className="label capitalize">{tier} — Notes to client</label>
                  <textarea
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    className="input resize-none"
                    rows={2}
                    placeholder={`Describe what's included in the ${tier} option…`}
                  />
                </div>
              )
            })}
          </div>
        ) : (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Notes to client</label>
            <button
              type="button"
              onClick={handleGenerateIntro}
              disabled={introLoading || !lineItems.length}
              className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 disabled:opacity-40 transition-colors"
            >
              {introLoading ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
              Generate scope summary
            </button>
          </div>
          <textarea
            value={notesToClient}
            onChange={(e) => setNotesToClient(e.target.value)}
            className="input resize-none"
            rows={3}
            placeholder="Visible to the client on the quote PDF…"
          />
        </div>
        )}
        <div>
          <label className="label">Internal notes <span className="text-gray-400 font-normal">(not shown to client)</span></label>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            className="input resize-none"
            rows={2}
            placeholder="Private notes for your team…"
          />
        </div>
        <div>
          <label className="label">Valid until</label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="input max-w-[200px]"
          />
        </div>
      </div>

      {/* ── Totals ── */}
      {tieredMode ? (
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">Tier Summary</h2>
          <div className="grid grid-cols-3 gap-4">
            {(['good', 'better', 'best'] as const).map((tier) => (
              <div key={tier} className={cn('rounded-xl p-4 border-2', tier === 'better' ? 'border-amber-500 bg-amber-50' : 'border-gray-200')}>
                <div className="text-xs text-gray-500 capitalize mb-2 font-medium flex items-center gap-1">
                  {tier}
                  {tier === 'better' && <span className="text-amber-500">★</span>}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Subtotal</span><span>{formatCurrency(tierData[tier].subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{taxInfo.label}</span><span>{formatCurrency(tierData[tier].taxAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-navy-900 pt-1 border-t border-gray-200">
                    <span>Total</span><span>{formatCurrency(tierData[tier].total)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card ml-auto max-w-sm space-y-2">
          <h2 className="font-semibold text-gray-900 mb-3">Summary</h2>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>{taxInfo.label}</span>
            <span>{formatCurrency(taxAmount)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-gray-900 pt-2 border-t border-gray-200">
            <span>Total (CAD)</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      )}

      {/* ── Sticky Action Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between gap-4 z-20">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          {!tieredMode && (
            <div className="text-sm text-gray-500 hidden sm:block">
              Total: <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="btn-secondary"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => handleSave('sent')}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save &amp; Send
          </button>
        </div>
      </div>

      {/* ── New Client Modal ── */}
      {showNewClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowNewClient(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-serif text-lg text-navy-900">New Client</h3>
              <button onClick={() => setShowNewClient(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateClient} className="p-6 space-y-4">
              <div>
                <label className="label">Name <span className="text-red-500">*</span></label>
                <input type="text" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} className="input" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Email</label>
                  <input type="email" value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input type="tel" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} className="input" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowNewClient(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={clientCreating} className="btn-primary flex-1">
                  {clientCreating ? 'Creating…' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Project Modal ── */}
      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowNewProject(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-serif text-lg text-navy-900">New Project</h3>
              <button onClick={() => setShowNewProject(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              <div>
                <label className="label">Project name <span className="text-red-500">*</span></label>
                <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="input" required />
              </div>
              <div>
                <label className="label">Service address <span className="text-red-500">*</span></label>
                <input type="text" value={newProjectAddress} onChange={(e) => setNewProjectAddress(e.target.value)} className="input" required />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowNewProject(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={projectCreating} className="btn-primary flex-1">
                  {projectCreating ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
