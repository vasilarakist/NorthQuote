-- ============================================================
-- Phase 3: Proposals, Delivery & Payments
-- ============================================================

-- Proposal token on quotes (unique shareable URL)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS proposal_token UUID UNIQUE DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_quotes_proposal_token ON quotes(proposal_token);

-- Follow-up settings on organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS follow_up_settings JSONB DEFAULT '{
  "quote_not_opened_hours": 24,
  "quote_not_accepted_hours": 72,
  "invoice_overdue_days": 3,
  "sms_enabled": true,
  "email_enabled": true
}'::jsonb;

-- Line items snapshot + extra fields on invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes_to_client TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE;

-- Allow public lookup of quotes via proposal_token
CREATE POLICY "quotes_public_view_by_token" ON quotes
  FOR SELECT USING (
    proposal_token IS NOT NULL
    AND status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
  );

-- Allow public insert on quote_events (already handled in 002, but ensure it exists)
-- (no-op if policy already exists)
