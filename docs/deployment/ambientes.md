# Ambientes, versões e backup

Decisão proposta em [ADR-0011](../decisions/ADR-0011-deploy-e-versoes.md). Hospedagem depende
da pergunta Q-03.

## Versões

| Componente | Versão | Motivo |
|---|---|---|
| Node.js | 24 LTS | LTS ativo; Node 22 entra em fim de vida em abril/2027, antes do fim previsto do piloto+estabilização |
| MySQL | 8.4 LTS | Série LTS da Oracle; 8.0 chegou ao fim de vida em abril/2026 |
| Next.js / React | Última estável na Etapa 1, fixada no lockfile | Upgrade de major só com ADR |
| Docker | Engine atual + Compose v2 | Dev, testes e imagem de produção |

## Ambientes

| Ambiente | Onde | Banco | Dados |
|---|---|---|---|
| dev | Máquina do desenvolvedor | MySQL 8.4 em Docker Compose | Seed de desenvolvimento |
| test (CI) | Runner do CI | Testcontainers / Compose | Fixtures por teste |
| staging | Mesmo provedor da produção | MySQL gerenciado separado | Seed de homologação (nunca dados reais) |
| production | Container Node persistente, região São Paulo | MySQL 8.4 gerenciado, região São Paulo | Dados reais do piloto |

## Configuração

- Variáveis de ambiente validadas com Zod na inicialização (falha rápida).
- `.env.example` versionado sem valores reais.
- `TZ=UTC` no processo e `time_zone='+00:00'` na conexão MySQL.

## Parâmetros obrigatórios do MySQL (todos os ambientes)

| Parâmetro | Valor | Motivo |
|---|---|---|
| `log_bin_trust_function_creators` | `1` | Com o binlog ligado (necessário para backup ponto-no-tempo), o MySQL só permite ao usuário de migration criar os **triggers da auditoria imutável** com este parâmetro (erro 1419 sem ele). Em MySQL gerenciado, ajustar no grupo de parâmetros do provedor |
| `sql_mode` | estrito (`STRICT_TRANS_TABLES`, …) | Recusar dados inválidos em vez de ajustá-los em silêncio |
| `default_time_zone` | `+00:00` (recomendado) | A aplicação já força UTC por conexão; manter o servidor em UTC evita confusão em consultas manuais |
| `character_set_server` / `collation_server` | `utf8mb4` / `utf8mb4_0900_ai_ci` | Acentos e emojis |

## Backup e restauração

- Backup lógico diário (`mysqldump --single-transaction` ou snapshot do provedor) + binlog para
  recuperação ponto-no-tempo.
- Retenção proposta: diários por 30 dias, mensais por 12 meses (Q-13).
- **Backup só é válido após restauração testada**: teste de restauração documentado na Etapa 10
  e repetido mensalmente durante o piloto.

## Deploy

- Imagem Docker (`output: standalone`), migrations aplicadas por etapa explícita antes do start
  (usuário de migration separado).
- `/health` (liveness) e `/ready` (conexão com banco) usados pelo orquestrador.
- Deploy fora do horário de operação do restaurante durante o piloto.
