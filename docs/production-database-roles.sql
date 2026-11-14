-- REVIEW TEMPLATE ONLY. Not executed on any production database by Phase 8.1.
-- Run as the hosting/database operator. Substitute the actual DB using psql:
-- psql --set=database_name=the_approved_database --file=this_reviewed_file
-- These are group roles, NOT application identities or login credentials.
-- Independently provision login identities/secrets with only the intended membership.
-- The migration role must own public application tables; runtime must own none.
BEGIN;
CREATE ROLE fixup_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE fixup_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE fixup_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO fixup_runtime, fixup_backup;
GRANT USAGE ON SCHEMA public TO fixup_runtime, fixup_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fixup_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fixup_runtime;
REVOKE ALL ON TABLE "_prisma_migrations" FROM fixup_runtime;
GRANT SELECT ON TABLE "_prisma_migrations" TO fixup_runtime;
REVOKE UPDATE, DELETE ON TABLE "AuditLog" FROM fixup_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO fixup_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO fixup_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE fixup_migrator IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO fixup_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE fixup_migrator IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO fixup_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE fixup_migrator IN SCHEMA public GRANT SELECT ON TABLES TO fixup_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE fixup_migrator IN SCHEMA public GRANT SELECT ON SEQUENCES TO fixup_backup;
-- Re-review per-table exceptions after every migration. Do not grant runtime
-- membership in migrator/owner/backup/server-file roles or schema CREATE.
-- Existing role/ownership changes require an environment-specific reviewed plan;
-- this template deliberately does not reassign existing objects or issue passwords.
COMMIT;
