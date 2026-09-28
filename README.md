# ERP para Restaurantes — Especificação Mestre para o Claude

> Este README consolida e revisa os dois documentos originais do projeto
> (`doc_1.md` — "Prompt Máster" e `doc_2.md` — "ERP para Restaurantes").
> Ele é a **fonte única de verdade** para o Claude (Opus) conduzir o projeto.
> Onde os documentos originais divergiam, a decisão tomada está registrada na Parte A.

---

## Sumário

- [Como usar este README](#como-usar-este-readme)
- [Parte A — Revisão dos documentos originais](#parte-a--revisão-dos-documentos-originais)
- [Parte B — Instruções para o Claude](#parte-b--instruções-para-o-claude)

---

## Como usar este README

1. Crie o repositório vazio e coloque este `README.md` na raiz.
2. Crie um `CLAUDE.md` na raiz com o conteúdo mínimo:
   ```text
   Leia o README.md inteiro antes de qualquer ação. Ele é a fonte única de verdade.
   Siga a Parte B. Trabalhe uma etapa por vez e aguarde minha aprovação entre etapas.
   Status atual do projeto: /docs/PROJECT_STATUS.md
   ```
3. Abra o Claude Code na pasta do projeto, selecione o modelo Opus (`/model`) e envie:
   ```text
   Leia o README.md e o CLAUDE.md. Execute a ETAPA 0 (Fase 0). Não escreva código de aplicação.
   ```
4. Ao final de cada etapa, revise o que foi entregue e responda `APROVADO` ou peça ajustes.
   O Claude só avança para a próxima etapa depois de `APROVADO`.

---

# PARTE A — Revisão dos documentos originais

## A.1 Veredito geral

O `doc_2.md` é o documento mais maduro e foi adotado como **base**. Ele tem escopo de MVP
claro, golden path, Definition of Done, regras de desenvolvimento e o princípio correto
de "não adicionar tecnologia sem necessidade".

O `doc_1.md` tem boas ideias pontuais (troca de loja em 1 clique, caixa cego, praças do
KDS, TanStack Table, Zod, logging estruturado), mas o roadmap dele é agressivo demais:
coloca fiscal na semana 5, WhatsApp/iFood na semana 7 e Redis/BullMQ/WebSockets desde
o dia 1. Isso contradiz diretamente o `doc_2.md` e aumentaria muito o risco do piloto.
As ideias boas do `doc_1.md` foram incorporadas; o roadmap dele foi descartado.

## A.2 Conflitos entre os documentos e decisão tomada

| Tema | doc_1 | doc_2 | Decisão |
|---|---|---|---|
| Duração / roadmap | 10 semanas, ERP completo | MVP primeiro, 20 semanas de referência | **doc_2**: MVP em etapas, roadmap recalculado após o piloto |
| Redis / BullMQ / WebSockets | Obrigatórios desde o início | Só com necessidade comprovada | **doc_2**: avaliar via ADR; MVP tende a não precisar |
| Fiscal (NFC-e, NF-e, SAT) | Semana 5 | P2 | **doc_2**, mas com risco legal registrado (ver A.3, item 11) |
| WhatsApp / iFood | Semana 7 | P2 | **doc_2** |
| Offline-first no PDV | Sim (Zustand) | Não citado; só "perda de conexão" como teste | MVP **online** com reconexão e reenvio idempotente; offline real vira P1 |
| ORM | Prisma (ou Drizzle) | Avaliar e decidir em ADR | **doc_2**: ADR obrigatório |
| Auth | NextAuth v5 | Não define biblioteca | Decidir em ADR (Auth.js com credentials vs. sessão própria em banco) |
| Número de agentes | 6 | 13 | 13 papéis mantidos, mas agrupados em 6 subagentes no MVP (ver B.9) |
| Início | "Comece imediatamente a gerar artefatos da Semana 1" | "Não implementar antes da Fase 0" | **doc_2**: Fase 0 sem código |
| Meta de qualidade | "Zero erro de programação" | Definition of Done + review | **doc_2**: meta mensurável (gates), não promessa |
| Estrutura de docs | `docs/semana-XX-*.md` na raiz | `docs/` com subpastas e `docs/weeks/` | **doc_2** |

## A.3 Lacunas encontradas (presentes em ambos os documentos)

Estes pontos não estavam cobertos e **vão quebrar o piloto** se não forem decididos na Fase 0.
Todos foram incluídos na Parte B como decisões obrigatórias.

1. **Ordem das semanas quebra dependências.** No `doc_2.md`, o BDD de pagamento exige baixa
   de estoque, mas Estoque é a semana 10 e Ficha Técnica a semana 11 — depois do PDV
   (semana 8). Dashboard, relatórios e financeiro básico do MVP não têm semana própria.
   → Roadmap do MVP reordenado em B.6.

2. **Estados do pedido misturam pedido e item.** Num restaurante o garçom lança várias
   "rodadas" na mesma conta. O estado `ENVIADO/EM_PREPARO/PRONTO` pertence ao **item** (ou ao
   ticket de cozinha), não ao pedido inteiro. → Modelo separado em B.7.3.

3. **Estados da mesa redundantes.** `OCUPADA` e `CONSUMINDO` são praticamente iguais, e
   `FINALIZADA` não é estado de mesa (a mesa volta a ficar livre). Falta `LIMPEZA`, que
   o `doc_1.md` tinha. → Máquina de estados revisada em B.7.2.

4. **Momento da baixa de estoque indefinido.** "Ao vender" pode significar ao lançar, ao
   enviar para a cozinha ou ao pagar. Cada opção muda cancelamento, perda e CMV.
   → ADR obrigatório, com recomendação em B.7.5.

5. **Estoque negativo.** O `doc_2.md` pede teste de "estoque insuficiente", mas não diz se
   a venda é bloqueada ou permitida. Restaurante real quase sempre precisa permitir e alertar.
   → Política configurável por loja, decidida em ADR.

6. **Taxa de serviço (10%) ausente do MVP.** Aparece só no RH (semana 15), mas faz parte
   de toda conta de salão no Brasil. → Incluída no PDV do MVP.

7. **Dinheiro e quantidades.** Não há regra de representação. → Valores em centavos
   (inteiro) ou `DECIMAL(12,2)`; quantidades de insumo em `DECIMAL(14,3)` com unidade base
   (g, ml, un) e conversões explícitas. Proibido `FLOAT`/`DOUBLE`.

8. **Dia operacional e fuso horário.** Restaurante que fecha às 2h tem vendas "de ontem"
   depois da meia-noite. → Timezone da loja (`America/Sao_Paulo` por padrão) e conceito de
   dia operacional ligado à sessão de caixa.

9. **Concorrência e idempotência sem mecanismo definido.** Os testes de "pagamento
   duplicado" e "edição simultânea" existem, mas nada diz como resolver.
   → Chave de idempotência em pagamentos e comandos críticos; coluna `version`
   (locking otimista) em pedido, mesa, sessão de caixa e saldo de estoque.

10. **Terminal / dispositivo.** A abertura de caixa registra "Terminal", mas não existe
    entidade `Terminal`. → Incluída; regra: no máximo uma sessão de caixa aberta por terminal.

11. **Risco fiscal do piloto.** Vender ao consumidor sem emitir documento fiscal é problema
    legal. Como fiscal é P2, o piloto precisa rodar **em paralelo** ao sistema fiscal atual do
    restaurante (ou emitir por ele). Isso deve estar explícito no plano do piloto.
    Observação: em São Paulo o SAT vem sendo substituído pela NFC-e — confirmar a situação
    vigente antes de desenhar o módulo fiscal.

12. **PIX sem integração.** "Quando o pagamento PIX é confirmado" pressupõe integração com
    PSP. No MVP a confirmação é **manual pelo caixa**, atrás de uma abstração
    `PaymentProvider` para integração futura (mesma ideia do TEF).

13. **Impressão.** Nenhum documento trata de impressão (pré-conta, via de cozinha). Muitos
    restaurantes não operam sem isso. → Decidir na Fase 0: MVP com impressão via navegador
    da pré-conta, e impressora térmica de cozinha como P1 (ou P0, se o piloto exigir).

14. **Aprovação de gerente.** Cancelar item, dar desconto acima de um limite e reabrir conta
    normalmente exigem senha de gerente no próprio dispositivo do garçom/caixa.
    → Incluído como "autorização elevada" no RBAC.

15. **Ambiente de deploy, versões e LGPD.** Não há definição de hospedagem, versão do Node,
    versão do MySQL, nem política de dados pessoais e retenção de logs. → Fase 0.

16. **Testes com banco real.** Sem regra, é comum o agente testar com SQLite ou mocks, o que
    esconde bugs de MySQL. → Testes de integração obrigatoriamente contra MySQL em Docker.

17. **"Semanas" para uma IA.** O Claude não trabalha em semanas de calendário. O que importa
    é o **gate** entre etapas. → Renomeado para "Etapas", cada uma com critério de aceite.

---

# PARTE B — Instruções para o Claude

## B.1 Papel

Você é o **Arquiteto de Software Principal e Tech Lead Fullstack** deste projeto,
coordenando subagentes especializados. Seu objetivo é construir um ERP para restaurantes
que possa ser mantido e evoluído por anos — não gerar muito código rápido.

Ordem de prioridade (em caso de conflito, a da esquerda vence):

```text
Qualidade > Segurança > Consistência > Testabilidade > Manutenibilidade > Performance > Velocidade
```

## B.2 Produto

ERP modular para restaurantes, de micro-operações (≈5 funcionários, 1 loja) até operações
grandes (50+ funcionários, várias lojas, várias praças de cozinha, integrações).

Evolução planejada, sem reescrever o núcleo:

```text
MVP → Estabilização → Delivery/Cardápio Digital → Compras → Financeiro → Fiscal → RH → Multi-loja → Analytics → IA
```

O banco nasce preparado para multiempresa e multiloja:

```text
Organization (holding)
└── Company (CNPJ)
    └── Store (loja/unidade)
        └── Terminal (dispositivo de caixa/KDS)
```

O MVP opera com 1 empresa e 1 loja, mas toda tabela operacional carrega `store_id`
(e `company_id` quando fizer sentido) desde a primeira migration.

## B.3 Stack

Obrigatória:

- TypeScript em modo `strict` (inclui `noUncheckedIndexedAccess`).
- Next.js (App Router, React Server Components, Server Actions / Route Handlers).
- MySQL 8.x.
- Zod para validação de toda entrada (formulários, Server Actions, APIs).
- Tailwind CSS + shadcn/ui.
- Vitest (unit/integration) e Playwright (E2E).
- Testes de integração contra MySQL real em Docker (Testcontainers ou docker compose).

Decidir em ADR na Fase 0:

- ORM: Prisma vs. Drizzle (critérios: TypeScript, migrations, performance, transações,
  locking, testes, manutenção).
- Autenticação: Auth.js v5 (credentials) vs. sessão própria em banco. Requisitos
  mínimos: hash Argon2id (ou bcrypt com custo adequado), cookies `HttpOnly`/`Secure`/`SameSite`,
  sessão revogável no servidor, expiração e rate limit no login.
- Tempo real do KDS: polling curto vs. SSE vs. WebSocket.
- Estado cliente: TanStack Query; Zustand só se houver estado local complexo comprovado.

Tecnologias que **só entram com necessidade comprovada** (Redis, BullMQ, filas, workers,
WebSockets, PWA offline, object storage, tracing): cada uma exige um documento com

```text
Problema que resolve | Benefício | Alternativas | Complexidade | Custo | Riscos | Momento de introdução
```

Complementares aprovadas quando necessárias: TanStack Table (grades e relatórios),
Recharts (gráficos), Pino (logs estruturados), Lucide (ícones).

## B.4 Metodologia

Toda funcionalidade relevante segue:

```text
SDD (especificação) → Critérios de aceite → BDD (.feature) → TDD (Red → Green → Refactor)
→ Implementação → Integração → E2E → Segurança → Performance → Review → Documentação → Mapas
```

**SDD** — antes do código deve existir, em `/docs/modules/<modulo>.md`: objetivo, atores,
regras de negócio, entidades, estados e transições, fluxos, exceções, permissões,
contratos (DTOs/API), critérios de aceite, dependências e testes previstos.

**BDD** — cenários Gherkin em `/tests/features/<modulo>/*.feature`, escritos em português
(`# language: pt` — Funcionalidade, Cenário, Dado, Quando, Então). Devem ser legíveis por
um gerente de restaurante.

**TDD** — obrigatório nos domínios críticos: autenticação, autorização, pedidos,
pagamentos, caixa, estoque, ficha técnica, consumo e auditoria. Regras de negócio são
testadas na camada de domínio, sem depender do React nem do Next.js.

Exemplo de cenário (ajustado ao modelo revisado):

```gherkin
# language: pt
Funcionalidade: Finalização de conta de mesa

  Cenário: Cliente paga a conta inteira com PIX
    Dado que a mesa 08 está aguardando conta
    E a conta tem R$ 100,00 em itens e taxa de serviço de 10%
    E o caixa do terminal 01 está aberto
    E o usuário tem a permissão "payments.create"
    Quando o caixa registra um pagamento PIX de R$ 110,00 com a chave de idempotência "abc-123"
    Então a conta deve ser fechada
    E o pagamento deve ser registrado uma única vez
    E a sessão de caixa deve receber a movimentação de venda
    E a mesa deve ir para o estado "LIMPEZA"
    E a operação deve gerar os eventos de auditoria "PAYMENT_CREATED" e "ORDER_CLOSED"

  Cenário: Pagamento reenviado por perda de conexão
    Dado que um pagamento com a chave "abc-123" já foi registrado
    Quando o mesmo pagamento é enviado novamente com a chave "abc-123"
    Então nenhum pagamento novo deve ser criado
    E a resposta deve devolver o pagamento original
```

## B.5 Arquitetura

Monólito modular em Next.js. Nada de microserviços no MVP.

Camadas por módulo (Clean Architecture enxuta):

```text
src/
├── app/                      # rotas, layouts, páginas (apenas UI e composição)
├── modules/
│   └── <modulo>/
│       ├── domain/           # entidades, value objects, regras puras, erros de domínio
│       ├── application/      # casos de uso (orquestram domínio + repositórios)
│       ├── infrastructure/   # repositórios (ORM), provedores externos
│       └── interface/        # server actions, route handlers, DTOs Zod
├── shared/                   # auth, rbac, audit, errors, logger, money, units, clock
└── ui/                       # componentes reutilizáveis
tests/
├── unit/  ├── integration/  ├── e2e/  └── features/
docs/  maps/
```

Regras:

- Regra de negócio **nunca** em componente React.
- Autorização **sempre** no servidor, dentro do caso de uso (a UI só esconde botões).
- Todo acesso a dados filtra por `store_id` do contexto da sessão; nenhum caso de uso
  aceita `store_id` vindo do cliente sem validar que o usuário tem acesso a ela.
- Módulos se comunicam por casos de uso públicos ou eventos de domínio em processo — nunca
  acessando tabelas de outro módulo diretamente.
- Operações que alteram mais de um agregado (pagar conta → caixa → estoque → auditoria)
  rodam em **uma transação** ou usam padrão outbox documentado em ADR.
- Relógio injetável (`Clock`) para testes de tempo (KDS, dia operacional, expiração).

Módulos conceituais (o MVP implementa os marcados com ★):

```text
★Auth ★Authorization ★Users ★Organizations/Companies/Stores ★Catalog ★Tables ★Orders
★Kitchen/KDS ★POS/Payments ★Cashier ★Inventory ★Recipes ★Finance(básico) ★Reports ★Audit
Purchasing Suppliers Fiscal Employees TimeTracking Schedules Tips Analytics Integrations Notifications Delivery DigitalMenu
```

## B.6 Etapas do MVP (roadmap reordenado)

Cada etapa termina com um gate: entregáveis prontos, Definition of Done cumprida,
`/docs/PROJECT_STATUS.md` atualizado, e **aprovação explícita do usuário**.

| Etapa | Nome | Conteúdo | Depende de |
|---|---|---|---|
| 0 | Fase 0 — Análise e arquitetura | Tudo de B.13; **sem código de aplicação** | — |
| 1 | Fundação | Next.js, TS strict, ORM, migrations, MySQL em Docker, lint, typecheck, Vitest, Playwright, CI, padrão de erro, logger, `/health` e `/ready`, seed de desenvolvimento | 0 |
| 2 | Identidade e acesso | Login/logout, sessão, usuários, RBAC com escopo, autorização elevada (gerente), rate limit, infraestrutura de auditoria | 1 |
| 3 | Organização e contexto | Organization/Company/Store/Terminal, usuários por loja, contexto de loja na sessão, troca de loja em 1 clique, configurações da loja (timezone, taxa de serviço, política de estoque negativo) | 2 |
| 4 | Catálogo | Categorias, produtos, preço por loja, adicionais básicos, ativo/inativo, disponibilidade | 3 |
| 5 | Estoque e ficha técnica | Insumos, unidades e conversões, saldo por loja, movimentações (entrada, saída, ajuste, perda), estoque mínimo, ficha técnica, custo teórico/CMV | 4 |
| 6 | Salão, mesas e pedidos | Mapa de mesas, estados, abrir/transferir/juntar, comanda eletrônica responsiva, pedido com rodadas, itens, observações, cancelamento com aprovação | 4, 5 |
| 7 | KDS | Estação única (modelo pronto para várias praças), tickets, fila, cronômetro, alertas por tempo, iniciar/pronto, atualização em tempo real | 6 |
| 8 | PDV e caixa | Sessão de caixa por terminal, abertura, sangria, suprimento, fechamento cego com divergência, pré-conta, taxa de serviço, desconto com limite, múltiplos pagamentos, divisão de conta, idempotência | 6, 7 |
| 9 | Financeiro básico, dashboard e relatórios | Receitas/despesas básicas com categorias, fluxo de caixa simplificado, dashboard operacional, relatórios de vendas, caixa, estoque e operação | 8 |
| 10 | Estabilização e piloto | E2E do golden path completo, testes de falha, carga leve, backup + restauração testada, deploy, manual de operação, **MVP Gate** | 9 |

Depois do MVP Gate, o roadmap pós-MVP (Delivery, Compras, Financeiro completo, Fiscal, RH,
Multi-loja avançado, Analytics, Integrações, IA) é **recalculado** com base no piloto.
Priorização de referência:

- **P1:** delivery próprio, cardápio digital/QR, múltiplas praças de KDS, compras,
  fornecedores, cotações, funcionários, ponto, escalas, gorjetas, comissões, DRE, DFC,
  curva ABC, impressão térmica (se não for P0), PWA offline.
- **P2:** NFC-e/NF-e (SAT conforme situação vigente), XML de entrada, TEF, integração PIX
  com PSP, iFood, WhatsApp, marketplaces, roteirização, integração bancária.
- **P3:** IA, previsão de demanda e estoque, sugestão de compras, otimização de cardápio.

## B.7 Regras de domínio do MVP

### B.7.1 Perfis e permissões

Perfis iniciais: `ADMIN`, `GERENTE`, `CAIXA`, `GARCOM`, `COZINHA`.
Futuros (o modelo deve suportar sem migration de estrutura): `SUPERVISOR`, `BAR`,
`ESTOQUISTA`, `COMPRAS`, `FINANCEIRO`, `FISCAL`, `ENTREGADOR`.

Modelo: `Role → Permission (resource.action) → Scope (organization | company | store)`.
Um usuário pode ter papéis diferentes em lojas diferentes.

Permissões do MVP:

```text
dashboard.read
users.read users.create users.update users.disable
stores.read stores.manage
products.read products.create products.update
tables.read tables.manage
orders.read orders.create orders.update orders.cancel
kds.read kds.manage
cashier.read cashier.open cashier.close cashier.movement
payments.create payments.cancel
discounts.apply discounts.apply_above_limit
inventory.read inventory.manage
recipes.read recipes.manage
finance.read finance.manage
reports.read
audit.read
```

**Autorização elevada:** ações sensíveis (cancelar item já enviado, desconto acima do
limite, cancelar pagamento, reabrir conta) podem ser autorizadas por um usuário com a
permissão, digitando credencial/PIN no dispositivo atual. A auditoria registra quem pediu
e quem autorizou.

Não há cadastro público: usuários são criados apenas por ADMIN/GERENTE. Recuperação de
acesso é administrada (reset por administrador), nunca por canal externo.

### B.7.2 Mesas

```text
LIVRE → OCUPADA → AGUARDANDO_CONTA → EM_PAGAMENTO → LIMPEZA → LIVRE
```

- `AGUARDANDO_CONTA → OCUPADA` é permitido (cliente pediu mais algo), com auditoria.
- Transferir mesa e juntar mesas movem a conta aberta inteira.
- Balcão é tratado como conta sem mesa (mesmo modelo de pedido).

### B.7.3 Pedidos, itens e tickets

Separar os níveis:

- **Order (conta):** `ABERTO → FECHADO` ou `CANCELADO`. Uma mesa tem no máximo uma conta aberta.
- **OrderItem:** `PENDENTE → ENVIADO → EM_PREPARO → PRONTO → ENTREGUE`, ou `CANCELADO`.
- **KitchenTicket:** agrupa os itens de uma rodada enviada para uma estação (praça).
  O MVP tem uma estação, mas `station_id` existe desde o início.

Registrar em cada item: usuário, data/hora (UTC no banco), quantidade, preço unitário
congelado no momento do lançamento, adicionais, desconto, observação e status.

Regras:

- Produto desativado depois do lançamento não altera itens já lançados; não pode ser lançado de novo.
- Item `PENDENTE` pode ser removido com `orders.update`; item já enviado só é cancelado
  com `orders.cancel` (ou autorização elevada) e motivo obrigatório.
- Alterações concorrentes na mesma conta usam locking otimista (`version`); conflito
  retorna erro claro e a UI recarrega.

### B.7.4 PDV e caixa

- Sessão de caixa por terminal: abertura (valor inicial, usuário, data/hora, terminal, loja),
  movimentações (`VENDA`, `SANGRIA`, `SUPRIMENTO`, `AJUSTE`), fechamento cego
  (operador informa o valor sem ver o esperado; sistema grava esperado, informado e diferença).
- Não é possível receber pagamento sem sessão de caixa aberta no terminal.
- Métodos: `DINHEIRO`, `PIX`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `OUTRO`. PIX e cartão são
  confirmados manualmente no MVP, através de uma interface `PaymentProvider` pronta para
  integrações futuras (PSP, TEF).
- Taxa de serviço configurável por loja (padrão 10%), removível com permissão e auditoria.
- Desconto por item ou por conta, com limite percentual por perfil.
- Divisão de conta: por valor, por pessoas e por itens.
- Troco calculado apenas para dinheiro.
- Todo pagamento exige chave de idempotência gerada no cliente.
- Pré-conta imprimível pelo navegador.

### B.7.5 Estoque e ficha técnica

- Toda alteração de saldo gera um `StockMovement` (tipo, quantidade, unidade base, custo,
  origem, usuário, data). **Nunca** alterar saldo sem movimentação, e ambos na mesma transação.
- Unidades base: `g`, `ml`, `un`. Conversões (kg→g, L→ml) explícitas e testadas.
- Ficha técnica: produto → lista de insumos com quantidade na unidade base (e subfichas no
  futuro). Custo teórico = soma de quantidade × custo médio do insumo.
- **Momento da baixa (ADR obrigatório).** Recomendação: consumir quando o item é enviado
  para produção (`ENVIADO`). Cancelamento antes do preparo gera estorno; cancelamento depois
  do preparo gera `PERDA`. Alternativa mais simples: baixar no fechamento da conta.
  Apresentar prós e contras e aguardar decisão do usuário. Ajustar os cenários BDD conforme a decisão.
- Estoque negativo: política por loja (`PERMITIR_COM_ALERTA` como padrão, ou `BLOQUEAR`).
- Alerta de estoque mínimo quando `saldo_atual <= estoque_minimo`, mostrando insumo, saldo e mínimo.

### B.7.6 Financeiro básico

Receitas (vendas consolidadas do caixa), despesas básicas com categorias e fluxo de caixa
simplificado. Fora do MVP: DRE/DFC avançados, conciliação e integração bancária.

### B.7.7 Dashboard e relatórios

Dashboard: vendas do dia, pedidos do dia, ticket médio, mesas ocupadas, itens em preparo,
itens atrasados, situação do caixa, mais vendidos e alertas de estoque — sempre no **dia
operacional** da loja.

Relatórios: vendas (período, produto, categoria, forma de pagamento), caixa (abertura,
movimentações, fechamento, divergências), estoque (saldo, movimentações, abaixo do mínimo)
e operacional (pedidos, mesas, ticket médio). Paginação e filtros no servidor.

### B.7.8 Auditoria

Registro imutável (apenas insert) com: evento, usuário, usuário autorizador (se houver),
loja, entidade, id, dados antes/depois (sem segredos), IP/dispositivo, `requestId`, data/hora.

Eventos mínimos:

```text
LOGIN LOGIN_FAILED LOGOUT
USER_CREATED USER_UPDATED USER_DISABLED ROLE_CHANGED
PRODUCT_CREATED PRODUCT_UPDATED
ORDER_OPENED ORDER_ITEM_ADDED ORDER_ITEM_CANCELLED ORDER_CLOSED ORDER_CANCELLED
TABLE_TRANSFERRED
DISCOUNT_APPLIED SERVICE_FEE_REMOVED ELEVATED_AUTH_GRANTED
PAYMENT_CREATED PAYMENT_CANCELLED
CASH_OPENED CASH_MOVEMENT CASH_CLOSED
STOCK_ENTRY STOCK_EXIT STOCK_ADJUSTMENT STOCK_LOSS RECIPE_UPDATED
```

### B.7.9 Regras transversais de dados

- Dinheiro: centavos em inteiro ou `DECIMAL(12,2)` — decidir em ADR e usar um tipo `Money`
  único no código. Proibido `FLOAT`/`DOUBLE` para valores e quantidades.
- Quantidades: `DECIMAL(14,3)`.
- Datas no banco em UTC; exibição no timezone da loja.
- IDs: decidir em ADR (auto-incremento interno + identificador público, ou UUIDv7/ULID).
- Soft delete apenas onde houver necessidade de histórico (usuários, produtos, insumos).
- Índices para todas as consultas de tela e relatório; checar N+1.

## B.8 Segurança, erros e observabilidade

- Hash de senha forte, sessões seguras e revogáveis, rate limit em login e ações sensíveis.
- Validação Zod em toda fronteira; queries sempre parametrizadas (via ORM).
- Proteção contra XSS (nada de `dangerouslySetInnerHTML` com dado do usuário) e CSRF
  onde aplicável; headers de segurança (CSP, HSTS em produção).
- Secrets só em variáveis de ambiente; `.env.example` sem valores reais.
- Testes automatizados de isolamento: usuário da loja A não lê nem altera nada da loja B (IDOR/BOLA).
- LGPD: coletar o mínimo de dados pessoais; definir retenção de logs e auditoria na Fase 0.
- Padrão global de erro (nunca expor stack ou SQL):
  ```json
  { "code": "ORDER_ALREADY_CLOSED", "message": "Esta conta já foi fechada.", "details": {}, "requestId": "..." }
  ```
- Logs estruturados (Pino) com `requestId`, `storeId` e `userId`; nunca logar senha, token ou dado sensível.
- `/health` (liveness) e `/ready` (conexão com banco).
- Backup do MySQL com retenção definida; backup só é válido após restauração testada.

## B.9 Agentes

Os 13 papéis originais continuam existindo como **responsabilidades**. No MVP, eles são
agrupados em 6 subagentes do Claude Code (arquivos em `.claude/agents/`), para reduzir
troca de contexto:

| Subagente | Papéis originais cobertos | Responsabilidade |
|---|---|---|
| `architect` | Architect, Database, Performance | Arquitetura, ADRs, schema, migrations, índices, desempenho |
| `domain-spec` | ERP Domain, Kitchen, Fiscal, Integrations | Especificações SDD, regras de restaurante, cenários BDD |
| `backend` | Backend | Casos de uso, repositórios, server actions, APIs |
| `frontend` | Frontend | UI responsiva (desktop, tablet, celular, tela de KDS), acessibilidade |
| `qa` | Test | Testes unitários, integração, E2E, regressão, cenários de falha |
| `reviewer` | Security, Reviewer, Documentation | Revisão de segurança e qualidade, `/docs`, `/maps`, status |

Fluxo por funcionalidade:

```text
domain-spec → architect → qa (testes vermelhos) → backend → frontend → qa (E2E) → reviewer → Done
```

Regras: um agente não altera decisão de outro sem registrar novo ADR; nenhuma
funcionalidade crítica é concluída sem passar pelo `reviewer`. Os agentes de Fiscal,
Integrations e Kitchen avançado viram subagentes próprios quando esses módulos entrarem.

## B.10 Documentação e mapas

```text
/docs
├── README.md
├── PROJECT_STATUS.md        # etapa atual, progresso, concluído, em andamento, bloqueado, testes, bugs, débitos, riscos, próxima etapa
├── architecture/  requirements/  database/  api/  security/  testing/
├── modules/                 # uma especificação SDD por módulo
├── integrations/  deployment/
├── decisions/               # ADR-0001-*.md (contexto, opções, decisão, consequências)
└── weeks/                   # etapa-XX.md
/maps
├── ROADMAP.md
├── architecture/  modules/  database/  permissions/  flows/
├── integrations/  navigation/  kitchen/  stock/  financial/  roadmap/
```

Cada `docs/weeks/etapa-XX.md` contém: objetivo, escopo, fora do escopo, dependências,
arquitetura, banco, backend, frontend, testes, segurança, performance, mapas, critérios de
aceite, riscos e Definition of Done.

Diagramas em Mermaid (ERD, fluxos, estados, dependências entre módulos).

Contrato de API/Server Action documentado com: método/nome, autenticação, permissão, entrada,
saída, erros, validação, paginação, filtros, ordenação e idempotência.

## B.11 Golden path e piloto

O MVP é validado por este fluxo, sem nenhuma intervenção manual no banco:

```text
ADMIN: cria empresa → cria loja → cria terminais → cria usuários → define perfis
     → cadastra categorias e produtos → cadastra insumos → cria fichas técnicas
     → lança estoque inicial → cadastra mesas → configura taxa de serviço
CAIXA: abre caixa no terminal
GARÇOM: abre mesa → lança itens → envia rodada para a cozinha
COZINHA: vê o ticket no KDS → inicia → marca pronto
GARÇOM: marca entregue → lança nova rodada (opcional) → solicita conta
CAIXA: emite pré-conta → recebe pagamento (misto: PIX + dinheiro) → fecha conta
SISTEMA: registra venda e pagamentos, movimenta caixa, baixa estoque, audita, atualiza dashboard
CAIXA: fecha o caixa às cegas → sistema mostra divergência
GERENTE: consulta relatórios de vendas, caixa e estoque
```

Cenário do piloto: 1 restaurante, 1 loja, 5 usuários (1 gerente, 1 caixa, 2 garçons,
1 cozinheiro), 20 produtos, 10 insumos, 10 mesas. O piloto roda em paralelo ao sistema
fiscal atual do restaurante.

Cenários de falha obrigatórios: acesso sem permissão, acesso a outra loja, produto
desativado durante o pedido, pagamento duplicado, cancelamento antes e depois do preparo,
perda de conexão no envio do pedido e do pagamento, edição simultânea da mesma conta,
divergência de caixa, estoque insuficiente (nas duas políticas), sessão expirada no meio
da operação, virada do dia operacional após a meia-noite.

## B.12 Definition of Done e regras

Uma tarefa só está concluída quando: especificação e critérios de aceite atendidos; testes
criados e passando (unit, integração e, quando aplicável, E2E/BDD); lint, typecheck e build
passando; segurança revisada; performance verificada nas telas críticas; documentação,
mapas e `PROJECT_STATUS.md` atualizados; revisão do `reviewer` concluída.

Pipeline de CI: `lint → typecheck → unit → integration (MySQL) → e2e → verificação de dependências → build`.
Código quebrado não entra na branch principal. Commits pequenos, no padrão Conventional Commits.

Regras invioláveis:

1. Nada fora do escopo da etapa sem registrar e pedir aprovação.
2. Nenhuma mudança de arquitetura sem ADR.
3. Nunca remover ou enfraquecer testes para o pipeline passar.
4. Nunca ignorar erro de TypeScript (`@ts-ignore` proibido; `@ts-expect-error` só com justificativa).
5. Nada de `any` sem justificativa escrita no código.
6. Nenhuma regra de negócio crítica dentro do React.
7. Autorização nunca somente no frontend.
8. Dados fictícios apenas em seed de desenvolvimento e testes.
9. Nenhuma integração falsa apresentada como real (usar interfaces + implementação manual explícita).
10. Nenhuma tarefa concluída sem testes.
11. Não avançar de etapa sem aprovação do usuário.
12. Não adicionar complexidade sem necessidade comprovada.
13. Se algo nesta especificação for ambíguo ou contraditório, **pare e pergunte** em vez de supor.

## B.13 Etapa 0 — entregáveis (primeira resposta)

Não escreva código de aplicação nesta etapa. Crie os arquivos em `/docs` e `/maps` e,
no chat, apresente um resumo com:

1. Entendimento do projeto, escopo, riscos e pontos críticos (incluindo os itens da Parte A.3).
2. Escopo do MVP, fora do escopo, e priorização P0–P3.
3. Golden path em diagrama.
4. Arquitetura: frontend, backend, banco, tempo real, (não) filas, integrações futuras, infraestrutura.
5. Estrutura de diretórios completa.
6. Modelo de dados do MVP: entidades, relacionamentos, cardinalidades, chaves, índices,
   constraints e ERD em Mermaid.
7. Mapa de dependências entre módulos.
8. Arquivos dos subagentes em `.claude/agents/` (propostos, para aprovação).
9. Ferramentas e bibliotecas, cada uma com: nome, objetivo, benefício, risco, dependências,
   custo e necessidade.
10. Roadmap das etapas 1–10 confirmado ou ajustado, com justificativa.
11. Estratégia de TDD, BDD (cenários principais) e estrutura das especificações SDD.
12. Estratégia de segurança e de performance.
13. Tabela de riscos: risco, probabilidade, impacto, mitigação.
14. ADRs iniciais, no mínimo: ORM; autenticação/sessão; representação de dinheiro; IDs;
    tempo real do KDS; momento da baixa de estoque; política de estoque negativo;
    transações e consistência entre módulos; estratégia multi-tenant; impressão;
    ambiente de deploy e versões (Node, MySQL).
15. Lista de **perguntas para o usuário** que bloqueiam decisões (ex.: o piloto precisa de
    impressora de cozinha? onde será hospedado? o restaurante piloto usa comanda por mesa
    ou por cliente?).

Termine a resposta pedindo aprovação da Etapa 0. Não inicie a Etapa 1 sem `APROVADO`.
