#!/usr/bin/env bash
# Publica uma versão nova no servidor (docs/deployment/roteiro-tecnico.md). Rodar FORA do horário
# do restaurante. Uso, na pasta deploy/:  ./update.sh
#   1. backup antes de tudo   2. baixa o código (main) e constrói a imagem com a marca do commit
#   3. aplica as migrations   4. troca a aplicação e confere o /ready
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose -f compose.prod.yml --env-file "$ENV_FILE")
current="$(docker inspect --format '{{.Config.Image}}' "$("${COMPOSE[@]}" ps -q app)" 2>/dev/null || echo 'nenhuma')"

echo "1/4 Backup antes da atualização"
./backup.sh

echo "2/4 Código e imagem"
git -C .. pull --ff-only
export APP_VERSION
APP_VERSION="$(git -C .. rev-parse --short HEAD)"
"${COMPOSE[@]}" build app

echo "3/4 Migrations (versão $APP_VERSION)"
"${COMPOSE[@]}" run --rm migrate

echo "4/4 Trocando a aplicação"
"${COMPOSE[@]}" up -d app caddy
domain="$(set -a; . "./$ENV_FILE"; echo "$APP_ORIGIN")"
for attempt in $(seq 1 30); do
  if curl -fsS "$domain/ready" >/dev/null 2>&1; then
    echo "OK: versão $APP_VERSION no ar ($domain)."
    echo "Para voltar à anterior ($current), SEM migrations novas no meio:"
    echo "  APP_VERSION=${current#*:} docker compose -f compose.prod.yml --env-file $ENV_FILE up -d app"
    echo "Com migrations novas, volte pelo backup: ./restore.sh <o backup feito agora>"
    exit 0
  fi
  sleep 2
done
echo "ERRO: o /ready não respondeu em 60 s. Veja: docker compose -f compose.prod.yml logs app" >&2
exit 1
