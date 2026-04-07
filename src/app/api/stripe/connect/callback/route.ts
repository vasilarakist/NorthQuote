import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// Stripe redirects here after Connect onboarding completes
export async function GET() {
  return NextResponse.redirect(`${APP_URL}/settings?stripe=connected`)
}
