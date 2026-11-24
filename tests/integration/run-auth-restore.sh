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
# The dump and the restore service run inside the disposable local database container.
docker exec "$container" pg_dump -U postgres -Fc --schema=public --schema=iydu_private --schema=auth postgres > "$state/fixture.dump"
docker exec "$container" createdb -U postgres -T template0 iyd_restore
docker exec -i "$container" pg_restore -U postgres --no-owner --no-acl --exit-on-error -d iyd_restore < "$state/fixture.dump"
probe="select (select count(*) from auth.users), (select count(*) from auth.sessions), (select count(*) from iydu_private.browser_verified_sessions), (select md5(string_agg(md5(data::text),',' order by user_id)) from public.user_data)"
before=$(docker exec "$container" psql -U postgres -Atqc "$probe" postgres)
after=$(docker exec "$container" psql -U postgres -Atqc "$probe" iyd_restore)
test "$before" = "$after"
echo 'PASS: restored Auth accounts, sessions, verification records and exact profile documents in an independent database.'
