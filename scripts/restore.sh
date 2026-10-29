#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# != 2 || "$2" != "--confirm-empty-target" ]]; then
    printf '用法：scripts/restore.sh 备份目录 --confirm-empty-target\n仅支持恢复到空数据库和空图片卷。\n' >&2
    exit 1
fi
backup_dir="$1"
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
table_count="$(docker compose exec -T db psql -U kids -d kidstodo -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
if [[ "$table_count" != "0" ]]; then printf '目标数据库非空，未执行恢复。\n' >&2; exit 1; fi
docker compose run --rm --no-deps --entrypoint python api -c "from pathlib import Path; import sys; sys.exit(1 if any(Path('/app/data/media').iterdir()) else 0)"
docker compose exec -T db pg_restore -U kids -d kidstodo --no-owner --no-privileges --single-transaction < "$backup_dir/database.dump"
docker compose run --rm --no-deps --user 0 --entrypoint sh api -c 'tar xzf - -C /app/data && chown -R 10001:10001 /app/data/media' < "$backup_dir/media.tar.gz"
printf '恢复完成。运行 docker compose up -d 完成迁移检查和启动。\n'
