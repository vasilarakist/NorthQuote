-- ============================================================
-- Fix onboarding RLS
-- ============================================================
-- Onboarding (org + user creation) now goes through the
-- /api/onboarding server route which uses the service role
-- client, so it bypasses RLS entirely. No INSERT policies
-- are needed on organizations or users for new account setup.
--
-- The only change here is restoring the users_insert policy
-- to a safer form: a user may only insert a row where they
-- are the auth_id. This prevents one org member from inserting
-- rows on behalf of another user while still being unused
-- during onboarding (the service role skips it anyway).
-- ============================================================

DROP POLICY IF EXISTS "org_insert" ON organizations;

DROP POLICY IF EXISTS "users_insert" ON users;
CREATE POLICY "users_insert" ON users
  FOR INSERT WITH CHECK (auth_id = auth.uid());
