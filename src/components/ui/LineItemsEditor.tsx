'use client'

import { useCallback } from 'react'
import { Plus, Trash2, Sparkles } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { calcLineTotal } from '@/lib/taxes'
import type { LineItemCategory } from '@/types/database'

export interface LineItemDraft {
  _id: string
  description: string
  category: LineItemCategory
  quantity: number
  unit: string
  unit_price: number
  markup_percent: number
  total: number
  ai_generated?: boolean
}

const CATEGORIES: { value: LineItemCategory; label: string; color: string }[] = [
  { value: 'material', label: 'Material',  color: 'bg-blue-100 text-blue-700' },
  { value: 'labour',   label: 'Labour',    color: 'bg-green-100 text-green-700' },
  { value: 'permit',   label: 'Permit',    color: 'bg-orange-100 text-orange-700' },
  { value: 'other',    label: 'Other',     color: 'bg-gray-100 text-gray-600' },
]

function catColor(cat: LineItemCategory) {
  return CATEGORIES.find((c) => c.value === cat)?.color ?? 'bg-gray-100 text-gray-600'
}

function newItem(): LineItemDraft {
  return {
    _id: crypto.randomUUID(),
    description: '',
    category: 'material',
    quantity: 1,
    unit: 'each',
    unit_price: 0,
    markup_percent: 20,
    total: 0,
    ai_generated: false,
  }
}

interface Props {
  items: LineItemDraft[]
  onChange: (items: LineItemDraft[]) => void
  readOnly?: boolean
  currency?: string
}

export function LineItemsEditor({ items, onChange, readOnly = false, currency = 'CAD' }: Props) {
  const update = useCallback(
    (id: string, field: keyof LineItemDraft, value: string | number | boolean) => {
      onChange(
        items.map((item) => {
          if (item._id !== id) return item
          const updated = { ...item, [field]: value }
          updated.total = calcLineTotal(
            Number(updated.quantity),
            Number(updated.unit_price),
            Number(updated.markup_percent)
          )
          return updated
        })
      )
    },
    [items, onChange]
  )

  const remove = useCallback(
    (id: string) => onChange(items.filter((i) => i._id !== id)),
    [items, onChange]
  )

  const add = useCallback(() => onChange([...items, newItem()]), [items, onChange])

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-[35%]">Description</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-[12%]">Category</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-[8%]">Qty</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-[7%]">Unit</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-[12%]">Unit Price</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-[9%]">Markup %</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-[12%]">Total</th>
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 7 : 8} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No line items yet — generate with AI or add manually.
                </td>
              </tr>
            )}
            {items.map((item, idx) => (
              <tr key={item._id} className={cn('group', item.ai_generated && 'bg-amber-50/30')}>
                <td className="px-2 py-1.5">
                  <div className="flex items-start gap-1.5">
                    {item.ai_generated && (
                      <Sparkles size={12} className="text-amber-500 mt-2 flex-shrink-0" />
                    )}
                    {readOnly ? (
                      <span className="py-1.5 text-gray-900">{item.description || '—'}</span>
                    ) : (
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => update(item._id, 'description', e.target.value)}
                        placeholder={`Line item ${idx + 1}`}
                        className="w-full rounded border-0 bg-transparent px-1 py-1.5 text-sm text-gray-900 placeholder-gray-300 focus:bg-white focus:ring-1 focus:ring-navy-900/20 focus:outline-none"
                      />
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  {readOnly ? (
                    <span className={cn('badge capitalize', catColor(item.category))}>{item.category}</span>
                  ) : (
                    <select
                      value={item.category}
                      onChange={(e) => update(item._id, 'category', e.target.value)}
                      className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-xs focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900/10"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {readOnly ? (
                    <span className="text-right block text-gray-900">{item.quantity}</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => update(item._id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-right text-sm focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900/10"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {readOnly ? (
                    <span className="text-gray-600">{item.unit}</span>
                  ) : (
                    <input
                      type="text"
                      value={item.unit}
                      onChange={(e) => update(item._id, 'unit', e.target.value)}
                      placeholder="each"
                      className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-sm focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900/10"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {readOnly ? (
                    <span className="text-right block text-gray-900">{formatCurrency(item.unit_price, currency)}</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => update(item._id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-right text-sm focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900/10"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {readOnly ? (
                    <span className="text-right block text-gray-600">{item.markup_percent}%</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max="200"
                      step="1"
                      value={item.markup_percent}
                      onChange={(e) => update(item._id, 'markup_percent', parseFloat(e.target.value) || 0)}
                      className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-right text-sm focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900/10"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5 text-right font-medium text-gray-900">
                  {formatCurrency(item.total, currency)}
                </td>
                {!readOnly && (
                  <td className="px-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => remove(item._id)}
                      className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {items.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg">
            No line items yet
          </div>
        )}
        {items.map((item, idx) => (
          <div key={item._id} className={cn('border border-gray-200 rounded-lg p-3 space-y-2', item.ai_generated && 'border-amber-200 bg-amber-50/30')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {item.ai_generated && <Sparkles size={12} className="text-amber-500 flex-shrink-0" />}
                {readOnly ? (
                  <span className="font-medium text-sm text-gray-900 truncate">{item.description || `Item ${idx + 1}`}</span>
                ) : (
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => update(item._id, 'description', e.target.value)}
                    placeholder={`Line item ${idx + 1}`}
                    className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900/10"
                  />
                )}
              </div>
              {!readOnly && (
                <button type="button" onClick={() => remove(item._id)} className="p-1.5 text-gray-400 hover:text-red-500 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-gray-500 mb-0.5">Category</div>
                {readOnly ? (
                  <span className={cn('badge capitalize', catColor(item.category))}>{item.category}</span>
                ) : (
                  <select
                    value={item.category}
                    onChange={(e) => update(item._id, 'category', e.target.value)}
                    className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-xs focus:outline-none"
                  >
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                )}
              </div>
              <div>
                <div className="text-gray-500 mb-0.5">Qty / Unit</div>
                {readOnly ? (
                  <span className="text-gray-900">{item.quantity} {item.unit}</span>
                ) : (
                  <div className="flex gap-1">
                    <input type="number" min="0" step="0.01" value={item.quantity}
                      onChange={(e) => update(item._id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-12 rounded border border-gray-200 bg-white px-1 py-1 text-xs text-right focus:outline-none"
                    />
                    <input type="text" value={item.unit}
                      onChange={(e) => update(item._id, 'unit', e.target.value)}
                      className="w-12 rounded border border-gray-200 bg-white px-1 py-1 text-xs focus:outline-none"
                    />
                  </div>
                )}
              </div>
              <div>
                <div className="text-gray-500 mb-0.5">Total</div>
                <div className="font-semibold text-gray-900">{formatCurrency(item.total, currency)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="mt-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-900 transition-colors"
        >
          <Plus size={15} />
          Add line item
        </button>
      )}
    </div>
  )
}

export { newItem as newLineItem }
