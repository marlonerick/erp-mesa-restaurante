# ADR-0011 — Ambiente de deploy e versões

- Status: **Proposto** (hospedagem depende da pergunta Q-03)
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
- Staging separado da produção; migrations em passo explícito do deploy.

## Consequências
- (+) Compatível com polling, SSE futuro e pool MySQL.
- (−) Custo mensal fixo (a estimar após escolha do provedor).
