# Backup e restauração (Etapa 10)

"Backup só vale depois de restaurado" (README B.8). Com a Hostinger (E10-1), o banco roda na
própria VPS: **o backup é nosso**.

## O que existe

| Script (pasta `deploy/`) | O que faz |
|---|---|
| `backup.sh` | Cópia completa e consistente do banco `erp` (`mysqldump --single-transaction`: não trava o restaurante), compactada, com conferência (descompacta inteiro, "Dump completed") e `.sha256`. Retenção: **30 diários + 12 mensais**. Cópia **externa** opcional com `rclone` (`BACKUP_REMOTE`) |
| `restore-test.sh` | Restaura um backup num banco **separado** (`erp_restore_test`), confere tabelas, migrations, triggers da auditoria (continua imutável), quantidade de linhas das tabelas principais, e faz **o próprio sistema** ler o banco restaurado (`scripts/restore-check.ts`). Apaga o banco de teste no fim. A produção não muda |
| `restore.sh` | **Recuperação de verdade**: para a aplicação, recria o banco `erp` a partir do backup e religa. Pede para digitar `RESTAURAR` |

Agenda (crontab): backup às 04:30, teste de restauração no dia 1 de cada mês — ver o
[roteiro técnico](roteiro-tecnico.md).

## Cópia fora do servidor

Se a VPS for perdida, os backups dentro dela vão junto. Antes do piloto, configure o `rclone` para
um destino externo (ex.: Google Drive, Backblaze B2, outro provedor) e preencha
`BACKUP_REMOTE=remoto:erp` no `.env.production`. Sem isso, o `backup.sh` avisa a cada execução.
A Hostinger também oferece cópias da VPS inteira pelo painel — são um complemento, não substituem
o backup do banco.

## Ir além do último backup (binlog)

O MySQL guarda o binlog por 7 dias. Para recuperar até um momento exato (ex.: 10 minutos antes de
um erro grave), restaure o último backup e aplique o binlog até o horário desejado com
`mysqlbinlog --stop-datetime=…` dentro do container `db`. Procedimento raro: fazer com apoio
técnico.

## Testes feitos (2026-10-06, pilha de produção completa no computador de desenvolvimento)

1. Pilha `compose.prod.yml` do zero (imagem construída, migrations, primeiro administrador, HTTPS
   local com cookie `__Host-erp_session` seguro).
2. 1 minuto de operação real dentro dela (`scripts/load-test.ts`: 13 contas, 10 pagamentos, 136
   movimentações de estoque, 1 lançamento financeiro, 101 registros de auditoria).
3. `backup.sh` → `restore-test.sh`: **RESTAURAÇÃO OK** (44 tabelas, 4 triggers, 14 migrations,
   auditoria imutável, sistema lendo o banco restaurado).
4. **Ensaio de desastre:** o banco de produção foi apagado (`DROP DATABASE erp`) e recuperado com
   `restore.sh`: as mesmas contagens antes e depois, `/ready` 200 e o gerente entrou normalmente.

**Achado no ensaio:** com o banco apagado, o `/ready` continuava respondendo 200 (só fazia
`SELECT 1`). Corrigido: agora ele lê a tabela `store` — banco apagado ou sem migrations → 503
(teste de integração novo em `readiness.test.ts`).

Repetir o teste de restauração **na VPS** antes do piloto e uma vez por mês.
