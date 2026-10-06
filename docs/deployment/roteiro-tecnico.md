# Roteiro técnico — servidor da Hostinger (Etapa 10)

Para quem cuida do servidor. A equipe do restaurante usa o manual em `docs/manual/`.
Decisões: E10-1 (Hostinger, VPS única), E10-2 (o dono cria a conta), E10-3 (o dono cria o domínio),
[ADR-0011](../decisions/ADR-0011-deploy-e-versoes.md).

## Como fica no servidor

```text
Internet ──443/80──▶ caddy (HTTPS automático) ──▶ app (Next, porta 3000) ──▶ db (MySQL 8.4)
                                                        ▲                       (sem porta aberta)
                              ops / migrate (sob demanda)┘
```

Tudo em `deploy/compose.prod.yml`. Só as portas 80 e 443 ficam abertas; o banco não é acessível
de fora. Dados do banco no volume `mysql-data`; certificados no volume `caddy-data`.

## 1. Preparar a VPS (uma vez)

1. Na Hostinger: **VPS (KVM)** com pelo menos **2 vCPU e 4 GB de RAM**, **Ubuntu 24.04**, datacenter
   no **Brasil** se o painel oferecer. Anote o IP.
2. No painel do domínio: crie um registro **A** do endereço do sistema (ex.:
   `sistema.seurestaurante.com.br`) apontando para o IP da VPS. Espere propagar
   (`ping sistema.seurestaurante.com.br` mostra o IP).
3. Entre por SSH e prepare:
   ```bash
   apt update && apt upgrade -y
   adduser erp && usermod -aG sudo erp           # usuário próprio, não root
   # Docker oficial (com o plugin compose)
   curl -fsSL https://get.docker.com | sh && usermod -aG docker erp
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   timedatectl set-timezone America/Sao_Paulo    # horário do cron (o sistema usa UTC por dentro)
   ```
4. Como `erp`: `git clone https://github.com/marlonerick/erp-mesa-restaurante.git && cd erp-mesa-restaurante/deploy`
5. `cp .env.production.example .env.production` e preencha (senhas com `openssl rand -hex 24`;
   `DOMAIN` e `APP_ORIGIN=https://…` com o endereço do item 2). `chmod 600 .env.production`.

## 2. Primeira instalação

```bash
cd ~/erp-mesa-restaurante/deploy
export APP_VERSION=$(git -C .. rev-parse --short HEAD)
docker compose -f compose.prod.yml --env-file .env.production up -d --build
docker compose -f compose.prod.yml --env-file .env.production run --rm migrate
# Primeiro administrador (pergunta nome do restaurante, loja, usuário e senha)
docker compose -f compose.prod.yml --env-file .env.production run --rm ops scripts/admin-create.ts
curl -fsS https://SEU.DOMINIO/ready        # {"status":"ok",…}
```

Depois, entre no sistema como administrador e siga o manual do administrador
(`docs/manual/administrador.md`): loja, terminais, equipe, cardápio, estoque, mesas.
**Nunca** rode o seed de demonstração na produção (ele é recusado sem `ALLOW_DEMO_SEED`).

Conferência rápida pelo navegador (de outro computador):
`SMOKE_URL=https://SEU.DOMINIO SMOKE_USER=admin SMOKE_PASSWORD=… node scripts/smoke-https.mjs`.

## 3. Tarefas agendadas (crontab do usuário `erp`)

```cron
# Backup diário às 04:30 (antes da virada do dia às 05:00, restaurante fechado)
30 4 * * * cd ~/erp-mesa-restaurante/deploy && ./backup.sh >> backups/backup.log 2>&1
# Limpeza de sessões e logs técnicos com mais de 90 dias (Q-13b) às 04:45
45 4 * * * cd ~/erp-mesa-restaurante/deploy && docker compose -f compose.prod.yml --env-file .env.production run --rm ops scripts/maintenance-purge.ts >> backups/purge.log 2>&1
# Teste de restauração no dia 1 de cada mês às 05:15
15 5 1 * * cd ~/erp-mesa-restaurante/deploy && ./restore-test.sh >> backups/restore-test.log 2>&1
```

Backup e restauração em detalhe: [backup.md](backup.md).

## 4. Atualizar o sistema

Sempre **fora do horário do restaurante** (o piloto funciona até as 15:00 — Q-05):

```bash
cd ~/erp-mesa-restaurante/deploy && ./update.sh
```

O `update.sh` faz backup, baixa a `main`, constrói a imagem com a marca do commit, aplica as
migrations, troca a aplicação e confere o `/ready`. No fim ele mostra como voltar.

**Voltar à versão anterior:**
- Sem migration nova entre as duas versões: `APP_VERSION=<marca anterior> docker compose -f compose.prod.yml --env-file .env.production up -d app`.
- Com migration nova: restaurar o backup feito pelo `update.sh` (`./restore.sh …`) e subir a
  versão anterior. As migrations só andam para frente.

## 5. Acompanhar

| O quê | Como |
|---|---|
| Está no ar? | `curl https://SEU.DOMINIO/ready` → 200 (confere a tabela da loja, não só a conexão). Recomendado: monitor externo gratuito (ex.: UptimeRobot) a cada 5 min |
| Registros | `docker compose -f compose.prod.yml logs -f app` (JSON, com `requestId`; sem senha nem token) |
| Espaço em disco | `df -h` e `du -sh backups` (o binlog do MySQL fica 7 dias) |
| Certificado | renovado sozinho pelo Caddy; `docker compose … logs caddy` se o HTTPS falhar |

## 6. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| HTTPS não sai | Domínio ainda não aponta para o IP, ou portas 80/443 fechadas | Conferir DNS e `ufw status`; ver `logs caddy` |
| `/ready` 503 | Banco parado ou sem as tabelas | `docker compose … ps`; `logs db`; se o banco sumiu, `./restore.sh` com o último backup |
| "Muitas tentativas" no login | Limite de 5 erros por usuário / 30 por IP em 15 min (proteção) | Esperar 15 min; se esqueceu a senha, o gerente redefine |
| Tela "Sem conexão…" | Internet do restaurante | Ver o manual (contingência em papel); nada se duplica ao reenviar |
