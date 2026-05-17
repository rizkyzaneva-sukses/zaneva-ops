-- Create user if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'elyasr_user') THEN
    CREATE USER elyasr_user WITH PASSWORD 'elyasr_pass_dev';
  END IF;
END
$$;

-- Create database if not exists
SELECT 'CREATE DATABASE elyasr_ops OWNER elyasr_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'elyasr_ops')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE elyasr_ops TO elyasr_user;
