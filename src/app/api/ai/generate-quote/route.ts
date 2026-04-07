import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PriceBookItem } from '@/types/database'

interface GenerateQuoteRequest {
  description: string
  trade_type: string
  province_state: string
  price_book_items?: Pick<PriceBookItem, 'name' | 'category' | 'unit' | 'unit_price' | 'markup_percent'>[]
}

interface LineItemResult {
  description: string
  category: 'material' | 'labour' | 'permit' | 'other'
  quantity: number
  unit: string
  unit_price: number
  markup_percent: number
}

function extractJSON(text: string): unknown {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = codeBlock ? codeBlock[1].trim() : text.trim()
  return JSON.parse(raw)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: GenerateQuoteRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { description, trade_type, province_state, price_book_items = [] } = body

  if (!description?.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const priceBookContext = price_book_items.length > 0
    ? `\n\nThe contractor has the following items in their price book — use these exact prices and markup rates if the items match the job:\n${JSON.stringify(price_book_items, null, 2)}`
    : ''

  const systemPrompt = `You are an expert Canadian trades estimator specializing in ${trade_type || 'general contracting'}.
Your job is to produce detailed, accurate cost estimates for jobs in Canadian provinces/territories.

When given a job description you must return ONLY valid JSON — no prose, no markdown, no explanation.
The JSON must be an object with a single key "line_items" containing an array of line item objects.

Each line item object must have exactly these keys:
- "description": string — clear, professional description (e.g. "20A circuit breaker panel — 200A main")
- "category": one of "material" | "labour" | "permit" | "other"
- "quantity": number (positive)
- "unit": string — appropriate unit (e.g. "hr", "each", "lf", "sf", "ls")
- "unit_price": number — in CAD, realistic for the province (${province_state || 'ON'})
- "markup_percent": number — typical markup for category (materials: 20-35%, labour: 10-20%, permits: 0%)

Guidelines:
- Separate materials and labour into distinct line items
- Include permits/inspections if typically required for the trade and scope
- Use realistic Canadian market pricing for ${province_state || 'ON'}
- A typical residential job should have 4-12 line items
- For labour, account for realistic hours; journeyperson rate in ${province_state || 'ON'} is typically $85-115/hr
${priceBookContext}`

  const userMessage = `Generate a detailed line-item estimate for the following job:\n\n${description.trim()}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let lineItems: LineItemResult[]
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type from AI')

    const parsed = extractJSON(content.text) as { line_items: LineItemResult[] }
    if (!Array.isArray(parsed.line_items)) throw new Error('AI response missing line_items array')

    lineItems = parsed.line_items.map((item) => ({
      description: String(item.description ?? ''),
      category: (['material', 'labour', 'permit', 'other'].includes(item.category) ? item.category : 'other') as LineItemResult['category'],
      quantity: Number(item.quantity) || 1,
      unit: String(item.unit ?? 'each'),
      unit_price: Number(item.unit_price) || 0,
      markup_percent: Number(item.markup_percent) || 0,
    }))
  } catch (err) {
    console.error('AI generate-quote error:', err)
    return NextResponse.json(
      { error: 'Failed to generate quote. Please try again or add line items manually.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ line_items: lineItems })
}
