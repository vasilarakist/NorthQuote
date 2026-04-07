-- ============================================================
-- Phase 4: Pro Features and Polish
-- ============================================================

-- Add billing_credits to organizations for referral rewards
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_credits NUMERIC(10,2) DEFAULT 0;

-- Add group_id to quotes for linking tiered quotes (Good/Better/Best)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS total_referral_credits NUMERIC(10,2) DEFAULT 0;

-- Index for quote_versions lookups
CREATE INDEX IF NOT EXISTS idx_quote_versions_quote_id_version ON quote_versions(quote_id, version_number DESC);

-- RLS: Allow authenticated users to read their own org's quote_versions
CREATE POLICY IF NOT EXISTS "quote_versions_org_select" ON quote_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN users u ON u.organization_id = q.organization_id
      WHERE q.id = quote_versions.quote_id
        AND u.auth_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "quote_versions_org_insert" ON quote_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN users u ON u.organization_id = q.organization_id
      WHERE q.id = quote_versions.quote_id
        AND u.auth_id = auth.uid()
    )
  );

-- RLS: Allow authenticated users to read their own referrals
CREATE POLICY IF NOT EXISTS "referrals_referrer_select" ON referrals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.organization_id = referrals.referrer_org_id
        AND u.auth_id = auth.uid()
    )
  );
