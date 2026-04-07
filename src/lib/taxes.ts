export interface TaxInfo {
  rate: number   // decimal, e.g. 0.13
  type: string   // e.g. "HST", "GST+PST"
  label: string  // e.g. "HST (13%)"
}

// Canadian provincial tax rates for construction / trade services
const PROVINCE_TAX: Record<string, TaxInfo> = {
  AB: { rate: 0.05,    type: 'GST',     label: 'GST (5%)' },
  BC: { rate: 0.12,    type: 'GST+PST', label: 'GST + PST (12%)' },
  MB: { rate: 0.12,    type: 'GST+PST', label: 'GST + PST (12%)' },
  NB: { rate: 0.15,    type: 'HST',     label: 'HST (15%)' },
  NL: { rate: 0.15,    type: 'HST',     label: 'HST (15%)' },
  NS: { rate: 0.15,    type: 'HST',     label: 'HST (15%)' },
  NT: { rate: 0.05,    type: 'GST',     label: 'GST (5%)' },
  NU: { rate: 0.05,    type: 'GST',     label: 'GST (5%)' },
  ON: { rate: 0.13,    type: 'HST',     label: 'HST (13%)' },
  PE: { rate: 0.15,    type: 'HST',     label: 'HST (15%)' },
  QC: { rate: 0.14975, type: 'GST+QST', label: 'GST + QST (14.975%)' },
  SK: { rate: 0.11,    type: 'GST+PST', label: 'GST + PST (11%)' },
  YT: { rate: 0.05,    type: 'GST',     label: 'GST (5%)' },
}

export function getTaxInfo(provinceState: string | null | undefined): TaxInfo {
  if (!provinceState) return { rate: 0.05, type: 'GST', label: 'GST (5%)' }
  const key = provinceState.toUpperCase()
  return PROVINCE_TAX[key] ?? { rate: 0, type: 'None', label: 'No Tax' }
}

export function calcLineTotal(qty: number, unitPrice: number, markupPct: number): number {
  return qty * unitPrice * (1 + markupPct / 100)
}
