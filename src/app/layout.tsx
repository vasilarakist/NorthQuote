import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NorthQuote — AI-Powered Quoting for Canadian Tradespeople',
  description: 'Generate professional quotes in minutes. Built for electricians, plumbers, HVAC, roofers, and general contractors.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
