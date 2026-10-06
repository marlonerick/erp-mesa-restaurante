#!/usr/bin/env bash
# Backup diário do banco (Etapa 10 — docs/deployment/backup.md).
# Uso, na pasta deploy/ do servidor:  ./backup.sh
# Agendado pelo cron às 04:30 (antes da virada do dia às 05:00 e fora do horário do restaurante).
#
# - Cópia completa e consistente (--single-transaction: não trava o restaurante), compactada
# - Conferência: o arquivo descompacta inteiro e ganha um .sha256
# - Retenção: 30 dias de diários + 12 meses de mensais (o primeiro backup de cada mês)
# - Cópia EXTERNA opcional (rclone) para não depender só do servidor
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose -f compose.prod.yml --env-file "$ENV_FILE")
# shellcheck disable=SC1090
BACKUP_DIR="$(set -a; . "./$ENV_FILE"; echo "${BACKUP_DIR:-./backups}")"
BACKUP_REMOTE="$(set -a; . "./$ENV_FILE"; echo "${BACKUP_REMOTE:-}")"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/monthly"
stamp="$(date -u +%Y%m%d-%H%M%S)"
file="$BACKUP_DIR/daily/erp-$stamp.sql.gz"

echo "Backup do banco erp → $file"
# A senha vai por variável DENTRO do container (não aparece na lista de processos do servidor)
"${COMPOSE[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot \
  --single-transaction --quick --routines --triggers --events --no-tablespaces \
  --set-gtid-purged=OFF --default-character-set=utf8mb4 "$MYSQL_DATABASE"' \
  | gzip -9 > "$file.tmp"

gzip -t "$file.tmp"
if [ "$(gzip -cd "$file.tmp" | tail -n 1 | grep -c 'Dump completed')" -ne 1 ]; then
  echo "ERRO: o backup não terminou (falta 'Dump completed')." >&2
  rm -f "$file.tmp"
  exit 1
fi
mv "$file.tmp" "$file"
(cd "$(dirname "$file")" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")

# Mensal: o primeiro backup de cada mês fica 12 meses
month="$(date -u +%Y%m)"
if ! ls "$BACKUP_DIR/monthly/erp-$month"*.sql.gz >/dev/null 2>&1; then
  cp "$file" "$BACKUP_DIR/monthly/erp-$month.sql.gz"
  (cd "$BACKUP_DIR/monthly" && sha256sum "erp-$month.sql.gz" > "erp-$month.sql.gz.sha256")
fi

# Retenção
find "$BACKUP_DIR/daily" -name 'erp-*.sql.gz*' -mtime +30 -delete
ls -1t "$BACKUP_DIR/monthly"/erp-*.sql.gz 2>/dev/null | tail -n +13 | while read -r old; do
  rm -f "$old" "$old.sha256"
done

# Cópia externa (fora da Hostinger)
if [ -n "$BACKUP_REMOTE" ]; then
  rclone copy "$file" "$BACKUP_REMOTE/daily/" && rclone copy "$file.sha256" "$BACKUP_REMOTE/daily/"
  echo "Cópia externa enviada para $BACKUP_REMOTE"
else
  echo "AVISO: BACKUP_REMOTE vazio — o backup ficou só neste servidor." >&2
fi

echo "OK: $(du -h "$file" | cut -f1) — $file"
