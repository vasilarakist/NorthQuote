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

/** Extract a stated dollar target from the description, e.g. "$10,000", "10k", "$8.5k" → number */
function extractTargetPrice(description: string): number | null {
  // Dollar sign + number + optional k/K multiplier (e.g. $10,000 / $10k / $8.5k)
  const dollarK = description.match(/\$\s*([\d,]+(?:\.\d+)?)\s*k\b/i)
  if (dollarK) {
    const v = parseFloat(dollarK[1].replace(/,/g, '')) * 1000
    if (v >= 100) return v
  }

  const dollar = description.match(/\$\s*([\d,]+(?:\.\d{1,2})?)(?!\s*k\b)/i)
  if (dollar) {
    const v = parseFloat(dollar[1].replace(/,/g, ''))
    if (v >= 100) return v
  }

  // Bare number + k (e.g. "10k bathroom") — only when directly adjacent to the multiplier
  const bareK = description.match(/\b([\d,]+(?:\.\d+)?)\s*k\b/i)
  if (bareK) {
    const v = parseFloat(bareK[1].replace(/,/g, '')) * 1000
    if (v >= 100) return v
  }

  return null
}

/** Sum of qty × unit_price × (1 + markup/100) for all line items */
function computeBilledTotal(items: LineItemResult[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price * (1 + item.markup_percent / 100), 0)
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

  const targetPrice = extractTargetPrice(description)

  const priceBookContext = price_book_items.length > 0
    ? `\n\nThe contractor has the following items in their price book — use these exact prices and markup rates if the items match the job:\n${JSON.stringify(price_book_items, null, 2)}`
    : ''

  const pricingRule = targetPrice != null
    ? `CRITICAL PRICING RULE — A TARGET PRICE IS STATED:
The contractor has stated a target price of $${targetPrice.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.

You MUST produce line items whose billed totals sum to EXACTLY this target (within 1%).

The billed total formula for each line item is:
  item_total = quantity × unit_price × (1 + markup_percent / 100)

The overall billed total = SUM of all item_totals.

Steps you MUST follow:
1. Decide how to distribute the $${targetPrice.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} realistically across materials, labour, and permits for this trade and scope.
2. Choose realistic quantities and unit prices so each item_total makes sense on its own.
3. BEFORE writing the JSON, verify your math: add up every (quantity × unit_price × (1 + markup_percent/100)) and confirm the sum equals $${targetPrice.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} within 1%.
4. If your sum is off, adjust the unit_price of the LAST labour line item (or the largest line item) to make the total exact. Recalculate and confirm before outputting.
5. Output ONLY the JSON — do NOT output your working or any prose.`
    : `PRICING RULE — NO TARGET PRICE STATED:
Generate your best market-rate estimate using realistic Canadian pricing for ${province_state || 'ON'}.
If the contractor mentions a budget or price later, you would work backwards — but for now, estimate normally.`

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

${pricingRule}

General guidelines:
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

  // Post-processing: if a target price was stated and the AI total is off by more than 2%,
  // proportionally scale all unit_prices to hit the target exactly.
  if (targetPrice != null && lineItems.length > 0) {
    const actualTotal = computeBilledTotal(lineItems)
    const delta = Math.abs(actualTotal - targetPrice) / targetPrice
    if (delta > 0.02) {
      console.log(`[generate-quote] AI total ${actualTotal.toFixed(2)} vs target ${targetPrice} (${(delta * 100).toFixed(1)}% off) — scaling unit prices`)
      const scaleFactor = targetPrice / actualTotal
      lineItems = lineItems.map((item) => ({
        ...item,
        unit_price: Math.round(item.unit_price * scaleFactor * 100) / 100,
      }))
    }
  }

  return NextResponse.json({ line_items: lineItems })
}
