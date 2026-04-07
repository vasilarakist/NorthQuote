'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project, ProjectStatus } from '@/types/database'
import { FolderOpen, Plus, X, MapPin, User, Pencil, Trash2, CheckCircle2, Archive, Clock } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

interface ClientOption {
  id: string
  name: string
}

interface Props {
  initialProjects: (Project & { clients: { id: string; name: string; email: string | null; phone: string | null } | null })[]
  clients: ClientOption[]
  organizationId: string
}

type FormData = {
  client_id: string
  project_name: string
  service_address: string
  status: ProjectStatus
}

const EMPTY_FORM: FormData = {
  client_id: '',
  project_name: '',
  service_address: '',
  status: 'active',
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'active', label: 'Active', icon: <Clock size={13} />, color: 'bg-green-100 text-green-700' },
  { value: 'completed', label: 'Completed', icon: <CheckCircle2 size={13} />, color: 'bg-blue-100 text-blue-700' },
  { value: 'archived', label: 'Archived', icon: <Archive size={13} />, color: 'bg-gray-100 text-gray-600' },
]

export function ProjectsPageClient({ initialProjects, clients, organizationId }: Props) {
  type ProjectWithClient = Props['initialProjects'][number]

  const [projects, setProjects] = useState<ProjectWithClient[]>(initialProjects)
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectWithClient | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return projects
    return projects.filter((p) => p.status === statusFilter)
  }, [projects, statusFilter])

  const counts = useMemo(() => ({
    all: projects.length,
    active: projects.filter((p) => p.status === 'active').length,
    completed: projects.filter((p) => p.status === 'completed').length,
    archived: projects.filter((p) => p.status === 'archived').length,
  }), [projects])

  function openAdd() {
    setEditingProject(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(project: ProjectWithClient) {
    setEditingProject(project)
    setForm({
      client_id: project.client_id,
      project_name: project.project_name,
      service_address: project.service_address,
      status: project.status,
    })
    setError('')
    setShowModal(true)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()

    if (editingProject) {
      const { data, error: err } = await supabase
        .from('projects')
        .update({
          client_id: form.client_id,
          project_name: form.project_name,
          service_address: form.service_address,
          status: form.status,
        })
        .eq('id', editingProject.id)
        .select('*, clients(id, name, email, phone)')
        .single()
      if (err) { setError(err.message); setLoading(false); return }
      setProjects((prev) => prev.map((p) => (p.id === editingProject.id ? data : p)))
    } else {
      const { data, error: err } = await supabase
        .from('projects')
        .insert({
          organization_id: organizationId,
          client_id: form.client_id,
          project_name: form.project_name,
          service_address: form.service_address,
          status: form.status,
        })
        .select('*, clients(id, name, email, phone)')
        .single()
      if (err) { setError(err.message); setLoading(false); return }
      setProjects((prev) => [data, ...prev])
    }

    setLoading(false)
    setShowModal(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this project? This cannot be undone.')) return
    setDeletingId(id)
    const supabase = createClient()
    const { error: err } = await supabase.from('projects').delete().eq('id', id)
    if (!err) setProjects((prev) => prev.filter((p) => p.id !== id))
    setDeletingId(null)
  }

  function getStatusConfig(status: ProjectStatus) {
    return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0]
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Projects</h1>
          <p className="text-gray-500 text-sm mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={openAdd} className="btn-amber">
          <Plus size={16} />
          New Project
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['all', 'active', 'completed', 'archived'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
              statusFilter === status
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            <span className={cn(
              'ml-1.5 text-xs rounded-full px-1.5 py-0.5',
              statusFilter === status ? 'bg-navy-900 text-white' : 'bg-gray-200 text-gray-600'
            )}>
              {counts[status]}
            </span>
          </button>
        ))}
      </div>

      {/* Projects grid */}
      {filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const statusConfig = getStatusConfig(project.status)
            return (
              <div key={project.id} className="card hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FolderOpen className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 leading-tight">{project.project_name}</h3>
                      <span className={cn('badge mt-1', statusConfig.color)}>
                        <span className="flex items-center gap-1">
                          {statusConfig.icon}
                          {statusConfig.label}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => openEdit(project)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-navy-900 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      disabled={deletingId === project.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 mt-3">
                  {project.clients && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <User size={13} className="flex-shrink-0" />
                      <span className="truncate">{project.clients.name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <MapPin size={13} className="flex-shrink-0" />
                    <span className="truncate">{project.service_address}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    Created {formatDate(project.created_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card py-16 text-center">
          <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="font-serif text-lg text-gray-700 mb-1">
            {statusFilter !== 'all' ? `No ${statusFilter} projects` : 'No projects yet'}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            {statusFilter !== 'all'
              ? 'Try a different filter'
              : 'Create a project to start generating quotes'}
          </p>
          {statusFilter === 'all' && clients.length === 0 && (
            <p className="text-amber-600 text-sm mb-4">
              You need at least one client before creating a project.
            </p>
          )}
          {statusFilter === 'all' && clients.length > 0 && (
            <button onClick={openAdd} className="btn-amber">
              <Plus size={16} />
              New Project
            </button>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-serif text-lg text-navy-900">
                {editingProject ? 'Edit Project' : 'New Project'}
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

              {clients.length === 0 ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                  You need to add a client first before creating a project.
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">Client <span className="text-red-500">*</span></label>
                    <select
                      name="client_id"
                      value={form.client_id}
                      onChange={handleChange}
                      className="input"
                      required
                    >
                      <option value="">Select a client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">Project name <span className="text-red-500">*</span></label>
                    <input
                      name="project_name"
                      type="text"
                      value={form.project_name}
                      onChange={handleChange}
                      className="input"
                      placeholder="Kitchen Reno – Panel Upgrade"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Service address <span className="text-red-500">*</span></label>
                    <input
                      name="service_address"
                      type="text"
                      value={form.service_address}
                      onChange={handleChange}
                      className="input"
                      placeholder="456 Oak Ave, Toronto, ON M4C 1A1"
                      required
                    />
                  </div>

                  {editingProject && (
                    <div>
                      <label className="label">Status</label>
                      <select
                        name="status"
                        value={form.status}
                        onChange={handleChange}
                        className="input"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={loading} className="btn-primary flex-1">
                      {loading ? 'Saving…' : editingProject ? 'Save Changes' : 'Create Project'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
