#!/usr/bin/env bash
set -euo pipefail
umask 077
RECOVERY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${DATABASE_URL:?Load DATABASE_URL privately; never paste it into chat}"
: "${SOURCE_PROJECT_REF:?Set SOURCE_PROJECT_REF to the chosen existing bakery database}"
: "${BACKUP_DIR:?Choose a private backup directory outside the public app and source control}"
for required in node psql supabase docker tar; do
  command -v "$required" >/dev/null 2>&1 || { echo "Missing recovery tool: $required"; exit 1; }
done
export PGSSLMODE=require
node "$RECOVERY_ROOT/connection_guard.mjs" source
docker info >/dev/null 2>&1 || { echo 'Docker must be running.'; exit 1; }
supabase --version
supabase db dump --help >/dev/null
mkdir -p -- "$BACKUP_DIR"
OUT_DIR="$(mktemp -d "$BACKUP_DIR/ds_bakery_$(date -u +%Y%m%dT%H%M%SZ)_XXXXXX")"

# Capture before and after the CLI dump. Stop if the comparison changes.
psql --no-psqlrc --quiet --tuples-only --no-align --variable ON_ERROR_STOP=1 --dbname "$DATABASE_URL" \
  --file "$RECOVERY_ROOT/capture_manifest.sql" > "$OUT_DIR/source_manifest.json"
node "$RECOVERY_ROOT/manifest.mjs" validate "$OUT_DIR/source_manifest.json"
supabase db dump --db-url "$DATABASE_URL" -f "$OUT_DIR/roles.sql" --role-only
supabase db dump --db-url "$DATABASE_URL" -f "$OUT_DIR/schema.sql"
supabase db dump --db-url "$DATABASE_URL" -f "$OUT_DIR/data.sql" --use-copy --data-only \
  -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
supabase db dump --db-url "$DATABASE_URL" -f "$OUT_DIR/history_schema.sql" --schema supabase_migrations
supabase db dump --db-url "$DATABASE_URL" -f "$OUT_DIR/history_data.sql" --schema supabase_migrations --use-copy --data-only
psql --no-psqlrc --quiet --tuples-only --no-align --variable ON_ERROR_STOP=1 --dbname "$DATABASE_URL" \
  --file "$RECOVERY_ROOT/capture_manifest.sql" > "$OUT_DIR/after_manifest.json"
node "$RECOVERY_ROOT/manifest.mjs" "$OUT_DIR/source_manifest.json" "$OUT_DIR/after_manifest.json"
rm -- "$OUT_DIR/after_manifest.json"
node --input-type=module - "$OUT_DIR" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const directory=process.argv[2];
fs.writeFileSync(path.join(directory,'backup_metadata.json'),JSON.stringify({
  format_version:1,scope:'database_only',source_project_ref:process.env.SOURCE_PROJECT_REF,
  backup_label:path.basename(directory),created_at:new Date().toISOString()
},null,2)+'\n',{mode:0o600});
JS
node "$RECOVERY_ROOT/archive.mjs" seal "$OUT_DIR"
ARCHIVE="$OUT_DIR.tar.gz"
tar -C "$BACKUP_DIR" -czf "$ARCHIVE" "$(basename -- "$OUT_DIR")"
node "$RECOVERY_ROOT/archive.mjs" hash "$ARCHIVE"
echo "Backup folder: $OUT_DIR"
echo "Archive: $ARCHIVE"
echo 'Database backup prepared. A real separate-target restore is still required.'
