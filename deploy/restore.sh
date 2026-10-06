#!/usr/bin/env bash
# RECUPERAÇÃO do banco a partir de um backup (docs/deployment/backup.md). SUBSTITUI o banco `erp`.
# Uso, na pasta deploy/ do servidor:  ./restore.sh backups/daily/erp-AAAAMMDD-HHMMSS.sql.gz
# A aplicação é parada antes e religada depois. Pede confirmação (digite RESTAURAR).
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose -f compose.prod.yml --env-file "$ENV_FILE")
file="${1:?informe o arquivo de backup (.sql.gz)}"

(cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256")
gzip -t "$file"

if [ "${CONFIRM:-}" != "RESTAURAR" ]; then
  echo "ATENÇÃO: o banco atual será SUBSTITUÍDO pelo backup $file."
  echo "Tudo o que foi lançado depois desse backup se perde (use o binlog para ir além — backup.md)."
  read -r -p "Digite RESTAURAR para continuar: " answer
  [ "$answer" = "RESTAURAR" ] || { echo "Cancelado. Nada mudou."; exit 1; }
fi

root_sql() {
  "${COMPOSE[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$@"' sh "$@"
}

echo "1/4 Parando a aplicação"
"${COMPOSE[@]}" stop app
echo "2/4 Recriando o banco erp"
root_sql -e "DROP DATABASE IF EXISTS erp; CREATE DATABASE erp CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
echo "3/4 Carregando o backup"
gzip -cd "$file" | root_sql erp
echo "4/4 Religando a aplicação"
"${COMPOSE[@]}" up -d app
echo "Banco restaurado de $file. Confira em /ready e entre no sistema."
