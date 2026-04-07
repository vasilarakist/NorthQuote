'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PriceBookItem, LineItemCategory } from '@/types/database'
import { BookOpen, Plus, Search, X, Pencil, Trash2 } from 'lucide-react'
import { formatCurrency, TRADE_TYPES, cn } from '@/lib/utils'

interface Props {
  initialItems: PriceBookItem[]
  organizationId: string
  tradeType: string
}

type FormData = {
  name: string
  description: string
  category: LineItemCategory
  default_quantity: string
  unit: string
  unit_price: string
  markup_percent: string
  trade_type: string
}

const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  category: 'material',
  default_quantity: '1',
  unit: 'each',
  unit_price: '',
  markup_percent: '20',
  trade_type: '',
}

const CATEGORIES: { value: LineItemCategory; label: string; color: string }[] = [
  { value: 'material', label: 'Material', color: 'bg-blue-100 text-blue-700' },
  { value: 'labour',   label: 'Labour',   color: 'bg-green-100 text-green-700' },
  { value: 'permit',   label: 'Permit',   color: 'bg-orange-100 text-orange-700' },
  { value: 'other',    label: 'Other',    color: 'bg-gray-100 text-gray-600' },
]

function catColor(cat: LineItemCategory) {
  return CATEGORIES.find((c) => c.value === cat)?.color ?? 'bg-gray-100 text-gray-600'
}

export function PriceBookClient({ initialItems, organizationId, tradeType }: Props) {
  const [items, setItems] = useState<PriceBookItem[]>(initialItems)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<LineItemCategory | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<PriceBookItem | null>(null)
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM, trade_type: tradeType })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let result = items
    if (categoryFilter !== 'all') result = result.filter((i) => i.category === categoryFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
      )
    }
    return result
  }, [items, search, categoryFilter])

  function openAdd() {
    setEditingItem(null)
    setForm({ ...EMPTY_FORM, trade_type: tradeType })
    setError('')
    setShowModal(true)
  }

  function openEdit(item: PriceBookItem) {
    setEditingItem(item)
    setForm({
      name: item.name,
      description: item.description ?? '',
      category: item.category,
      default_quantity: String(item.default_quantity ?? 1),
      unit: item.unit ?? 'each',
      unit_price: String(item.unit_price),
      markup_percent: String(item.markup_percent ?? 20),
      trade_type: item.trade_type ?? tradeType,
    })
    setError('')
    setShowModal(true)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()

    const payload = {
      name: form.name,
      description: form.description || null,
      category: form.category,
      default_quantity: parseFloat(form.default_quantity) || 1,
      unit: form.unit || null,
      unit_price: parseFloat(form.unit_price) || 0,
      markup_percent: parseFloat(form.markup_percent) || 0,
      trade_type: form.trade_type || null,
    }

    if (editingItem) {
      const { data, error: err } = await supabase
        .from('price_book_items')
        .update(payload)
        .eq('id', editingItem.id)
        .select()
        .single()
      if (err) { setError(err.message); setLoading(false); return }
      setItems((prev) => prev.map((i) => (i.id === editingItem.id ? data : i)))
    } else {
      const { data, error: err } = await supabase
        .from('price_book_items')
        .insert({ ...payload, organization_id: organizationId })
        .select()
        .single()
      if (err) { setError(err.message); setLoading(false); return }
      setItems((prev) => [data, ...prev])
    }

    setLoading(false)
    setShowModal(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this price book item?')) return
    setDeletingId(id)
    const supabase = createClient()
    const { error: err } = await supabase.from('price_book_items').delete().eq('id', id)
    if (!err) setItems((prev) => prev.filter((i) => i.id !== id))
    setDeletingId(null)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Price Book</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {items.length} item{items.length !== 1 ? 's' : ''} — used in AI quote generation
          </p>
        </div>
        <button onClick={openAdd} className="btn-amber">
          <Plus size={16} />
          Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="input pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          {(['all', 'material', 'labour', 'permit', 'other'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
                categoryFilter === cat ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Unit Price</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Markup</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Unit</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Used</th>
                  <th className="w-20 px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900">{item.name}</div>
                      {item.description && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{item.description}</div>}
                    </td>
                    <td className="px-6 py-3">
                      <span className={cn('badge capitalize', catColor(item.category))}>{item.category}</span>
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600">
                      {item.markup_percent ?? 0}%
                    </td>
                    <td className="px-6 py-3 text-gray-600">{item.unit ?? '—'}</td>
                    <td className="px-6 py-3 text-right text-gray-400 text-xs">{item.usage_count}×</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 rounded text-gray-400 hover:text-navy-900 hover:bg-gray-100 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-serif text-lg text-gray-700 mb-1">
              {search || categoryFilter !== 'all' ? 'No items match your filter' : 'Price book is empty'}
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              {search || categoryFilter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Add materials, labour rates, and common items — the AI will use your prices when generating quotes.'}
            </p>
            {!search && categoryFilter === 'all' && (
              <button onClick={openAdd} className="btn-amber">
                <Plus size={16} />
                Add First Item
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-serif text-lg text-navy-900">
                {editingItem ? 'Edit Item' : 'Add Price Book Item'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              <div>
                <label className="label">Item name <span className="text-red-500">*</span></label>
                <input name="name" type="text" value={form.name} onChange={handleChange} className="input" placeholder="e.g. 20A Circuit Breaker" required />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} className="input resize-none" rows={2} placeholder="Optional description or specs…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category <span className="text-red-500">*</span></label>
                  <select name="category" value={form.category} onChange={handleChange} className="input">
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Trade type</label>
                  <select name="trade_type" value={form.trade_type} onChange={handleChange} className="input">
                    <option value="">Any</option>
                    {TRADE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Unit price <span className="text-red-500">*</span></label>
                  <input name="unit_price" type="number" min="0" step="0.01" value={form.unit_price} onChange={handleChange} className="input" placeholder="0.00" required />
                </div>
                <div>
                  <label className="label">Markup %</label>
                  <input name="markup_percent" type="number" min="0" max="500" step="1" value={form.markup_percent} onChange={handleChange} className="input" />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input name="unit" type="text" value={form.unit} onChange={handleChange} className="input" placeholder="each" />
                </div>
              </div>
              <div>
                <label className="label">Default quantity</label>
                <input name="default_quantity" type="number" min="0.01" step="0.01" value={form.default_quantity} onChange={handleChange} className="input max-w-[120px]" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Saving…' : editingItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
