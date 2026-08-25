-- Game Day direct table-access lockdown rollback
-- ---------------------------------------------------------------------------
-- Exact pre-lockdown reconstruction from the live Supabase SQL Editor exports:
--   * Supabase_Snippet_Untitled_query_(10)_1787675820137.csv (RLS + policies)
--   * Supabase_Snippet_Untitled_query_(12)_1787675833385.csv (table inventory)
--   * 0_Supabase_Snippet_Untitled_query_(13)_1787676094866.csv (table grants)
--
-- Captured state:
--   * 10 Game Day tables are RLS enabled and NOT FORCE ROW LEVEL SECURITY.
--   * Eight tables have one PERMISSIVE policy to public FOR ALL
--     USING (true) WITH CHECK (true).
--   * gameday_email_sends and gameday_next_room_interest have no policies.
--   * anon, authenticated, and service_role have all seven table privileges
--     with no grant options. PUBLIC has no direct table privileges.
--
-- Apply only to reverse a failed application of gameday-rls-lockdown.sql.
-- It restores grants/policies/RLS only; it never changes Game Day data.

BEGIN;

-- Recreate the exact pre-change RLS mode.
ALTER TABLE public.gameday_email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_email_sends NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_final_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_final_standings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_next_room_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_next_room_interest NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_participants NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_pick_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_pick_cards NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_picks NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_prop_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_prop_library NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_props ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_props NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_rooms NO FORCE ROW LEVEL SECURITY;

-- The forward migration revokes all table privileges from these roles and
-- grants service_role ALL. Reset every affected role before restoring the
-- live grant inventory, including its empty PUBLIC grant set.
REVOKE ALL ON TABLE public.gameday_email_sends FROM anon, authenticated, PUBLIC, service_role;
REVOKE ALL ON TABLE public.gameday_events FROM anon, authenticated, PUBLIC, service_role;
REVOKE ALL ON TABLE public.gameday_final_standings FROM anon, authenticated, PUBLIC, service_role;
REVOKE ALL ON TABLE public.gameday_next_room_interest FROM anon, authenticated, PUBLIC, service_role;
REVOKE ALL ON TABLE public.gameday_participants FROM anon, authenticated, PUBLIC, service_role;
REVOKE ALL ON TABLE public.gameday_pick_cards FROM anon, authenticated, PUBLIC, service_role;
REVOKE ALL ON TABLE public.gameday_picks FROM anon, authenticated, PUBLIC, service_role;
REVOKE ALL ON TABLE public.gameday_prop_library FROM anon, authenticated, PUBLIC, service_role;
REVOKE ALL ON TABLE public.gameday_props FROM anon, authenticated, PUBLIC, service_role;
REVOKE ALL ON TABLE public.gameday_rooms FROM anon, authenticated, PUBLIC, service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_email_sends TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_events TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_final_standings TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_next_room_interest TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_participants TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_pick_cards TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_picks TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_prop_library TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_props TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gameday_rooms TO anon, authenticated, service_role;

-- Restore every policy present in the live snapshot. The two policy-free
-- tables intentionally remain policy-free.
DROP POLICY IF EXISTS "gd_events_all" ON public.gameday_events;
CREATE POLICY "gd_events_all" ON public.gameday_events
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gd_standings_all" ON public.gameday_final_standings;
CREATE POLICY "gd_standings_all" ON public.gameday_final_standings
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gd_participants_all" ON public.gameday_participants;
CREATE POLICY "gd_participants_all" ON public.gameday_participants
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gd_cards_all" ON public.gameday_pick_cards;
CREATE POLICY "gd_cards_all" ON public.gameday_pick_cards
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gd_picks_all" ON public.gameday_picks;
CREATE POLICY "gd_picks_all" ON public.gameday_picks
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gd_prop_library_all" ON public.gameday_prop_library;
CREATE POLICY "gd_prop_library_all" ON public.gameday_prop_library
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gd_props_all" ON public.gameday_props;
CREATE POLICY "gd_props_all" ON public.gameday_props
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gd_rooms_all" ON public.gameday_rooms;
CREATE POLICY "gd_rooms_all" ON public.gameday_rooms
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

COMMIT;