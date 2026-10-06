# ADR-0011 — Ambiente de deploy e versões

- Status: **Aceito** em 2026-09-28; **atualizado em 2026-10-06** com a hospedagem (E10-1)
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

## Atualização de 2026-10-06 — Hostinger (E10-1)

O usuário escolheu a **Hostinger** (Q-03). A hospedagem comum da Hostinger não roda um processo
Node persistente com MySQL 8.4 sob nosso controle; por isso o piloto usa uma **VPS** (KVM, Ubuntu
24.04, datacenter no Brasil se disponível) com a terceira opção da tabela acima — **VPS única com
Docker Compose** —, montada para reduzir os contras:

- `deploy/compose.prod.yml`: MySQL 8.4 (mesmo digest do CI, sem porta aberta, binlog de 7 dias),
  aplicação (`deploy/Dockerfile`, usuário sem privilégios, sistema de arquivos só leitura) e Caddy
  (HTTPS automático com Let's Encrypt; sobrescreve o `X-Forwarded-For` → `TRUST_PROXY=true`).
- **Backup por nossa conta**: `backup.sh` diário (30 diários + 12 mensais, cópia externa com
  rclone), `restore-test.sh` mensal e `restore.sh` para recuperar — testados num ensaio de desastre
  (docs/deployment/backup.md).
- Atualização por `update.sh` (backup antes, imagem com a marca do commit, migrations, /ready).
- Sem staging separado no piloto: a homologação é a mesma pilha rodando no computador de
  desenvolvimento (testada). Revisar após o piloto (banco gerenciado, staging dedicado) conforme o
  volume.

Consequências: (+) custo baixo e previsível, controle total, a mesma pilha em desenvolvimento e
produção; (−) alta disponibilidade e backup dependem de nós (mitigado pelos scripts e pela cópia
externa); um único servidor é ponto único de falha (aceito no piloto, com o manual de contingência).
