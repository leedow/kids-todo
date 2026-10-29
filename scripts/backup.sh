#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir="${1:-data/backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
running_api="$(docker compose ps --status running --services api)"
resume_api() { if [[ "$running_api" == "api" ]]; then docker compose start api >/dev/null; fi; }
trap resume_api EXIT
if [[ "$running_api" == "api" ]]; then docker compose stop api; fi
docker compose exec -T db pg_dump -U kids -d kidstodo --format=custom --no-owner > "$backup_dir/database.dump"
docker compose run --rm --no-deps --entrypoint tar api czf - -C /app/data media > "$backup_dir/media.tar.gz"
(cd "$backup_dir" && sha256sum database.dump media.tar.gz > SHA256SUMS)
printf 'UTC %s\n' "$(date -u +%FT%TZ)" > "$backup_dir/manifest.txt"
chmod 600 "$backup_dir"/*
printf '备份完成：%s\n' "$backup_dir"
