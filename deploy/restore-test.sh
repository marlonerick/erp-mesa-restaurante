#!/usr/bin/env bash
# Teste de restauração (Etapa 10): "backup só vale depois de restaurado" (README B.8).
# Restaura um backup num banco SEPARADO (erp_restore_test), confere e apaga. A produção não muda.
# Uso, na pasta deploy/ do servidor:  ./restore-test.sh [arquivo.sql.gz]   (padrão: o mais novo)
# Rodar antes do piloto e uma vez por mês (docs/deployment/backup.md).
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose -f compose.prod.yml --env-file "$ENV_FILE")
BACKUP_DIR="$(set -a; . "./$ENV_FILE"; echo "${BACKUP_DIR:-./backups}")"
APP_DB_PASSWORD="$(set -a; . "./$ENV_FILE"; echo "$APP_DB_PASSWORD")"
TEST_DB=erp_restore_test

file="${1:-$(ls -1t "$BACKUP_DIR"/daily/erp-*.sql.gz | head -n 1)}"
echo "1/4 Conferindo o arquivo $file"
(cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256")
gzip -t "$file"

root_sql() {
  "${COMPOSE[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --batch --skip-column-names "$@"' sh "$@"
}

cleanup() {
  root_sql -e "DROP DATABASE IF EXISTS $TEST_DB; REVOKE ALL PRIVILEGES ON $TEST_DB.* FROM 'erp_app'@'%';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "2/4 Restaurando em $TEST_DB (banco separado)"
root_sql -e "DROP DATABASE IF EXISTS $TEST_DB; CREATE DATABASE $TEST_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
gzip -cd "$file" | root_sql "$TEST_DB"

echo "3/4 Conferindo estrutura, migrations, triggers e dados"
failures=0
check() { # check <descrição> <esperado> <obtido>
  if [ "$2" = "$3" ]; then echo "  ok  $1 ($3)"; else echo "  ERRO $1: esperado $2, obtido $3"; failures=$((failures + 1)); fi
}
q() { root_sql -e "$1"; }
check "tabelas" "$(q "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='erp'")" \
  "$(q "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TEST_DB'")"
check "triggers (auditoria imutável)" "$(q "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='erp'")" \
  "$(q "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='$TEST_DB'")"
check "migrations aplicadas" "$(q "SELECT COUNT(*) FROM erp.__drizzle_migrations")" \
  "$(q "SELECT COUNT(*) FROM $TEST_DB.__drizzle_migrations")"
for table in organization store app_user product customer_order payment cash_session stock_movement finance_entry audit_log; do
  live="$(q "SELECT COUNT(*) FROM erp.$table")"
  restored="$(q "SELECT COUNT(*) FROM $TEST_DB.$table")"
  # O backup é de antes: o banco no ar pode ter MAIS linhas, nunca menos
  if [ "$restored" -le "$live" ] && { [ "$live" -eq 0 ] || [ "$restored" -gt 0 ]; }; then
    echo "  ok  $table: $restored linhas no backup ($live agora)"
  else
    echo "  ERRO $table: $restored no backup, $live agora"; failures=$((failures + 1))
  fi
done
if root_sql -e "UPDATE $TEST_DB.audit_log SET event = event LIMIT 1" >/dev/null 2>&1; then
  echo "  ERRO a auditoria restaurada aceitou alteração (trigger ausente)"; failures=$((failures + 1))
else
  echo "  ok  auditoria restaurada continua imutável"
fi

echo "4/4 O sistema lê o banco restaurado"
root_sql -e "GRANT SELECT ON $TEST_DB.* TO 'erp_app'@'%';"
if "${COMPOSE[@]}" run --rm --no-deps -T \
  -e DATABASE_URL="mysql://erp_app:${APP_DB_PASSWORD}@db:3306/$TEST_DB" \
  ops scripts/restore-check.ts; then
  echo "  ok  o sistema conectou e leu o banco restaurado"
else
  echo "  ERRO o sistema não leu o banco restaurado"; failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
  echo "RESTAURAÇÃO COM $failures ERRO(S) — o backup NÃO está garantido." >&2
  exit 1
fi
echo "RESTAURAÇÃO OK: $file pode ser usado para recuperar o sistema."
