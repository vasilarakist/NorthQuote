'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  FileText,
  Users,
  FolderOpen,
  BookOpen,
  Settings,
  Receipt,
  Menu,
  X,
  LogOut,
  ChevronRight,
  BarChart2,
  Gift,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/quotes', label: 'Quotes', icon: FileText },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/price-book', label: 'Price Book', icon: BookOpen },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/referrals', label: 'Referrals', icon: Gift },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  orgName?: string
  userEmail?: string
}

export function Sidebar({ orgName, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-navy-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <div className="min-w-0">
            <div className="font-serif text-lg text-white leading-tight truncate">NorthQuote</div>
            {orgName && (
              <div className="text-xs text-navy-400 truncate">{orgName}</div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-amber-500 text-white'
                      : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                  )}
                >
                  <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
                  {label}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto" size={14} />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom user section */}
      <div className="px-3 pb-4 border-t border-navy-800 pt-4">
        <div className="px-3 py-2 mb-1">
          <div className="text-xs text-navy-400 truncate">{userEmail}</div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-navy-300 hover:bg-navy-800 hover:text-white transition-colors"
        >
          <LogOut size={18} className="flex-shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 bg-navy-900 z-30">
        <NavContent />
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-navy-900 border-b border-navy-800">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-500 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">N</span>
            </div>
            <span className="font-serif text-lg text-white">NorthQuote</span>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg text-navy-300 hover:text-white hover:bg-navy-800 transition-colors"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-navy-900">
            <NavContent />
          </aside>
        </>
      )}
    </>
  )
}
