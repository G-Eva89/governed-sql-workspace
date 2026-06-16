-- Read-only role for governed query access to Pagila (Layer 1 defense in depth).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pagila_ro') THEN
    CREATE ROLE pagila_ro LOGIN PASSWORD 'pagila_ro';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE pagila TO pagila_ro;
GRANT USAGE ON SCHEMA public TO pagila_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pagila_ro;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pagila_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO pagila_ro;
