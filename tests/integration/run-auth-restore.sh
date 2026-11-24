#!/usr/bin/env bash
set -euo pipefail
root=$(pwd); state=$(mktemp -d)
trap 'cd "$state" && supabase stop --no-backup >/dev/null 2>&1 || true; rm -rf "$state"' EXIT
cd "$state"
supabase init >/dev/null
supabase start -x studio,imgproxy,logflare,vector,realtime,storage-api,postgres-meta,supavisor,edge-runtime > "$state/start.log" 2>&1 || { tail -24 "$state/start.log" | sed -E 's/(eyJ|sb_secret_)[^ ]+/[redacted]/g'; exit 1; }
supabase status -o env > "$state/local.env"
set -a
source "$state/local.env"
set +a
cd "$root"
psql "$DB_URL" -v ON_ERROR_STOP=1 --quiet -f tests/integration/local-foundation.sql
for f in supabase/migrations/*.sql; do psql "$DB_URL" -v ON_ERROR_STOP=1 --quiet -f "$f"; done
psql "$DB_URL" -v ON_ERROR_STOP=1 -qc "update iydu_private.browser_verification_config set enabled=true; notify pgrst,'reload schema';"
node tests/integration/real-auth-sync.mjs
container=$(docker ps --format '{{.Names}}' --filter 'name=supabase_db_' | head -1)
test -n "$container"
# Both source and recovery target are disposable CI PostgreSQL instances.
# The second instance keeps the database name postgres, required by pg_cron.
docker exec "$container" pg_dump -U postgres -Fc postgres > "$state/fixture.dump"
docker exec "$container" pg_dumpall -U postgres --roles-only --no-role-passwords > "$state/fixture.roles.sql"
# PostgreSQL records the bootstrap grantor specially. Preserve its original name.
bootstrap=$(docker exec "$container" psql -U postgres -Atqc "select rolname from pg_roles where oid=10 and rolsuper" postgres)
[[ "$bootstrap" =~ ^[a-z_][a-z0-9_]*$ ]]
# initdb already creates this single role; preserve all ALTER and GRANT statements.
awk -v role="$bootstrap" '$0=="CREATE ROLE " role ";" || $0=="CREATE ROLE \"" role "\";" {n++;next} {print} END{if(n!=1)exit 1}' "$state/fixture.roles.sql" > "$state/fixture.roles.restore.sql"
probe="select (select count(*) from auth.users), (select count(*) from auth.sessions), (select count(*) from iydu_private.browser_verified_sessions), (select md5(string_agg(md5(data::text),',' order by user_id)) from public.user_data)"
before=$(docker exec "$container" psql -U postgres -Atqc "$probe" postgres)
recovery_dir=$(docker exec -u postgres "$container" mktemp -d /tmp/iydu-recovery.XXXXXX)
preload=$(docker exec "$container" psql -U postgres -Atqc "show shared_preload_libraries" postgres)
# Restrict the value embedded in the local test server's command line to library identifiers.
[[ "$preload" =~ ^[a-zA-Z0-9_,.[:space:]\$-]*$ ]]
docker exec -u postgres "$container" initdb --no-locale --encoding=UTF8 -A trust -U "$bootstrap" -D "$recovery_dir/data" >/dev/null
docker exec -u postgres "$container" pg_ctl -D "$recovery_dir/data" -l "$recovery_dir/server.log" -o "-k $recovery_dir -p 55432 -c listen_addresses='' -c shared_preload_libraries='$preload'" -w start >/dev/null
# Restore the original role definitions (without passwords), ownership, ACLs and database contents.
# This socket is inside the private temporary directory; the test server has no TCP listener.
docker exec -i -u postgres "$container" psql -h "$recovery_dir" -p 55432 -U "$bootstrap" -d postgres -v ON_ERROR_STOP=1 --quiet < "$state/fixture.roles.restore.sql"
docker exec -u postgres "$container" psql -h "$recovery_dir" -p 55432 -U "$bootstrap" -d postgres -v ON_ERROR_STOP=1 -qc "DROP SCHEMA public;"
docker exec -i -u postgres "$container" pg_restore -h "$recovery_dir" -p 55432 -U "$bootstrap" --exit-on-error -d postgres < "$state/fixture.dump"
after=$(docker exec -u postgres "$container" psql -h "$recovery_dir" -p 55432 -U "$bootstrap" -Atqc "$probe" postgres)
test "$before" = "$after"
docker exec -u postgres "$container" pg_ctl -D "$recovery_dir/data" -w stop >/dev/null
echo 'PASS: restored Auth accounts, sessions, verification records and exact profile documents in an independent PostgreSQL instance.'
