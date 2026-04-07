'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/types/database'
import { Users, Plus, Search, X, Phone, Mail, MapPin, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  initialClients: Client[]
  organizationId: string
}

type FormData = {
  name: string
  email: string
  phone: string
  address: string
  city: string
  province_state: string
  postal_zip: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  province_state: '',
  postal_zip: '',
  notes: '',
}

export function ClientsPageClient({ initialClients, organizationId }: Props) {
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return clients
    const q = search.toLowerCase()
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.city?.toLowerCase().includes(q)
    )
  }, [clients, search])

  function openAdd() {
    setEditingClient(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(client: Client) {
    setEditingClient(client)
    setForm({
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      city: client.city ?? '',
      province_state: client.province_state ?? '',
      postal_zip: client.postal_zip ?? '',
      notes: client.notes ?? '',
    })
    setError('')
    setShowModal(true)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const payload = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      city: form.city || null,
      province_state: form.province_state || null,
      postal_zip: form.postal_zip || null,
      notes: form.notes || null,
    }

    if (editingClient) {
      const { data, error: err } = await supabase
        .from('clients')
        .update(payload)
        .eq('id', editingClient.id)
        .select()
        .single()
      if (err) { setError(err.message); setLoading(false); return }
      setClients((prev) => prev.map((c) => (c.id === editingClient.id ? data : c)))
    } else {
      const { data, error: err } = await supabase
        .from('clients')
        .insert({ ...payload, organization_id: organizationId })
        .select()
        .single()
      if (err) { setError(err.message); setLoading(false); return }
      setClients((prev) => [data, ...prev])
    }

    setLoading(false)
    setShowModal(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this client? This cannot be undone.')) return
    setDeletingId(id)
    const supabase = createClient()
    const { error: err } = await supabase.from('clients').delete().eq('id', id)
    if (!err) setClients((prev) => prev.filter((c) => c.id !== id))
    setDeletingId(null)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Clients</h1>
          <p className="text-gray-500 text-sm mt-0.5">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openAdd} className="btn-amber">
          <Plus size={16} />
          Add Client
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients by name, email, phone…"
          className="input pl-9 max-w-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Client grid */}
      {filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <div key={client.id} className="card hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-navy-900 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-semibold">
                      {client.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{client.name}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => openEdit(client)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-navy-900 hover:bg-gray-100 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(client.id)}
                    disabled={deletingId === client.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {client.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Mail size={13} className="flex-shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Phone size={13} className="flex-shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {(client.city || client.province_state) && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <MapPin size={13} className="flex-shrink-0" />
                    <span>{[client.city, client.province_state].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>

              {client.notes && (
                <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 line-clamp-2">
                  {client.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card py-16 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="font-serif text-lg text-gray-700 mb-1">
            {search ? 'No clients found' : 'No clients yet'}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            {search ? 'Try a different search term' : 'Add your first client to get started'}
          </p>
          {!search && (
            <button onClick={openAdd} className="btn-amber">
              <Plus size={16} />
              Add Client
            </button>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-serif text-lg text-navy-900">
                {editingClient ? 'Edit Client' : 'Add New Client'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="label">Full name <span className="text-red-500">*</span></label>
                <input
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={handleChange}
                  className="input"
                  placeholder="John Smith"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Email</label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    className="input"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    className="input"
                    placeholder="+1 (416) 555-0100"
                  />
                </div>
              </div>

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

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
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
                  <label className="label">Prov/State</label>
                  <input
                    name="province_state"
                    type="text"
                    value={form.province_state}
                    onChange={handleChange}
                    className="input"
                    placeholder="ON"
                    maxLength={3}
                  />
                </div>
              </div>

              <div>
                <label className="label">Postal / ZIP</label>
                <input
                  name="postal_zip"
                  type="text"
                  value={form.postal_zip}
                  onChange={handleChange}
                  className="input max-w-[200px]"
                  placeholder="M5V 2T6"
                />
              </div>

              <div>
                <label className="label">Notes <span className="text-gray-400 font-normal">(internal)</span></label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  className={cn('input resize-none')}
                  rows={3}
                  placeholder="Any notes about this client…"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Saving…' : editingClient ? 'Save Changes' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
