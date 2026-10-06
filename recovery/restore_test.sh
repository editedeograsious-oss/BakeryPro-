#!/usr/bin/env bash
set -euo pipefail
umask 077
RECOVERY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [ "$#" -ne 2 ]; then echo 'Usage: bash restore_test.sh <backup-folder> <matching-archive.tar.gz>'; exit 1; fi
BACKUP_FOLDER="$1"
ARCHIVE="$2"
: "${TARGET_DATABASE_URL:?Load the separate empty target connection privately}"
: "${TARGET_PROJECT_REF:?The approved empty target project ref is required}"
: "${SOURCE_PROJECT_REF:?The original bakery source project ref is required}"
if [ "${RESTORE_CONFIRM:-}" != 'RESTORE_TO_TEST_ONLY' ]; then echo 'Restore confirmation is missing.'; exit 1; fi
for required in node psql tar; do command -v "$required" >/dev/null 2>&1 || { echo "Missing recovery tool: $required"; exit 1; }; done
export PGSSLMODE=require
# Establish identity before any target query or import. Both current bakery projects are blocked.
node "$RECOVERY_ROOT/connection_guard.mjs" target
node "$RECOVERY_ROOT/archive.mjs" verify "$BACKUP_FOLDER"
node "$RECOVERY_ROOT/archive.mjs" verify-hash "$ARCHIVE"
node "$RECOVERY_ROOT/archive.mjs" verify-binding "$BACKUP_FOLDER" "$ARCHIVE"
TARGET_STATE="$(psql --no-psqlrc --quiet --tuples-only --no-align --variable ON_ERROR_STOP=1 --dbname "$TARGET_DATABASE_URL" \
  --command "select jsonb_build_object('public_objects',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S')),'auth_users',(select count(*) from auth.users));")"
TARGET_STATE="$TARGET_STATE" node --input-type=module <<'JS'
const state=JSON.parse(process.env.TARGET_STATE);
if (state.public_objects!==0 || state.auth_users!==0) throw Error('Restore blocked: target contains application objects or users. Use a separate empty target.');
JS
psql --no-psqlrc --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DATABASE_URL" \
  --file "$BACKUP_FOLDER/roles.sql" --file "$BACKUP_FOLDER/schema.sql" \
  --file "$BACKUP_FOLDER/history_schema.sql" --command 'SET session_replication_role = replica' \
  --file "$BACKUP_FOLDER/data.sql" --file "$BACKUP_FOLDER/history_data.sql"
RESULTS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ds_bakery_restore_XXXXXX")"
psql --no-psqlrc --quiet --tuples-only --no-align --variable ON_ERROR_STOP=1 --dbname "$TARGET_DATABASE_URL" \
  --file "$RECOVERY_ROOT/capture_manifest.sql" > "$RESULTS_DIR/restored_manifest.json"
node "$RECOVERY_ROOT/manifest.mjs" "$BACKUP_FOLDER/source_manifest.json" "$RESULTS_DIR/restored_manifest.json"
echo "Compared restore evidence: $RESULTS_DIR/restored_manifest.json"
echo 'Database comparison passed. This script does not enable operations or mark the backup gate passed.'
