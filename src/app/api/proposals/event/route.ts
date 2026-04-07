import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function POST(request: Request) {
  const { quote_id, event_type } = await request.json()
  if (!quote_id || !event_type) {
    return NextResponse.json({ error: 'quote_id and event_type required' }, { status: 400 })
  }

  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() ?? null

  const supabase = await createServiceClient()
  await supabase.from('quote_events').insert({
    quote_id,
    event_type,
    ip_address: ip,
    user_agent: headersList.get('user-agent'),
  })

  return NextResponse.json({ ok: true })
}
