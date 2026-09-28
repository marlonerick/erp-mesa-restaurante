# ADR-0011 — Ambiente de deploy e versões

- Status: **Aceito** em 2026-09-28 (provedor de hospedagem pendente — Q-03)
- Data: 2026-09-27
- Responsável: architect

## Contexto
Piloto em restaurante no Brasil; latência importa (garçom no celular, KDS). MySQL exige pool de
conexões estável. Polling do KDS gera requisições contínuas.

## Opções de hospedagem

| Opção | Prós | Contras |
|---|---|---|
| Serverless (ex.: Vercel) + MySQL gerenciado | Deploy simples | Pool de conexões MySQL problemático; custo por invocação com polling contínuo; região de funções x banco |
| **Container Node persistente + MySQL gerenciado (região São Paulo)** | Pool estável, SSE possível no futuro, custo previsível | Operar container (healthcheck, deploy) |
| VPS única com Docker Compose (app + MySQL) | Mais barato | Backup/HA por nossa conta; risco maior de perda de dados |

## Decisão (proposta)
- **Container Node persistente** (`output: standalone`) + **MySQL 8.4 gerenciado**, ambos na região
  São Paulo, em provedor a definir com o usuário (Q-03).
- Versões: **Node.js 24 LTS**, **MySQL 8.4 LTS**, Next.js/React última estável fixada na Etapa 1.
- **TypeScript 6.0.x** (decisão D-1, 2026-09-28): o TypeScript 7 (compilador nativo) ainda não é
  suportado pelo `typescript-eslint`; migração futura por novo ADR quando houver suporte.
- Gerenciador de pacotes: **npm** (decisão D-3, 2026-09-28), com `package-lock.json` versionado e `npm ci` no CI.
- Staging separado da produção; migrations em passo explícito do deploy.

## Consequências
- (+) Compatível com polling, SSE futuro e pool MySQL.
- (−) Custo mensal fixo (a estimar após escolha do provedor).
