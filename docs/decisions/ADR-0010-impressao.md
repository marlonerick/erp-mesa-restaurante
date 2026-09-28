# ADR-0010 — Impressão

- Status: **Aceito** em 2026-09-28 (ESC/POS reavaliado conforme resposta à Q-02)
- Data: 2026-09-27
- Responsável: architect

## Contexto
Nenhum documento original trata de impressão. Pré-conta é quase universal; via de cozinha
depende da operação (KDS pode substituir).

## Opções
1. **Impressão via navegador** (HTML + CSS `@media print` + `window.print()`), funciona com qualquer impressora instalada no SO, inclusive térmica com driver.
2. **ESC/POS** direto: exige agente local (serviço no computador do caixa) ou impressora de rede acessível pelo servidor; impressão silenciosa e automática.
3. Serviço de terceiros de impressão em nuvem.

## Decisão (proposta)
- MVP: **opção 1** para a pré-conta (layout 80 mm e A4) atrás da porta `PrintService`
  (`BrowserPrintService`). Pré-conta traz aviso "NÃO É DOCUMENTO FISCAL".
- Via de cozinha: KDS é o canal principal; impressão de ticket pelo navegador disponível como paliativo.
- ESC/POS (opção 2): **P1**, ou **P0** se o piloto exigir impressão automática na cozinha — neste caso
  vira ADR próprio antes da Etapa 7.

## Consequências
- (+) Zero infraestrutura nova no MVP.
- (−) `window.print()` mostra diálogo (a menos que o navegador seja configurado em modo quiosque) — aceitável para pré-conta.
