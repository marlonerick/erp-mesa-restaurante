# Teste de carga leve (Etapa 10)

Simula o piloto (README B.11): 1 loja, **10 mesas girando ao mesmo tempo**, 2 garçons, cozinha,
caixa e gerente — `scripts/load-test.ts` (`npm run load:test`).

- **Pela rede, com sessões reais**, as leituras automáticas das telas: salão (5 s), comanda
  aberta (5 s), cozinha (3 s) e painel (30 s, gerente e caixa).
- **Pelos mesmos casos de uso das telas**, no mesmo banco: abrir mesa, lançar 3–4 itens, enviar
  a rodada, cozinha "tudo pronto", pedir a conta, caixa recebe no PIX, liberar a mesa — e de novo.
- Cria um terminal de caixa, abre e fecha o caixa e cadastra as mesas da execução (números
  `L…`): rode só em banco de teste/homologação, **nunca na produção**.

## Metas

| O quê | Meta |
|---|---|
| Leituras das telas (HTTP) | 95% das respostas em até **300 ms**, sem erro |
| Operações (lançar, enviar, receber…) | 95% em até **500 ms**, sem erro (deadlocks são refeitos — ADR-0008) |

O script termina com código 1 se alguma meta falhar.

## Como rodar (máquina de desenvolvimento)

1. `npm run db:e2e:reset` e, com as variáveis do banco de E2E (as mesmas do `playwright.config.ts`),
   `node scripts/migrate.ts && npm run db:seed && npm run build`.
2. Suba o servidor de produção: `node .next/standalone/server.js` (porta 3100).
3. Em outro terminal: `BASE_URL=http://localhost:3100 DATABASE_URL=…/erp_e2e LOAD_SECONDS=180 npm run load:test`.

Em homologação (Hostinger), repetir antes do piloto apontando `BASE_URL` e `DATABASE_URL` para o
servidor de homologação.

## Resultado (2026-10-06, computador de desenvolvimento, MySQL 8.4 em Docker)

180 s, 10 mesas — **dentro da meta, 0 erros**.

| Operação | Vezes | Mediana (ms) | p95 (ms) | Máx (ms) |
|---|---|---|---|---|
| GET /api/comandas/:id | 485 | 32 | 36 | 58 |
| GET /api/salao | 75 | 30 | 34 | 45 |
| GET /api/cozinha | 59 | 35 | 42 | 52 |
| GET /api/painel | 14 | 37 | 51 | 51 |
| abrir mesa | 60 | 15 | 154 | 192 |
| lançar item | 240 | 16 | 47 | 231 |
| enviar rodada | 60 | 37 | 54 | 108 |
| cozinha: ler fila | 61 | 11 | 14 | 69 |
| cozinha: tudo pronto | 55 | 16 | 34 | 57 |
| pedir conta | 60 | 14 | 20 | 274 |
| caixa: contas a receber | 85 | 5 | 6 | 68 |
| caixa: receber PIX | 59 | 26 | 41 | 90 |
| liberar mesa | 50 | 12 | 23 | 164 |

Na primeira execução apareceram dois "erros" que eram do próprio script (escolheu um produto com
adicional obrigatório; tentou liberar mesa ainda não paga) — o sistema recusou corretamente, e o
script foi ajustado. Nenhum deadlock sem recuperação.
