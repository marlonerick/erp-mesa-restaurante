# ADR-0001 — ORM e migrations

- Status: **Proposto**
- Data: 2026-09-27
- Responsável: architect

## Contexto
Precisamos de acesso tipado ao MySQL 8.4 com transações interativas, locking otimista
(`UPDATE ... WHERE version = ?` verificando linhas afetadas), `SELECT ... FOR UPDATE` pontual,
`DECIMAL` sem perda, colunas geradas (índice de "um caixa aberto por terminal"), migrations
revisáveis e testes contra MySQL real.

## Opções

| Critério | Prisma | Drizzle |
|---|---|---|
| TypeScript | Excelente (client gerado) | Excelente (schema em TS, inferência direta) |
| Migrations | `prisma migrate`, maduro | `drizzle-kit generate` gera SQL versionado; menos maduro em casos de rename |
| Transações | Interativas (`$transaction(fn)`), com timeout padrão curto | Interativas nativas, sem timeout implícito |
| Locking pessimista | Não há API para `FOR UPDATE` — exige `$queryRaw` | `.for('update')` nativo |
| Locking otimista | `updateMany` + `count` | `update ... where` + `affectedRows` |
| Colunas geradas / CHECK / índices funcionais | Suporte parcial; frequentemente exige SQL manual na migration | Suporte a colunas geradas; SQL manual quando necessário |
| DECIMAL | `Prisma.Decimal` (decimal.js) | string (converte para nosso `Quantity`) |
| Performance / runtime | Motor de query próprio (versões recentes reduziram o overhead) | Camada fina sobre `mysql2` |
| Testes | Bom | Bom; SQL previsível facilita `EXPLAIN` |
| Manutenção | Empresa estabelecida, grande comunidade | Comunidade grande e ativa, projeto mais jovem |

## Decisão (proposta)
**Drizzle ORM + drizzle-kit + mysql2.** Motivos: controle explícito do SQL (importante para
locking, transações e revisão de índices), `FOR UPDATE` nativo e camada fina que não esconde bugs do MySQL.

Regras:
- Migrations **geradas** (`drizzle-kit generate`), revisadas pelo `architect` e versionadas em `/drizzle`.
  `drizzle-kit push` proibido fora de dev descartável.
- Ajustes que o gerador não expressa (grants, CHECKs complexos) entram como migration SQL manual revisada.
- Repositórios são a única camada que importa Drizzle.

## Consequências
- (+) SQL legível, fácil de revisar e otimizar.
- (−) Migrations com rename exigem atenção manual; mitigado por revisão obrigatória.
- (−) Menos "baterias incluídas" que o Prisma (ex.: sem studio obrigatório) — aceitável.
