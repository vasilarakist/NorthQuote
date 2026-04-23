'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Quote, QuoteLineItem } from '@/types/database'
import { LineItemsEditor, type LineItemDraft, newLineItem } from '@/components/ui/LineItemsEditor'
import { getTaxInfo, calcLineTotal } from '@/lib/taxes'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Pencil, Check, X, Loader2, Copy, Trash2, ArrowLeft,
  User, FolderOpen, Calendar, Sparkles, Send, Receipt,
  Link2, MessageSquare, Plus, CheckCircle2, History, RotateCcw,
  ChevronDown,
} from 'lucide-react'
import type { QuoteVersion } from '@/types/database'

interface Props {
  quote: Quote & {
    clients: { name: string; email: string | null; phone: string | null } | null
    projects: { project_name: string; service_address: string } | null
  }
  lineItems: QuoteLineItem[]
  provinceState: string
  versions: QuoteVersion[]
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-700',
  sent:     'bg-blue-100 text-blue-700',
  viewed:   'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired:  'bg-orange-100 text-orange-700',
}

function toLineItemDrafts(items: QuoteLineItem[]): LineItemDraft[] {
  return items.map((item) => ({
    _id: item.id,
    description: item.description,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit ?? 'each',
    unit_price: item.unit_price,
    markup_percent: item.markup_percent ?? 0,
    total: item.total,
    ai_generated: false,
  }))
}

export function QuoteDetailClient({ quote, lineItems: initialLineItems, provinceState, versions: initialVersions }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(toLineItemDrafts(initialLineItems))
  const [notesToClient, setNotesToClient] = useState(quote.notes_to_client ?? '')
  const [internalNotes, setInternalNotes] = useState(quote.internal_notes ?? '')
  const [validUntil, setValidUntil] = useState(quote.valid_until ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Send modal state
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendEmail, setSendEmail] = useState(true)
  const [sendSms, setSendSms] = useState(false)
  const [smsPhone, setSmsPhone] = useState(quote.clients?.phone ?? '')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [proposalUrl, setProposalUrl] = useState<string | null>(
    quote.proposal_token ? `${process.env.NEXT_PUBLIC_APP_URL}/proposal/${quote.proposal_token}` : null
  )
  const [copied, setCopied] = useState(false)

  // Convert to invoice state
  const [converting, setConverting] = useState(false)

  // Version history
  const [versions, setVersions] = useState<QuoteVersion[]>(initialVersions)
  const [showVersions, setShowVersions] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)

  const taxInfo = getTaxInfo(provinceState)
  const subtotal = useMemo(() => lineItems.reduce((s, i) => s + i.total, 0), [lineItems])
  const taxAmount = subtotal * taxInfo.rate
  const total = subtotal + taxAmount

  const canEdit = quote.status === 'draft' || quote.status === 'sent'
  const canSend = quote.status === 'draft' || quote.status === 'sent' || quote.status === 'viewed'
  const canConvert = quote.status === 'accepted'

  // ─── Save edits ───────────────────────────────────────────────
  async function handleSaveEdits() {
    setSaveError('')
    setSaving(true)
    const supabase = createClient()

    // Snapshot current state before applying edits
    const { data: currentItems } = await supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quote.id)
      .order('position')

    const nextVersionNumber = (versions.length > 0
      ? Math.max(...versions.map((v) => v.version_number))
      : 0) + 1

    const { data: newVersion } = await supabase
      .from('quote_versions')
      .insert({
        quote_id: quote.id,
        version_number: nextVersionNumber,
        snapshot: {
          quote: {
            subtotal: quote.subtotal, tax_amount: quote.tax_amount,
            total: quote.total, notes_to_client: quote.notes_to_client,
            internal_notes: quote.internal_notes, valid_until: quote.valid_until,
          },
          line_items: currentItems ?? [],
        },
      })
      .select()
      .single()

    if (newVersion) {
      setVersions((prev) => [newVersion, ...prev])
    }

    const { error: delErr } = await supabase.from('quote_line_items').delete().eq('quote_id', quote.id)
    if (delErr) { setSaveError(delErr.message); setSaving(false); return }

    const newItems = lineItems.map((item, idx) => ({
      quote_id: quote.id, position: idx,
      description: item.description, category: item.category,
      quantity: item.quantity, unit: item.unit,
      unit_price: item.unit_price, markup_percent: item.markup_percent,
      total: item.total, from_price_book: false,
    }))
    const { error: insErr } = await supabase.from('quote_line_items').insert(newItems)
    if (insErr) { setSaveError(insErr.message); setSaving(false); return }

    const { error: qErr } = await supabase.from('quotes').update({
      subtotal, tax_amount: taxAmount, tax_rate: taxInfo.rate, tax_type: taxInfo.type,
      total, notes_to_client: notesToClient || null,
      internal_notes: internalNotes || null, valid_until: validUntil || null,
    }).eq('id', quote.id)
    if (qErr) { setSaveError(qErr.message); setSaving(false); return }

    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  function handleCancelEdit() {
    setLineItems(toLineItemDrafts(initialLineItems))
    setNotesToClient(quote.notes_to_client ?? '')
    setInternalNotes(quote.internal_notes ?? '')
    setValidUntil(quote.valid_until ?? '')
    setEditing(false)
    setSaveError('')
  }

  // ─── Send proposal ────────────────────────────────────────────
  async function handleSend() {
    if (!sendEmail && !sendSms) {
      setSendError('Choose at least one delivery method.')
      return
    }
    setSendError('')
    setSending(true)
    const res = await fetch('/api/proposals/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_id: quote.id,
        send_email: sendEmail,
        send_sms: sendSms,
        client_phone_override: smsPhone || null,
      }),
    })
    const data = await res.json()
    if (!res.ok && res.status !== 207) {
      setSendError(data.error ?? 'Send failed.')
      setSending(false)
      return
    }
    if (data.errors?.length) {
      setSendError(data.errors.join(' '))
    }
    setProposalUrl(data.proposal_url)
    setSending(false)
    router.refresh()
  }

  function copyUrl() {
    if (proposalUrl) {
      navigator.clipboard.writeText(proposalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ─── Convert to Invoice ───────────────────────────────────────
  async function handleConvertToInvoice() {
    setConverting(true)
    const res = await fetch('/api/invoices/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote_id: quote.id }),
    })
    const data = await res.json()
    if (res.ok && data.invoice_id) {
      router.push(`/invoices/${data.invoice_id}`)
    }
    setConverting(false)
  }

  // ─── Duplicate ────────────────────────────────────────────────
  async function handleDuplicate() {
    const supabase = createClient()
    const { count } = await supabase
      .from('quotes').select('*', { count: 'exact', head: true })
      .eq('organization_id', quote.organization_id)
    const now = new Date()
    const newNumber = `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String((count ?? 0) + 1).padStart(4, '0')}`
    const { data: newQuote } = await supabase.from('quotes').insert({
      organization_id: quote.organization_id, project_id: quote.project_id,
      client_id: quote.client_id, quote_number: newNumber, version: 1, status: 'draft',
      tier: quote.tier, subtotal: quote.subtotal, tax_amount: quote.tax_amount,
      tax_rate: quote.tax_rate, tax_type: quote.tax_type, total: quote.total,
      currency: quote.currency, valid_until: quote.valid_until, ai_generated: quote.ai_generated,
      ai_prompt: quote.ai_prompt, notes_to_client: quote.notes_to_client,
      internal_notes: quote.internal_notes,
    }).select().single()
    if (newQuote) {
      const dupItems = initialLineItems.map((item, idx) => ({
        quote_id: newQuote.id, position: idx, description: item.description,
        category: item.category, quantity: item.quantity, unit: item.unit,
        unit_price: item.unit_price, markup_percent: item.markup_percent,
        total: item.total, from_price_book: item.from_price_book,
      }))
      await supabase.from('quote_line_items').insert(dupItems)
      router.push(`/quotes/${newQuote.id}`)
    }
  }

  // ─── Delete ───────────────────────────────────────────────────
  async function handleDelete() {
    if (!confirm('Delete this quote? This cannot be undone.')) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('quotes').delete().eq('id', quote.id)
    router.push('/quotes')
  }

  // ─── Restore version ──────────────────────────────────────────
  async function handleRestoreVersion(version: QuoteVersion) {
    if (!confirm(`Restore to version ${version.version_number}? Current state will be saved as a new version.`)) return
    setRestoring(version.id)
    const supabase = createClient()

    // Snapshot current state first
    const { data: currentItems } = await supabase
      .from('quote_line_items').select('*').eq('quote_id', quote.id).order('position')
    const nextVersionNumber = (versions.length > 0
      ? Math.max(...versions.map((v) => v.version_number))
      : 0) + 1
    const { data: savedVersion } = await supabase
      .from('quote_versions')
      .insert({
        quote_id: quote.id,
        version_number: nextVersionNumber,
        snapshot: {
          quote: {
            subtotal: quote.subtotal, tax_amount: quote.tax_amount, total: quote.total,
            notes_to_client: quote.notes_to_client, internal_notes: quote.internal_notes,
            valid_until: quote.valid_until,
          },
          line_items: currentItems ?? [],
        },
      })
      .select()
      .single()
    if (savedVersion) setVersions((prev) => [savedVersion, ...prev])

    // Apply snapshot
    const snap = version.snapshot as {
      quote: { subtotal: number; tax_amount: number; total: number; notes_to_client: string | null; internal_notes: string | null; valid_until: string | null }
      line_items: QuoteLineItem[]
    }

    await supabase.from('quote_line_items').delete().eq('quote_id', quote.id)
    if (snap.line_items?.length) {
      await supabase.from('quote_line_items').insert(
        snap.line_items.map((item: QuoteLineItem, idx: number) => ({
          quote_id: quote.id, position: idx,
          description: item.description, category: item.category,
          quantity: item.quantity, unit: item.unit,
          unit_price: item.unit_price, markup_percent: item.markup_percent,
          total: item.total, from_price_book: item.from_price_book ?? false,
        }))
      )
    }
    if (snap.quote) {
      await supabase.from('quotes').update({
        subtotal: snap.quote.subtotal, tax_amount: snap.quote.tax_amount, total: snap.quote.total,
        notes_to_client: snap.quote.notes_to_client, internal_notes: snap.quote.internal_notes,
        valid_until: snap.quote.valid_until,
      }).eq('id', quote.id)
    }

    setRestoring(null)
    router.refresh()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/quotes')} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-serif text-2xl text-navy-900">{quote.quote_number}</h1>
              <span className={cn('badge capitalize', STATUS_COLORS[quote.status] ?? 'bg-gray-100 text-gray-600')}>{quote.status}</span>
              {quote.ai_generated && <span className="badge bg-amber-100 text-amber-700"><Sparkles size={10} className="mr-1" /> AI</span>}
            </div>
            <p className="text-gray-500 text-sm mt-0.5">Created {formatDate(quote.created_at)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!editing && canEdit && <button onClick={() => setEditing(true)} className="btn-secondary"><Pencil size={14} /> Edit</button>}
          {editing && (
            <>
              <button onClick={handleCancelEdit} className="btn-secondary"><X size={14} /> Cancel</button>
              <button onClick={handleSaveEdits} disabled={saving} className="btn-primary">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save Changes
              </button>
            </>
          )}
          {!editing && canSend && (
            <button onClick={() => setShowSendModal(true)} className="btn-primary"><Send size={14} /> Send Proposal</button>
          )}
          {!editing && canConvert && (
            <button onClick={handleConvertToInvoice} disabled={converting} className="btn-amber">
              {converting ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />} Convert to Invoice
            </button>
          )}
          <button onClick={handleDuplicate} className="btn-secondary" title="Duplicate"><Copy size={14} /></button>
          <button onClick={handleDelete} disabled={deleting} className="btn-secondary text-red-500 hover:text-red-600 hover:border-red-300" title="Delete">
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {saveError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{saveError}</div>}

      {/* Proposal URL banner (if sent) */}
      {proposalUrl && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Link2 size={15} className="text-blue-500 flex-shrink-0" />
            <span className="text-sm text-blue-700 truncate">{proposalUrl}</span>
          </div>
          <button onClick={copyUrl} className="text-xs font-medium text-blue-600 hover:text-blue-800 flex-shrink-0 transition-colors">
            {copied ? <><CheckCircle2 size={13} className="inline mr-1" />Copied</> : 'Copy link'}
          </button>
        </div>
      )}

      {/* Meta cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card flex items-center gap-3">
          <div className="w-9 h-9 bg-navy-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <User className="w-4.5 h-4.5 text-navy-900" size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Client</div>
            <div className="font-medium text-gray-900 truncate">{quote.clients?.name ?? '—'}</div>
            {quote.clients?.email && <div className="text-xs text-gray-400 truncate">{quote.clients.email}</div>}
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-4.5 h-4.5 text-amber-500" size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Project</div>
            <div className="font-medium text-gray-900 truncate">{quote.projects?.project_name ?? '—'}</div>
            {quote.projects?.service_address && <div className="text-xs text-gray-400 truncate">{quote.projects.service_address}</div>}
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Calendar className="w-4.5 h-4.5 text-green-600" size={18} />
          </div>
          <div>
            <div className="text-xs text-gray-500">Valid until</div>
            {editing ? (
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="input text-sm py-1 mt-0.5" />
            ) : (
              <div className="font-medium text-gray-900">{validUntil ? formatDate(validUntil) : '—'}</div>
            )}
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Line Items</h2>
          {editing && (
            <button type="button" onClick={() => setLineItems((prev) => [...prev, newLineItem()])} className="btn-secondary text-xs px-3 py-2">
              <Plus size={13} /> Add row
            </button>
          )}
        </div>
        <LineItemsEditor items={lineItems} onChange={setLineItems} readOnly={!editing} currency={quote.currency} />
      </div>

      {/* Notes */}
      {(notesToClient || internalNotes || editing) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {(notesToClient || editing) && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Notes to client</h3>
              {editing ? (
                <textarea value={notesToClient} onChange={(e) => setNotesToClient(e.target.value)} className="input resize-none text-sm" rows={4} />
              ) : (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{notesToClient}</p>
              )}
            </div>
          )}
          {(internalNotes || editing) && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Internal notes</h3>
              {editing ? (
                <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="input resize-none text-sm" rows={4} />
              ) : (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{internalNotes}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Totals */}
      <div className="card ml-auto max-w-sm space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>{formatCurrency(editing ? subtotal : quote.subtotal, quote.currency)}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>{quote.tax_type ?? 'Tax'} ({((editing ? taxInfo.rate : quote.tax_rate ?? 0) * 100).toFixed(3).replace(/\.?0+$/, '')}%)</span>
          <span>{formatCurrency(editing ? taxAmount : quote.tax_amount, quote.currency)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold text-gray-900 pt-2 border-t border-gray-200">
          <span>Total ({quote.currency})</span>
          <span>{formatCurrency(editing ? total : quote.total, quote.currency)}</span>
        </div>
      </div>

      {/* ── Version History Panel ── */}
      {versions.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <button
            onClick={() => setShowVersions((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <History size={16} className="text-gray-400" />
              <span className="font-semibold text-gray-900 text-sm">Version History</span>
              <span className="badge bg-gray-100 text-gray-500">{versions.length}</span>
            </div>
            <ChevronDown size={16} className={cn('text-gray-400 transition-transform', showVersions && 'rotate-180')} />
          </button>
          {showVersions && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {versions.map((v) => {
                const snap = v.snapshot as { quote?: { total?: number } }
                return (
                  <div key={v.id} className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">Version {v.version_number}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{formatDate(v.created_at)}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {snap?.quote?.total != null && (
                        <span className="text-sm text-gray-500">{formatCurrency(snap.quote.total, quote.currency)}</span>
                      )}
                      <button
                        onClick={() => handleRestoreVersion(v)}
                        disabled={restoring === v.id}
                        className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 font-medium transition-colors disabled:opacity-50"
                      >
                        {restoring === v.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                        Restore
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Send Proposal Modal ── */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSendModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-serif text-lg text-navy-900">Send Proposal</h2>
              <button onClick={() => setShowSendModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {sendError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{sendError}</div>}

              {proposalUrl && !sending ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Proposal sent! Share this link with your client:</p>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                    <Link2 size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-600 truncate flex-1">{proposalUrl}</span>
                    <button onClick={copyUrl} className="text-xs font-medium text-navy-900 flex-shrink-0">
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <button onClick={() => setShowSendModal(false)} className="btn-primary w-full">Done</button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {/* Email option */}
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="mt-0.5 rounded" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">Send via email</div>
                        {quote.clients?.email ? (
                          <div className="text-xs text-gray-500">{quote.clients.email}</div>
                        ) : (
                          <div className="text-xs text-amber-600">No email on file for this client</div>
                        )}
                      </div>
                    </label>

                    {/* SMS option */}
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} className="mt-0.5 rounded" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 flex items-center gap-1">
                          <MessageSquare size={13} /> Send via SMS
                        </div>
                        {sendSms && (
                          <input
                            type="tel"
                            value={smsPhone}
                            onChange={(e) => setSmsPhone(e.target.value)}
                            className="input mt-1.5 text-sm"
                            placeholder="+1 (416) 555-0100"
                          />
                        )}
                      </div>
                    </label>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setShowSendModal(false)} className="btn-secondary flex-1">Cancel</button>
                    <button
                      onClick={handleSend}
                      disabled={sending || (!sendEmail && !sendSms)}
                      className="btn-primary flex-1"
                    >
                      {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {sending ? 'Sending…' : 'Send Proposal'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
