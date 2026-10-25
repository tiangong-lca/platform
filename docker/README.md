# Self-Hosted Supabase with Docker

This is the official Docker Compose setup for self-hosted Supabase. It provides a complete stack with all Supabase services running locally or on your infrastructure.

## Getting Started

Follow the detailed setup guide in our documentation: [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)

## Project Sync Workflows

This project includes two sync workflows used to keep self-hosted assets aligned with upstream services.

### 1) Sync Edge Functions

Script: `docker/pull-edge-functions.sh`

Behavior:

- Require one reviewed full Edge commit SHA instead of following a moving ref.
- Resolve that ref to one exact commit.
- Replace `docker/volumes/functions/` with a delete-aware mirror of `supabase/functions/`.
- Record the repository and resolved commit in `docker/volumes/functions/.source-revision.json`.

Command:

```bash
cd /path/to/tiangong-lca-next
./docker/pull-edge-functions.sh --ref <reviewed-40-character-edge-commit>
```

Use another repository only for an explicit local or fork validation:

```bash
./docker/pull-edge-functions.sh \
  --repo /path/to/tiangong-lca-edge-functions \
  --ref <reviewed-40-character-edge-commit>
```

The helper is safe to invoke from another working directory because it resolves the target from its own location. It removes stale mirror files; review the complete generated diff before committing it.

### 2) Generate `data.sql` From a Reviewed Database Rebuild

Script: `docker/scripts/sync-migrations-to-data-sql.sh`

Requirements:

- Use a disposable local database rebuilt only from the reviewed `database-engine` migrations, without business seeds, Auth users, OAuth registrations, jobs, or datasets. Never point this workflow at production or shared Dev.
- Set `DATABASE_SOURCE_ROOT` to that clean owning checkout and `DATABASE_SOURCE_COMMIT` to its full reviewed SHA. The helper verifies checkout identity and the database migration head.
- `REMOTE_DB_URL` retains its historical name but must now use `localhost`, `127.0.0.1`, or `host.docker.internal`. A Docker client normally uses `host.docker.internal` with the isolated database's port. Invalid/remote addresses are rejected without printing credentials.

Command:

```bash
cd /path/to/tiangong-lca-next
DATABASE_SOURCE_ROOT=/path/to/database-engine \
DATABASE_SOURCE_COMMIT=<reviewed-40-character-database-commit> \
REMOTE_DB_URL='postgresql://postgres:<local-password>@host.docker.internal:54322/postgres' \
  ./docker/scripts/sync-migrations-to-data-sql.sh
```

Check-only mode (no file changes; use the same source environment):

```bash
./docker/scripts/sync-migrations-to-data-sql.sh --check
```

What the script does:

- Verify a migration-only empty source and record its exact commit/migration head in the snapshot
- Pull a full schema-only dump with `pg_dump --schema-only`
- Run `docker/desensitize_data.sql.sh` automatically
- Keep `api`, `private`, `public`, `util`, `archive`, `pgmq`, and required business extensions
- Export the three constrained Database executor roles, their effective reviewed memberships, the OAuth pre-request setting, the exact Database-owned Auth-to-private-user synchronization trigger and eleven allowlisted migration-owned catalogs; no user/business rows or credential catalogs are copied
- Recreate the two reviewed logged queues through `pgmq.create` as their `postgres` owner, then restore the Database-owned embedding visibility fence. Copying `pgmq.meta` rows alone does not create the extension-owned queue/archive tables
- Preserve the global `postgres` default-function ACL that revokes PUBLIC execution and clear the base image's broader public-schema defaults before restoring the reviewed grants. PG17 administrative-only creator memberships are omitted instead of becoming effective PG15 memberships; mixed INHERIT/SET flags fail before export
- Remove Supabase base-managed schemas/objects (for example `auth`, `extensions`, `graphql*`, `storage`, `supabase_functions`) and obvious PG17 dump noise such as `\restrict`, `\unrestrict`, and `SET transaction_timeout = 0;`
- Write the filtered result to `docker/volumes/db/init/data.sql`

The Docker image remains PostgreSQL 15.8. The filter removes only PG17's unsupported `MAINTAIN` token from table ACL blocks; it grants no replacement privilege and leaves function bodies unchanged. Existing canonical function-body whitespace is preserved. Supabase-managed Auth/Storage migrations and webhook setup remain owned by their existing pinned services/base initialization, not this snapshot.

The current pair is Edge `ceff9c4893e6fa9ab2b6e163c57b9d6428cbde37` and Database `fc743392d4ce256b5de1f6409a8ab7e90ec30614` (migration head `20260909120000`). Both Hybrid entrypoints forward visibility/selected-team context to their V2 RPCs; Process also forwards the dataset-type filter. Omitted and explicit `latest` Process/Flow requests preserve the legacy RPC arguments and Edge threshold retry; matched mode keeps Database-owned V2 fallback. The snapshot contract checks that pairing and the three executor roles. The initializer includes the V4 review queue search RPCs and the Database-owned composite-name projection catalog; its four migration shard receipts must all report zero processes in the disposable source.

This is a **fresh-install initializer**, not an upgrade script for an existing database volume. Existing installs must apply Database-owned migrations through their operator workflow, retain backups, and include `api` in `PGRST_DB_SCHEMAS`; never expose `private`, `util`, or `archive`. Run the generator twice (`--check` on the second run), the snapshot contract test, and an isolated restore against the pinned Docker database plus its normal Auth migrations before updating the committed artifact.

Desensitization rules include:

- `"x_key":"<any>"` -> `"x_key":"edge-functions-key"`
- `"apikey":"sb_secret_..."` -> `"apikey":"edge-functions-key"`
- Remaining `sb_secret_*` -> `sb_secret_REDACTED`

Deprecated compatibility wrapper:

- `docker/scripts/sync-lca-migrations-to-data-sql.sh` forwards to `sync-migrations-to-data-sql.sh`

The guide covers:

- Prerequisites (Git and Docker)
- Initial setup and configuration
- Securing your installation
- Accessing services
- Updating your instance

## What's Included

This Docker Compose configuration includes the following services:

- **[Studio](https://github.com/supabase/supabase/tree/master/apps/studio)** - A dashboard for managing your self-hosted Supabase project
- **[Kong](https://github.com/Kong/kong)** - Kong API gateway
- **[Auth](https://github.com/supabase/auth)** - JWT-based authentication API for user sign-ups, logins, and session management
- **[PostgREST](https://github.com/PostgREST/postgrest)** - Web server that turns your PostgreSQL database directly into a RESTful API
- **[Realtime](https://github.com/supabase/realtime)** - Elixir server that listens to PostgreSQL database changes and broadcasts them over websockets
- **[Storage](https://github.com/supabase/storage)** - RESTful API for managing files in S3, with Postgres handling permissions
- **[imgproxy](https://github.com/imgproxy/imgproxy)** - Fast and secure image processing server
- **[postgres-meta](https://github.com/supabase/postgres-meta)** - RESTful API for managing Postgres (fetch tables, add roles, run queries)
- **[PostgreSQL](https://github.com/supabase/postgres)** - Object-relational database with over 30 years of active development
- **[Edge Runtime](https://github.com/supabase/edge-runtime)** - Web server based on Deno runtime for running JavaScript, TypeScript, and WASM services
- **[Logflare](https://github.com/Logflare/logflare)** - Log management and event analytics platform
- **[Vector](https://github.com/vectordotdev/vector)** - High-performance observability data pipeline for logs
- **[Supavisor](https://github.com/supabase/supavisor)** - Supabase's Postgres connection pooler

## Documentation

- **[Documentation](https://supabase.com/docs/guides/self-hosting/docker)** - Setup and configuration guides
- **[CHANGELOG.md](./CHANGELOG.md)** - Track recent updates and changes to services
- **[versions.md](./versions.md)** - Complete history of Docker image versions for rollback reference

## Updates

To update your self-hosted Supabase instance:

1. Review [CHANGELOG.md](./CHANGELOG.md) for breaking changes
2. Check [versions.md](./versions.md) for new image versions
3. Update `docker-compose.yml` if there are configuration changes
4. Pull the latest images: `docker compose pull`
5. Stop services: `docker compose down`
6. Start services with new configuration: `docker compose up -d`

**Note:** Consider to always backup your database before updating.

## Community & Support

For troubleshooting common issues, see:

- [GitHub Discussions](https://github.com/orgs/supabase/discussions?discussions_q=is%3Aopen+label%3Aself-hosted) - Questions, feature requests, and workarounds
- [GitHub Issues](https://github.com/supabase/supabase/issues?q=is%3Aissue%20state%3Aopen%20label%3Aself-hosted) - Known issues
- [Documentation](https://supabase.com/docs/guides/self-hosting) - Setup and configuration guides

Self-hosted Supabase is community-supported. Get help and connect with other users:

- [Discord](https://discord.supabase.com) - Real-time chat and community support
- [Reddit](https://www.reddit.com/r/Supabase/) - Official Supabase subreddit

Share your self-hosting experience:

- [GitHub Discussions](https://github.com/orgs/supabase/discussions/39820) - "Self-hosting: What's working (and what's not)?"

## Important Notes

### Security

⚠️ **The default configuration is not secure for production use.**

Before deploying to production, you must:

- Update all default passwords and secrets in the `.env` file
- Generate new JWT secrets
- Review and update CORS settings
- Consider setting up a secure proxy in front of self-hosted Supabase
- Review and adjust network security configuration (ACLs, etc.)
- Set up proper backup procedures

See the [security section](https://supabase.com/docs/guides/self-hosting/docker#configuring-and-securing-supabase) in the documentation.

## License

This repository is licensed under the Apache 2.0 License. See the main [Supabase repository](https://github.com/supabase/supabase) for details.

## Outbound-target safety and existing database volumes

`desensitize_data.sql.sh` requires the repository Node.js baseline and its `scripts/validate-sql-egress.cjs` companion. It rejects known official Production/shared-Dev HTTP targets and retired non-FT dispatch patterns in default and strict modes, then atomically replaces output only after validation. Rejection preserves an existing destination/in-place input and creates no backup. Diagnostics omit SQL lines and credential values. `--strict` also rejects leftover credential patterns. Safe schema comments, descriptions and bare Production-identity refusal constants are preserved. This is a bounded literal/concatenation check, not a sandbox against arbitrary dynamic SQL, indirect DNS or later configuration.

A fresh artifact does not upgrade existing persisted data. Before restoring an old dump or reconnecting an old database volume:

1. Keep that database's external egress blocked **before PostgreSQL/pg_net starts**. Work on an isolated copy or operator-controlled environment; a check after the normal Compose startup may be too late for queued HTTP.
2. Inspect trigger endpoint names and the configured target locally without displaying queue headers, bodies or secret values. Apply the Database-owned migration path for that volume; never use the fresh-install initializer as an in-place upgrade.
3. Resolve old trigger configuration and pending HTTP queue disposition under the database owner's procedure, and configure the same-instance/internal backend or an explicitly owned custom backend with its own credentials.
4. Verify the intended FT routes and local target before restoring egress. Preserve unrelated services and data.

The application defaults are loopback/custom. Official hosted Main/shared-Dev require explicit profiles documented in `DEV.md`; imported database Vault values are a separate configuration surface. This change does not automatically migrate or quarantine an already-running external database.
