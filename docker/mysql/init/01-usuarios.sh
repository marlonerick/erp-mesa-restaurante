#!/bin/bash
# Executado UMA vez, na criação do volume do MySQL de desenvolvimento.
# Cria dois usuários com privilégios mínimos (docs/security/estrategia-seguranca.md §4):
#   - aplicação: apenas dados (SELECT/INSERT/UPDATE/DELETE)
#   - migrator:  estrutura (DDL) e concessão de privilégios
set -euo pipefail

databases="${MYSQL_DATABASE} ${EXTRA_DATABASES:-}"

sql=""
for db in $databases; do
  sql+="CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
done

sql+="CREATE USER IF NOT EXISTS '${APP_DB_USER}'@'%' IDENTIFIED BY '${APP_DB_PASSWORD}';"
sql+="CREATE USER IF NOT EXISTS '${MIGRATOR_DB_USER}'@'%' IDENTIFIED BY '${MIGRATOR_DB_PASSWORD}';"

for db in $databases; do
  sql+="GRANT SELECT, INSERT, UPDATE, DELETE ON \`${db}\`.* TO '${APP_DB_USER}'@'%';"
  sql+="GRANT ALL PRIVILEGES ON \`${db}\`.* TO '${MIGRATOR_DB_USER}'@'%' WITH GRANT OPTION;"
done

sql+="FLUSH PRIVILEGES;"

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" -e "$sql"
echo "Usuários ${APP_DB_USER} e ${MIGRATOR_DB_USER} criados para: ${databases}"
