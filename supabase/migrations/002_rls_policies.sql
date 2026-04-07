-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================
-- Helper function: get the organization_id for the current auth user

CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (id = auth_org_id());

CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (id = auth_org_id());

-- ============================================================
-- USERS
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select" ON users
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY "users_insert" ON users
  FOR INSERT WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "users_update" ON users
  FOR UPDATE USING (organization_id = auth_org_id());

CREATE POLICY "users_delete" ON users
  FOR DELETE USING (organization_id = auth_org_id());

-- Allow users to read their own record before org context is set (signup flow)
CREATE POLICY "users_self_select" ON users
  FOR SELECT USING (auth_id = auth.uid());

-- ============================================================
-- CLIENTS
-- ============================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON clients
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY "clients_insert" ON clients
  FOR INSERT WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "clients_update" ON clients
  FOR UPDATE USING (organization_id = auth_org_id());

CREATE POLICY "clients_delete" ON clients
  FOR DELETE USING (organization_id = auth_org_id());

-- ============================================================
-- PROJECTS
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (organization_id = auth_org_id());

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (organization_id = auth_org_id());

-- ============================================================
-- PRICE BOOK ITEMS
-- ============================================================

ALTER TABLE price_book_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_book_select" ON price_book_items
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY "price_book_insert" ON price_book_items
  FOR INSERT WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "price_book_update" ON price_book_items
  FOR UPDATE USING (organization_id = auth_org_id());

CREATE POLICY "price_book_delete" ON price_book_items
  FOR DELETE USING (organization_id = auth_org_id());

-- ============================================================
-- QUOTES
-- ============================================================

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_select" ON quotes
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY "quotes_insert" ON quotes
  FOR INSERT WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "quotes_update" ON quotes
  FOR UPDATE USING (organization_id = auth_org_id());

CREATE POLICY "quotes_delete" ON quotes
  FOR DELETE USING (organization_id = auth_org_id());

-- ============================================================
-- QUOTE LINE ITEMS
-- ============================================================

ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_line_items_select" ON quote_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_line_items.quote_id
        AND q.organization_id = auth_org_id()
    )
  );

CREATE POLICY "quote_line_items_insert" ON quote_line_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_line_items.quote_id
        AND q.organization_id = auth_org_id()
    )
  );

CREATE POLICY "quote_line_items_update" ON quote_line_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_line_items.quote_id
        AND q.organization_id = auth_org_id()
    )
  );

CREATE POLICY "quote_line_items_delete" ON quote_line_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_line_items.quote_id
        AND q.organization_id = auth_org_id()
    )
  );

-- ============================================================
-- QUOTE VERSIONS
-- ============================================================

ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_versions_select" ON quote_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_versions.quote_id
        AND q.organization_id = auth_org_id()
    )
  );

CREATE POLICY "quote_versions_insert" ON quote_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_versions.quote_id
        AND q.organization_id = auth_org_id()
    )
  );

-- ============================================================
-- INVOICES
-- ============================================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (organization_id = auth_org_id());

CREATE POLICY "invoices_delete" ON invoices
  FOR DELETE USING (organization_id = auth_org_id());

-- ============================================================
-- FOLLOW UPS
-- ============================================================

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_ups_select" ON follow_ups
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY "follow_ups_insert" ON follow_ups
  FOR INSERT WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "follow_ups_update" ON follow_ups
  FOR UPDATE USING (organization_id = auth_org_id());

CREATE POLICY "follow_ups_delete" ON follow_ups
  FOR DELETE USING (organization_id = auth_org_id());

-- ============================================================
-- REFERRALS
-- ============================================================

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals_select" ON referrals
  FOR SELECT USING (referrer_org_id = auth_org_id());

CREATE POLICY "referrals_insert" ON referrals
  FOR INSERT WITH CHECK (referrer_org_id = auth_org_id());

-- ============================================================
-- QUOTE EVENTS
-- (public read for client-facing quote view; org write)
-- ============================================================

ALTER TABLE quote_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_events_select" ON quote_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_events.quote_id
        AND q.organization_id = auth_org_id()
    )
  );

-- Quote events can be inserted by anyone (unauthenticated client viewing a quote)
CREATE POLICY "quote_events_insert_public" ON quote_events
  FOR INSERT WITH CHECK (true);
