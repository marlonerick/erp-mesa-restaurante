# Etapa 7 — KDS: tela da cozinha (`semana-7`)

Plano aprovado em 2026-09-30 com as respostas **Q-02** (opção A: tela + botão "Imprimir"; impressão
automática depois do piloto, se precisar), **Q-14** (por item, com "tudo pronto"; amarelo aos 10 min
e vermelho aos 20, configurável) e as decisões E7-1 a E7-4 (docs/requirements/perguntas-abertas.md).

## Objetivo
A cozinha vê no tablet os pedidos que o salão enviou, do mais antigo para o mais novo, com cronômetro
e cores de alerta; marca cada item como iniciado e pronto (ou o pedido inteiro); o garçom vê no
celular o que ficou pronto.

## Entregue

| Área | Entrega |
|---|---|
| Especificação | SDD `kitchen` (RN-KDS-01 a 14); 2 arquivos BDD em português (fila, preparo) |
| Banco | Migration 0010: tempos de alerta por loja (`kds_warning_minutes` 10, `kds_late_minutes` 20, com CHECK); quem iniciou e quem terminou cada item; hora em que o ticket saiu da fila (`finished_at`) + índice para "prontos há pouco" |
| Módulo Kitchen (novo) | Fila da estação padrão, iniciar, pronto, tudo pronto, desfazer pronto (auditado), alertas e cronômetro; usa a API do Orders na mesma transação |
| Módulo Orders | Situação do ticket **calculada dos itens** (também no cancelamento: cancelar o único item que faltava deixa o pedido pronto); API `kitchenOrders` com a trava da conta antes do item |
| Configurações da loja | Dois campos novos em **Lojas** (só ADMIN — E7-1) |
| Tela **Cozinha** (`/cozinha`) | Cartões do mais antigo ao mais novo, com mesa/balcão, conta, rodada, garçom, hora, cronômetro pela hora do servidor, **cor + texto** ("No prazo", "Atenção", "Atrasado"), observação em destaque, botões grandes (Iniciar, Pronto, Tudo pronto, Imprimir), item cancelado riscado por 30 s, "Prontos há pouco" com Desfazer, "Ativar som" (E7-3), tela sempre acesa (E7-4), aviso se o tablet entrou como "compartilhado" |
| Impressão (Q-02 = A) | Via da cozinha em 80 mm pelo navegador, sem preços, observação em maiúsculas |
| Leitura automática | `GET /api/cozinha` a cada 3 s, sem renovar a sessão |
| Menu | "Cozinha" para quem tem `kds.read` (cozinha, gerente, admin e garçom — o garçom só acompanha) |
| Testes | `npm run db:e2e:reset` recria o banco de E2E vazio (ver "Problemas") |

## Desvios e decisões tomadas durante a etapa

| Situação | Decisão | Onde |
|---|---|---|
| ADR-0005 previa polling com cursor `since` (só as mudanças) | A tela lê a **fila completa** a cada 3 s: é pequena (índices próprios), e um cursor por hora pode perder mudanças gravadas com hora anterior e confirmadas depois da leitura. Rever com mais de 100 tickets na fila | kitchen.md §12, ADR-0005 |
| Mapa de navegação previa `/kds` em tela cheia, sem menu | `/cozinha` (como `/salao`, `/estoque`) dentro do menu, que no tablet já começa recolhido | navegacao.md |
| Ações da cozinha mudariam a versão da conta | **Não mudam**: a versão protege as ações do garçom sobre a conta (transferir, juntar, pedir a conta); se a cozinha a mudasse, o garçom levaria "outra pessoa alterou" a cada item pronto | RN-KDS-12 |
| Eventos `KitchenItemStatusChanged`/`OrderItemCancelled` planejados | Chamadas diretas na mesma transação (como o `RoundSent` na Etapa 6) | dependencias.md |
| Imprimir | Só para quem marca (`kds.manage`); o garçom acompanha sem botões | RN-KDS-14 |
| Cozinha marca pronto em conta já fechada | Permitido: no balcão o cliente pode pagar antes de a comida sair (Etapa 8) | kitchen-port.ts |

## Problemas encontrados e corrigidos
1. **Tablet da cozinha travando sozinho**: quem entra marcando "Este aparelho é compartilhado" tem a
   tela bloqueada após 3 min sem toque (E2-3) — numa cozinha isso esconderia a fila. A tela da
   cozinha agora avisa e explica como entrar sem essa opção.
2. **Teste de navegador do salão instável sob carga**: o teste tocava em "Enviar para a cozinha"
   antes de a lista mostrar o segundo item lançado; como o envio manda exatamente o que a tela
   mostra (RN-ORD-10), ia só o primeiro. O teste agora espera "Enviar para a cozinha (2)". O
   comportamento do sistema está certo — era o teste que tinha pressa.
3. **Banco de E2E acumulado**: 206 mesas, 140 contas abertas e 62 pedidos na fila de execuções
   anteriores deixavam o salão e a cozinha pesados. Comando novo `npm run db:e2e:reset`.
4. **Visual (prints do tablet)**: o botão "Pronto" do item em preparo ocupava meia largura; cartões
   curtos esticavam até a altura do vizinho.

Conferido: os testes de concorrência (**dois tablets marcando o mesmo item**; **cozinha marcando
enquanto o gerente cancela**) **falham com a trava desligada** (os dois tablets "mudam"; o estoque
volta sem ter voltado) e passam com ela.

## Revisão do `reviewer`
(em andamento)

## Como experimentar (banco de desenvolvimento)
1. `npm run db:migrate` (aplica a 0010) e `npm run dev`.
2. No tablet (ou numa janela do navegador), entre como `cozinha` / `Cozinha@2026` **sem** marcar
   "aparelho compartilhado" → **Cozinha**. Toque em **Ativar som**.
3. Em outro aparelho, entre como `joao` / `Garcom@2026` → **Salão** → mesa **2** (já tem um X-Salada
   "sem cebola") → **Enviar para a cozinha**.
4. Na cozinha: o pedido aparece em até 3 s (com som). **Iniciar** → **Pronto**. No celular do garçom
   o item fica "Pronto" com o botão **Entregar**.
5. Em "Prontos há pouco", **Desfazer** devolve o item à fila. **Imprimir** abre a via de 80 mm.
6. Como `admin` / `Admin@2026`: **Administração → Lojas → Centro** para mudar os minutos do amarelo
   e do vermelho.

## Testes (2026-09-30)

| Tipo | Resultado |
|---|---|
| Unitários (transições da cozinha, alertas, cronômetro, situação do ticket com fast-check, tempos de alerta) | ✅ 525 |
| Integração com MySQL 8.4 real (BDD + dois tablets + cozinha × cancelamento + isolamento + janelas de tempo + CHECK) | ✅ 1074 |
| E2E no navegador (celular, tablet, desktop + BDD) | ✅ 129 (4 pulados de propósito), duas execuções completas seguidas |

## Definition of Done
- [x] SDD e cenários BDD
- [x] Migration revisada (índices antes das FKs; aplicada no banco de desenvolvimento)
- [x] Testes unitários, integração (MySQL real), BDD, concorrência, isolamento entre lojas, E2E
- [x] Lint, typecheck, build
- [ ] CI no GitHub
- [ ] Revisão do `reviewer`
- [x] Docs e maps
- [x] `PROJECT_STATUS.md`
- [ ] `APROVADO` do usuário
