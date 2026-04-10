-- Jalankan file ini di psql sebagai superuser postgres
-- "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f setup_db.sql

CREATE USER elyasr_user WITH ENCRYPTED PASSWORD 'elyasr_pass_dev';
CREATE DATABASE elyasr_ops OWNER elyasr_user;
GRANT ALL PRIVILEGES ON DATABASE elyasr_ops TO elyasr_user;
\c elyasr_ops
GRANT ALL ON SCHEMA public TO elyasr_user;
