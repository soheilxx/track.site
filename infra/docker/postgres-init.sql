-- Creates the test database and the runtime role used for RLS enforcement.
CREATE DATABASE tracksite_test;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tracksite_app') THEN
    CREATE ROLE tracksite_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
