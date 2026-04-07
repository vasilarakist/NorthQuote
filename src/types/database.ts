export type UserRole = 'owner' | 'member'
export type ProjectStatus = 'active' | 'completed' | 'archived'
export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired'
export type QuoteTier = 'single' | 'good' | 'better' | 'best'
export type LineItemCategory = 'material' | 'labour' | 'permit' | 'other'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export type FollowUpChannel = 'sms' | 'email'
export type FollowUpStatus = 'pending' | 'sent' | 'cancelled'
export type ReferralStatus = 'pending' | 'converted' | 'credited'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
export type SubscriptionPlan = 'starter' | 'pro' | 'scale'

export interface Organization {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  province_state: string | null
  postal_zip: string | null
  country: string
  logo_url: string | null
  brand_color_primary: string | null
  brand_color_secondary: string | null
  gst_hst_number: string | null
  tax_province: string | null
  trade_type: string | null
  stripe_account_id: string | null
  subscription_status: SubscriptionStatus | null
  subscription_plan: SubscriptionPlan | null
  referral_code: string | null
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  organization_id: string
  email: string
  full_name: string | null
  role: UserRole
  auth_id: string | null
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  organization_id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  province_state: string | null
  postal_zip: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  organization_id: string
  client_id: string
  project_name: string
  service_address: string
  status: ProjectStatus
  created_at: string
  updated_at: string
  // joined
  clients?: Pick<Client, 'id' | 'name' | 'email' | 'phone'>
}

export interface Quote {
  id: string
  organization_id: string
  project_id: string
  client_id: string
  quote_number: string
  version: number
  status: QuoteStatus
  tier: QuoteTier
  subtotal: number
  tax_amount: number
  tax_rate: number | null
  tax_type: string | null
  total: number
  currency: string
  valid_until: string | null
  ai_generated: boolean
  ai_prompt: string | null
  notes_to_client: string | null
  internal_notes: string | null
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  declined_at: string | null
  signature_data: string | null
  signature_ip: string | null
  created_at: string
  updated_at: string
  // joined
  clients?: Pick<Client, 'id' | 'name' | 'email'>
  projects?: Pick<Project, 'id' | 'project_name'>
}

export interface QuoteLineItem {
  id: string
  quote_id: string
  position: number
  description: string
  category: LineItemCategory
  quantity: number
  unit: string | null
  unit_price: number
  markup_percent: number | null
  total: number
  from_price_book: boolean
  price_book_item_id: string | null
  created_at: string
}

export interface QuoteVersion {
  id: string
  quote_id: string
  version_number: number
  snapshot: Record<string, unknown>
  created_by: string | null
  created_at: string
}

export interface PriceBookItem {
  id: string
  organization_id: string
  name: string
  description: string | null
  category: LineItemCategory
  default_quantity: number | null
  unit: string | null
  unit_price: number
  markup_percent: number | null
  trade_type: string | null
  usage_count: number
  created_at: string
  updated_at: string
}

export interface Invoice {
  id: string
  organization_id: string
  quote_id: string | null
  project_id: string
  client_id: string
  invoice_number: string
  status: InvoiceStatus
  amount: number
  tax_amount: number
  total: number
  currency: string
  due_date: string | null
  paid_at: string | null
  stripe_payment_intent_id: string | null
  payment_method: string | null
  created_at: string
  updated_at: string
}

export interface FollowUp {
  id: string
  organization_id: string
  quote_id: string | null
  invoice_id: string | null
  type: string
  channel: FollowUpChannel
  scheduled_at: string
  sent_at: string | null
  status: FollowUpStatus
  created_at: string
}

export interface Referral {
  id: string
  referrer_org_id: string
  referred_org_id: string | null
  referral_code_used: string
  status: ReferralStatus
  credit_amount: number | null
  credited_at: string | null
  created_at: string
}

export interface QuoteEvent {
  id: string
  quote_id: string
  event_type: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// Insert types (omit auto-generated fields)
export type InsertOrganization = Omit<Organization, 'id' | 'created_at' | 'updated_at'>
export type InsertUser = Omit<User, 'id' | 'created_at' | 'updated_at'>
export type InsertClient = Omit<Client, 'id' | 'created_at' | 'updated_at'>
export type InsertProject = Omit<Project, 'id' | 'created_at' | 'updated_at' | 'clients'>
export type InsertQuote = Omit<Quote, 'id' | 'created_at' | 'updated_at' | 'clients' | 'projects'>
export type InsertQuoteLineItem = Omit<QuoteLineItem, 'id' | 'created_at'>
export type InsertPriceBookItem = Omit<PriceBookItem, 'id' | 'created_at' | 'updated_at'>
export type InsertInvoice = Omit<Invoice, 'id' | 'created_at' | 'updated_at'>
export type InsertFollowUp = Omit<FollowUp, 'id' | 'created_at'>

// Update types (all optional)
export type UpdateOrganization = Partial<InsertOrganization>
export type UpdateClient = Partial<InsertClient>
export type UpdateProject = Partial<InsertProject>
export type UpdateQuote = Partial<InsertQuote>
