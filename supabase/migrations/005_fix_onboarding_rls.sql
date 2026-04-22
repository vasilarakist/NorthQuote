-- ============================================================
-- Fix onboarding RLS: allow authenticated users to create their
-- first organization and self-insert their user record.
-- ============================================================

-- 1. Organizations: add missing INSERT policy.
--    Any authenticated user can insert a new org (they have no org yet).
CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Users: the previous insert policy checked `organization_id = auth_org_id()`,
--    but auth_org_id() returns NULL before the user record exists, so the check
--    always failed during onboarding. Replace it with a check that the user is
--    inserting their own record (auth_id matches the session uid).
DROP POLICY IF EXISTS "users_insert" ON users;
CREATE POLICY "users_insert" ON users
  FOR INSERT WITH CHECK (auth_id = auth.uid());
