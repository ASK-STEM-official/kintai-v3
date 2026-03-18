-- Security fix: Enforce least-privilege on all schemas
--
-- Problem found in production:
--   1. member schema: RLS was disabled, allowing anon to read/write all member data
--   2. Both schemas: ALTER DEFAULT PRIVILEGES granted ALL to anon (overly broad)
--   3. attendance tables: anon had INSERT/UPDATE/DELETE in addition to SELECT
--
-- This migration:
--   - Re-enables RLS on all tables (FORCE for extra safety)
--   - Revokes excess anon grants; anon only gets what kiosk strictly needs:
--       * EXECUTE on attendance.record_attendance_by_card (direct RPC from kiosk)
--       * SELECT on attendance.temp_registrations (Realtime QR channel subscription)
--   - Adds missing authenticated READ policies on team_leaders / generation_roles


-- ================================================================
-- MEMBER SCHEMA: Enable RLS and revoke anon direct table access
-- ================================================================

-- Re-enable RLS (idempotent)
ALTER TABLE member.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE member.member_team_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE member.team_leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE member.generation_roles ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (prevents accidental bypass via service key outside policies)
ALTER TABLE member.members FORCE ROW LEVEL SECURITY;
ALTER TABLE member.teams FORCE ROW LEVEL SECURITY;
ALTER TABLE member.member_team_relations FORCE ROW LEVEL SECURITY;
ALTER TABLE member.team_leaders FORCE ROW LEVEL SECURITY;
ALTER TABLE member.generation_roles FORCE ROW LEVEL SECURITY;

-- Revoke all direct anon access on member tables
-- (anon has no business reading member data directly)
REVOKE ALL ON member.members FROM anon;
REVOKE ALL ON member.teams FROM anon;
REVOKE ALL ON member.member_team_relations FROM anon;
REVOKE ALL ON member.team_leaders FROM anon;
REVOKE ALL ON member.generation_roles FROM anon;

-- Fix default privileges so future tables don't auto-grant anon
ALTER DEFAULT PRIVILEGES IN SCHEMA member REVOKE ALL ON TABLES FROM anon;

-- Add missing READ policies for authenticated users on team_leaders / generation_roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'member' AND tablename = 'team_leaders'
      AND policyname = 'Allow read access to authenticated users on team_leaders'
  ) THEN
    CREATE POLICY "Allow read access to authenticated users on team_leaders"
      ON member.team_leaders FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'member' AND tablename = 'generation_roles'
      AND policyname = 'Allow read access to authenticated users on generation_roles'
  ) THEN
    CREATE POLICY "Allow read access to authenticated users on generation_roles"
      ON member.generation_roles FOR SELECT TO authenticated USING (true);
  END IF;
END $$;


-- ================================================================
-- ATTENDANCE SCHEMA: Tighten anon access
-- ================================================================

-- attendances: anon should have NO direct access
-- (authenticated users can read their own records via RLS policy)
REVOKE ALL ON attendance.attendances FROM anon;

-- attendance.users: anon should have NO direct access
-- (the SECURITY DEFINER RPC accesses this internally)
REVOKE ALL ON attendance.users FROM anon;

-- daily_logout_logs: anon should have NO access
REVOKE ALL ON attendance.daily_logout_logs FROM anon;

-- temp_registrations: revoke write access, keep SELECT
-- SELECT is required for the kiosk Realtime subscription (QR scan detection)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON attendance.temp_registrations FROM anon;
-- GRANT SELECT remains (already present via default privileges + existing policy)
GRANT SELECT ON attendance.temp_registrations TO anon;

-- Fix default privileges so future attendance tables don't auto-grant anon
ALTER DEFAULT PRIVILEGES IN SCHEMA attendance REVOKE ALL ON TABLES FROM anon;

-- Force RLS on attendance tables
ALTER TABLE attendance.attendances FORCE ROW LEVEL SECURITY;
ALTER TABLE attendance.users FORCE ROW LEVEL SECURITY;
ALTER TABLE attendance.temp_registrations FORCE ROW LEVEL SECURITY;
ALTER TABLE attendance.daily_logout_logs FORCE ROW LEVEL SECURITY;


-- ================================================================
-- RPC: Ensure kiosk can still call the SECURITY DEFINER function
-- ================================================================
GRANT EXECUTE ON FUNCTION attendance.record_attendance_by_card(text) TO anon;
