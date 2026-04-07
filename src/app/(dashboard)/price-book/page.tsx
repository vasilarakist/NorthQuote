import { createClient } from '@/lib/supabase/server'
import { PriceBookClient } from './PriceBookClient'

export default async function PriceBookPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userRecord } = await supabase
    .from('users')
    .select('organization_id, organizations(trade_type)')
    .eq('auth_id', user.id)
    .single()
  if (!userRecord) return null

  const orgRaw = userRecord.organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { trade_type: string | null } | null

  const { data: items } = await supabase
    .from('price_book_items')
    .select('*')
    .eq('organization_id', userRecord.organization_id)
    .order('name')

  return (
    <PriceBookClient
      initialItems={items ?? []}
      organizationId={userRecord.organization_id}
      tradeType={org?.trade_type ?? 'general'}
    />
  )
}
