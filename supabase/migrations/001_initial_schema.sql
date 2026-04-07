-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('owner', 'member');
CREATE TYPE project_status AS ENUM ('active', 'completed', 'archived');
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');
CREATE TYPE quote_tier AS ENUM ('single', 'good', 'better', 'best');
CREATE TYPE line_item_category AS ENUM ('material', 'labour', 'permit', 'other');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue');
CREATE TYPE follow_up_channel AS ENUM ('sms', 'email');
CREATE TYPE follow_up_status AS ENUM ('pending', 'sent', 'cancelled');
CREATE TYPE referral_status AS ENUM ('pending', 'converted', 'credited');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
CREATE TYPE subscription_plan AS ENUM ('starter', 'pro', 'scale');

-- ============================================================
-- ORGANIZATIONS
-- ============================================================

CREATE TABLE organizations (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT NOT NULL,
  email                   TEXT,
  phone                   TEXT,
  address                 TEXT,
  city                    TEXT,
  province_state          TEXT,
  postal_zip              TEXT,
  country                 TEXT NOT NULL DEFAULT 'CA',
  logo_url                TEXT,
  brand_color_primary     TEXT DEFAULT '#0F1C2E',
  brand_color_secondary   TEXT DEFAULT '#D4943C',
  gst_hst_number          TEXT,
  tax_province            TEXT,
  trade_type              TEXT,
  stripe_account_id       TEXT,
  subscription_status     subscription_status DEFAULT 'trialing',
  subscription_plan       subscription_plan DEFAULT 'starter',
  referral_code           TEXT UNIQUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  role            user_role NOT NULL DEFAULT 'member',
  auth_id         UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CLIENTS
-- ============================================================

CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  city            TEXT,
  province_state  TEXT,
  postal_zip      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECTS
-- ============================================================

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  project_name    TEXT NOT NULL,
  service_address TEXT NOT NULL,
  status          project_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PRICE BOOK ITEMS
-- ============================================================

CREATE TABLE price_book_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  category         line_item_category NOT NULL DEFAULT 'material',
  default_quantity NUMERIC(10,2) DEFAULT 1,
  unit             TEXT,
  unit_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  markup_percent   NUMERIC(5,2) DEFAULT 0,
  trade_type       TEXT,
  usage_count      INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUOTES
-- ============================================================

CREATE TABLE quotes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  quote_number      TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1,
  status            quote_status NOT NULL DEFAULT 'draft',
  tier              quote_tier NOT NULL DEFAULT 'single',
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(5,4) DEFAULT 0,
  tax_type          TEXT,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'CAD',
  valid_until       DATE,
  ai_generated      BOOLEAN NOT NULL DEFAULT FALSE,
  ai_prompt         TEXT,
  notes_to_client   TEXT,
  internal_notes    TEXT,
  sent_at           TIMESTAMPTZ,
  viewed_at         TIMESTAMPTZ,
  accepted_at       TIMESTAMPTZ,
  declined_at       TIMESTAMPTZ,
  signature_data    TEXT,
  signature_ip      INET,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUOTE LINE ITEMS
-- ============================================================

CREATE TABLE quote_line_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id            UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL DEFAULT 0,
  description         TEXT NOT NULL,
  category            line_item_category NOT NULL DEFAULT 'material',
  quantity            NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit                TEXT,
  unit_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  markup_percent      NUMERIC(5,2) DEFAULT 0,
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  from_price_book     BOOLEAN NOT NULL DEFAULT FALSE,
  price_book_item_id  UUID REFERENCES price_book_items(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUOTE VERSIONS
-- ============================================================

CREATE TABLE quote_versions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id       UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot       JSONB NOT NULL,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INVOICES
-- ============================================================

CREATE TABLE invoices (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id                 UUID REFERENCES quotes(id) ON DELETE SET NULL,
  project_id               UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  client_id                UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  invoice_number           TEXT NOT NULL,
  status                   invoice_status NOT NULL DEFAULT 'draft',
  amount                   NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount               NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                    NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency                 TEXT NOT NULL DEFAULT 'CAD',
  due_date                 DATE,
  paid_at                  TIMESTAMPTZ,
  stripe_payment_intent_id TEXT,
  payment_method           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FOLLOW UPS
-- ============================================================

CREATE TABLE follow_ups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id        UUID REFERENCES quotes(id) ON DELETE CASCADE,
  invoice_id      UUID REFERENCES invoices(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  channel         follow_up_channel NOT NULL DEFAULT 'email',
  scheduled_at    TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  status          follow_up_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REFERRALS
-- ============================================================

CREATE TABLE referrals (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_org_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  referred_org_id  UUID REFERENCES organizations(id) ON DELETE SET NULL,
  referral_code_used TEXT NOT NULL,
  status           referral_status NOT NULL DEFAULT 'pending',
  credit_amount    NUMERIC(10,2) DEFAULT 0,
  credited_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUOTE EVENTS
-- ============================================================

CREATE TABLE quote_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id    UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_clients_organization_id ON clients(organization_id);
CREATE INDEX idx_projects_organization_id ON projects(organization_id);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_quotes_organization_id ON quotes(organization_id);
CREATE INDEX idx_quotes_project_id ON quotes(project_id);
CREATE INDEX idx_quotes_client_id ON quotes(client_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quote_line_items_quote_id ON quote_line_items(quote_id);
CREATE INDEX idx_quote_versions_quote_id ON quote_versions(quote_id);
CREATE INDEX idx_price_book_items_organization_id ON price_book_items(organization_id);
CREATE INDEX idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX idx_follow_ups_organization_id ON follow_ups(organization_id);
CREATE INDEX idx_follow_ups_scheduled_at ON follow_ups(scheduled_at);
CREATE INDEX idx_quote_events_quote_id ON quote_events(quote_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_price_book_items_updated_at
  BEFORE UPDATE ON price_book_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
