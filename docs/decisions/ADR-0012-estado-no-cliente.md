# ADR-0012 — Estado no cliente

- Status: **Aceito** em 2026-09-28
- Data: 2026-09-27
- Responsável: architect + frontend

## Contexto
O README pede TanStack Query e Zustand apenas com estado local complexo comprovado.

## Decisão (proposta)
- Leitura inicial por React Server Components.
- **TanStack Query** para dados de servidor que mudam na tela aberta: polling do KDS e mapa de mesas,
  comanda, retry de mutações idempotentes com a mesma `idempotencyKey`.
- Estado de formulário: React Hook Form + Zod.
- Estado de UI local: `useState`/`useReducer`. **Sem Zustand** no MVP.
- A comanda com itens `PENDENTE` é persistida **no servidor** (não no cliente), para não perder
  lançamentos em troca de dispositivo ou queda de conexão.

Gatilho para Zustand (novo ADR): PWA offline (P1) ou estado compartilhado entre muitas telas sem servidor.

## Consequências
- (+) Uma fonte de verdade (servidor); menos bugs de sincronização.
- (−) Lançar item exige rede — coerente com MVP online.
