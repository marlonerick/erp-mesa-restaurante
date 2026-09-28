# ADR-0004 — Identificadores

- Status: **Proposto**
- Data: 2026-09-27
- Responsável: architect

## Contexto
IDs aparecem em URLs (comanda, pedido), precisam ser não enumeráveis (defesa contra IDOR),
servir a várias lojas/empresas no mesmo banco e, no futuro (PWA offline — P1), ser gerados no cliente.

## Opções

| Opção | Prós | Contras |
|---|---|---|
| `BIGINT AUTO_INCREMENT` + `public_id` | PK pequena, joins rápidos | Duas colunas por tabela; mapeamento em toda borda; auto-incremento não gerável offline |
| UUIDv4 `BINARY(16)` | Gerável em qualquer lugar | Inserção aleatória fragmenta o índice clustered do InnoDB |
| **UUIDv7 `BINARY(16)`** | Gerável no cliente, ordenado no tempo (inserção sequencial no InnoDB), não enumerável na prática | 16 bytes por PK/FK; leitura humana exige conversão |
| ULID `CHAR(26)` | Legível | 26 bytes, comparação por collation |

## Decisão (proposta)
**UUIDv7 armazenado em `BINARY(16)`**, gerado na aplicação (tipo customizado no Drizzle;
string canônica nas bordas). Números humanos são colunas separadas quando necessário
(`customer_order.number` por dia operacional, `dining_table.number`, `terminal.code`).

Observação: UUIDv7 expõe o horário de criação — aceitável (não é dado sensível neste domínio).

## Consequências
- (+) Preparado para offline e multi-loja; sem colisões em merge de dados.
- (−) Índices um pouco maiores que BIGINT — irrelevante na escala do piloto e de médio porte.
