# Estratégia de performance

Performance é a 6ª prioridade — nunca troca correção por velocidade. Mas telas de operação
precisam responder rápido durante o pico do salão.

## Metas (servidor, p95, carga do piloto ×5)

| Operação | Meta p95 |
|---|---|
| Lançar item / enviar rodada | ≤ 300 ms |
| Registrar pagamento (com caixa, estoque, auditoria) | ≤ 500 ms |
| Polling KDS / mapa de mesas (sem mudanças) | ≤ 100 ms |
| Abrir mapa de mesas / comanda | ≤ 1 s até interativo em celular 4G |
| Relatório paginado (30 dias do piloto) | ≤ 2 s |

Carga de referência (Etapa 10): 10 mesas, 5 dispositivos fazendo polling, 60 itens/hora
no pico, multiplicado por 5.

## Práticas

- **Índices para toda consulta de tela e relatório**, sempre começando por `store_id`
  (ver docs/database/modelo-de-dados.md). `EXPLAIN` revisado pelo `architect` para queries novas.
- **N+1:** repositórios carregam agregados com joins/`IN` explícitos; teste de integração conta
  queries nas telas críticas (mapa de mesas, comanda, KDS, pré-conta).
- **Polling barato:** cursor `since` (maior `updated_at` visto) + resposta vazia quando nada mudou;
  pausa com a aba em segundo plano.
- **Paginação e filtros no servidor** em toda listagem (cursor ou `LIMIT/OFFSET` limitado a 100).
- **Transações curtas:** nada de I/O externo dentro de transação; `FOR UPDATE` apenas nas linhas necessárias.
- **Relatórios:** consultas sobre dados já desnormalizados na escrita (preço congelado,
  `operational_date` gravado) para evitar recalcular histórico. Tabelas de agregação só com
  necessidade comprovada.
- **Frontend:** RSC para leitura inicial, bundle das telas do garçom e KDS medido no CI
  (limite a definir na Etapa 1), imagens de produto fora do MVP.
- **Pool de conexões** MySQL dimensionado para processo persistente (ADR-0011).

## Verificação

- Etapas 6–8: teste de performance simples (script k6 ou autocannon — escolher na Etapa 10
  com aprovação) nas operações da tabela.
- Etapa 10: carga leve do golden path e relatório registrado em `docs/testing/`.
