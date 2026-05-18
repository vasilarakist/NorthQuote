-- ============================================================
-- Migration 007: Payment Milestones
-- ============================================================
-- Run this in the Supabase SQL Editor

-- ── Enums ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE milestone_status AS ENUM ('pending', 'requested', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE milestone_trigger AS ENUM ('on_acceptance', 'manual', 'on_date');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Add has_payment_schedule to quotes ────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS has_payment_schedule BOOLEAN NOT NULL DEFAULT FALSE;

-- ── payment_milestones table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_milestones (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id                  UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  label                     TEXT NOT NULL,
  amount_cents              INTEGER,          -- computed at quote save time
  percentage                NUMERIC(5,2),     -- null for fixed-amount milestones
  trigger_type              milestone_trigger NOT NULL DEFAULT 'manual',
  trigger_date              DATE,             -- only for 'on_date' trigger
  status                    milestone_status  NOT NULL DEFAULT 'pending',
  paid_at                   TIMESTAMPTZ,
  stripe_payment_intent_id  TEXT,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Updated-at trigger ────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_payment_milestones_updated_at ON payment_milestones;
CREATE TRIGGER trg_payment_milestones_updated_at
  BEFORE UPDATE ON payment_milestones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Index ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payment_milestones_quote_id ON payment_milestones(quote_id);

-- ── Enable RLS ────────────────────────────────────────────────────
ALTER TABLE payment_milestones ENABLE ROW LEVEL SECURITY;

-- Contractors can view their own milestones
DROP POLICY IF EXISTS "payment_milestones_org_select" ON payment_milestones;
CREATE POLICY "payment_milestones_org_select" ON payment_milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN users u ON u.organization_id = q.organization_id
      WHERE q.id = payment_milestones.quote_id
        AND u.auth_id = auth.uid()
    )
  );

-- Contractors can insert milestones for their quotes
DROP POLICY IF EXISTS "payment_milestones_org_insert" ON payment_milestones;
CREATE POLICY "payment_milestones_org_insert" ON payment_milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN users u ON u.organization_id = q.organization_id
      WHERE q.id = payment_milestones.quote_id
        AND u.auth_id = auth.uid()
    )
  );

-- Contractors can update their milestones (e.g. request payment)
DROP POLICY IF EXISTS "payment_milestones_org_update" ON payment_milestones;
CREATE POLICY "payment_milestones_org_update" ON payment_milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN users u ON u.organization_id = q.organization_id
      WHERE q.id = payment_milestones.quote_id
        AND u.auth_id = auth.uid()
    )
  );

-- Public can view milestones for active proposals (via proposal_token)
-- Required for the proposal and milestone payment pages
DROP POLICY IF EXISTS "payment_milestones_public_select" ON payment_milestones;
CREATE POLICY "payment_milestones_public_select" ON payment_milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = payment_milestones.quote_id
        AND q.proposal_token IS NOT NULL
        AND q.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
    )
  );
