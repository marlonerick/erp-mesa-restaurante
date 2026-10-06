# syntax=docker/dockerfile:1
# Imagem de produção do ERP (ADR-0011, Etapa 10). Build a partir da raiz do repositório:
#   docker build -f deploy/Dockerfile -t erp-restaurante .
# /app  = servidor Next (build "standalone")
# /ops  = ferramentas de operação: migrations, primeiro administrador, limpeza diária

FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /build

# Dependências completas (para o build)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Build do Next (baixa a fonte do Google uma vez e serve do próprio site)
FROM deps AS build
COPY . .
RUN npm run build

# Só as dependências de produção (para as ferramentas de operação)
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=UTC
WORKDIR /app
COPY --from=build --chown=node:node /build/.next/standalone ./
COPY --from=prod-deps --chown=node:node /build/node_modules /ops/node_modules
COPY --from=build --chown=node:node /build/package.json /build/tsconfig.json /ops/
COPY --from=build --chown=node:node /build/scripts /ops/scripts
COPY --from=build --chown=node:node /build/src /ops/src
COPY --from=build --chown=node:node /build/drizzle /ops/drizzle
# Sem privilégios de administrador dentro do container
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
