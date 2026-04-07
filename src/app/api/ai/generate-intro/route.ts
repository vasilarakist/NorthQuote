import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface GenerateIntroRequest {
  job_description: string
  trade_type: string
  line_items: { description: string; category: string; quantity: number; unit: string; total: number }[]
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: GenerateIntroRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { job_description, trade_type, line_items } = body

  if (!line_items?.length) {
    return NextResponse.json({ error: 'line_items are required' }, { status: 400 })
  }

  const itemsSummary = line_items
    .map((i) => `- ${i.description} (${i.category})`)
    .join('\n')

  const systemPrompt = `You are a professional ${trade_type || 'contractor'} writing a client-facing proposal intro.
Write 2-3 sentences in plain, friendly English that summarise the scope of work.
- Do NOT mention prices or dollar amounts
- Do NOT use technical jargon the homeowner won't understand
- Speak directly to the client (e.g. "We will…" or "This proposal covers…")
- Keep it concise and professional
Return ONLY the paragraph text — no headings, no bullets, no markdown.`

  const userMessage = `Job description: ${job_description || '(see line items)'}

Line items included in this quote:
${itemsSummary}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let intro: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')
    intro = content.text.trim()
  } catch (err) {
    console.error('AI generate-intro error:', err)
    return NextResponse.json({ error: 'Failed to generate intro.' }, { status: 500 })
  }

  return NextResponse.json({ intro })
}
