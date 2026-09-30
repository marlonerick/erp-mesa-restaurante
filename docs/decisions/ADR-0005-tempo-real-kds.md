# ADR-0005 — Tempo real do KDS e do mapa de mesas

- Status: **Aceito** em 2026-09-28
- Data: 2026-09-27
- Responsável: architect

## Contexto
KDS precisa ver tickets novos em poucos segundos; garçons precisam ver itens prontos e o
estado das mesas. Piloto: 1 estação, ~5 dispositivos. Monólito sem Redis.

## Opções

| Critério | Polling curto | SSE | WebSocket |
|---|---|---|---|
| Latência | 3–5 s | < 1 s | < 1 s |
| Complexidade | Baixa (TanStack Query `refetchInterval`) | Média: conexão longa, fan-out entre instâncias exige pub/sub | Alta: servidor dedicado ou adapter, pub/sub |
| Compatibilidade de hospedagem | Qualquer | Exige processo persistente e proxy sem buffering | Idem + upgrade de protocolo |
| Reconexão | Natural | `EventSource` reconecta | Implementação própria |
| Custo com 5 dispositivos | ~2 req/s — desprezível | Baixo | Baixo |

## Decisão (proposta)
**Polling curto** no MVP: KDS a cada 3 s, mapa de mesas/comanda a cada 5 s, com cursor `since`
(retorna só mudanças) e pausa quando a aba está oculta. A camada de leitura é isolada
(`KitchenFeed`, `TableFeed`) para trocar por SSE sem mudar a UI.

Gatilho para migrar a SSE (novo ADR): > 30 dispositivos por loja ou exigência de latência < 1 s,
ou custo de polling mensurável.

## Implementação (Etapa 7, 2026-09-30)
KDS a cada 3 s pela rota `GET /api/cozinha`, que devolve a **fila completa** da estação (não só as
mudanças) + a hora do servidor para o cronômetro. O cursor `since` foi adiado: com dezenas de
tickets a leitura completa é barata (índices da fila e de "prontos há pouco"), e um cursor por hora
pode perder uma mudança gravada com hora anterior e confirmada depois da leitura. Rever com mais de
100 tickets na fila ou se o polling aparecer no monitoramento (docs/modules/kitchen.md §12).

## Consequências
- (+) Simples, robusto a rede instável, sem infraestrutura nova.
- (−) Até 3 s de atraso no KDS — aceitável para cozinha (confirmar no piloto).
