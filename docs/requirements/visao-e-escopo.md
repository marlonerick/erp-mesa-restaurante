# Visão, escopo do MVP e priorização

## 1. Entendimento do projeto

ERP modular para restaurantes, de micro-operações (≈5 funcionários, 1 loja) até redes com
várias lojas, várias praças de cozinha e integrações. O MVP resolve o **ciclo operacional
de salão**: mesa → pedido → cozinha → conta → pagamento → caixa → estoque → relatórios,
com rastreabilidade (auditoria) e controle de acesso por loja.

O objetivo não é velocidade de entrega, e sim um núcleo que suporte anos de evolução
(`Qualidade > Segurança > Consistência > Testabilidade > Manutenibilidade > Performance > Velocidade`).

### Pontos críticos (onde o projeto quebra se errar)

| # | Ponto crítico | Onde é tratado |
|---|---|---|
| 1 | Consistência entre pedido, pagamento, caixa, estoque e auditoria | ADR-0008 (transações) |
| 2 | Pagamento duplicado por perda de conexão | Idempotência obrigatória (docs/api/convencoes.md) |
| 3 | Edição concorrente da mesma conta (2 garçons, garçom + caixa) | Locking otimista `version` |
| 4 | Vazamento entre lojas (IDOR/BOLA) | ADR-0009 (multi-tenant) + testes de isolamento |
| 5 | Dinheiro e quantidades com erro de arredondamento | ADR-0003 (dinheiro) |
| 6 | Vendas depois da meia-noite no "dia errado" | ADR-0013 (dia operacional) |
| 7 | Momento da baixa de estoque | ADR-0006 (**decisão do usuário**) |
| 8 | Piloto sem documento fiscal | Piloto em paralelo ao sistema fiscal atual (riscos R-01) |
| 9 | Estado do pedido x estado do item | Modelo Order / OrderItem / KitchenTicket (maps/flows/estados.md) |

Os 17 itens da Parte A.3 do README estão todos endereçados — ver tabela de rastreabilidade
em [riscos.md](riscos.md#rastreabilidade-da-parte-a3).

## 2. Escopo do MVP (P0)

Módulos ★ do README, entregues nas Etapas 1–10:

| Módulo | Inclui no MVP |
|---|---|
| Auth | Login/logout com usuário e senha, sessão em banco revogável, expiração, rate limit, PIN para autorização elevada |
| Authorization | RBAC `Role → Permission → Scope`, papéis diferentes por loja, autorização elevada (gerente no dispositivo) |
| Users | CRUD por ADMIN/GERENTE, desativação, reset de senha administrado |
| Organizations | Organization → Company → Store → Terminal; configurações da loja; troca de loja em 1 clique |
| Catalog | Categorias, produtos, preço por loja, adicionais básicos, ativo/inativo, disponibilidade |
| Tables | Mapa de mesas, máquina de estados, abrir/transferir/juntar, balcão (conta sem mesa) |
| Orders | Conta com rodadas, itens com preço congelado, observações, adicionais, cancelamento com motivo e aprovação |
| Kitchen/KDS | 1 estação (modelo multi-praça), tickets por rodada, fila, cronômetro, alertas, iniciar/pronto |
| POS/Payments | Pré-conta, taxa de serviço, descontos com limite, pagamentos múltiplos, divisão, troco, idempotência, confirmação manual de PIX/cartão via `PaymentProvider` |
| Cashier | Sessão por terminal, abertura, sangria, suprimento, ajuste, fechamento cego com divergência |
| Inventory | Insumos, unidades base e conversões, saldo por loja, movimentações, estoque mínimo, política de negativo |
| Recipes | Ficha técnica por produto, custo teórico, CMV |
| Finance (básico) | Receitas (consolidadas do caixa), despesas com categorias, fluxo de caixa simplificado |
| Reports | Dashboard do dia operacional; relatórios de vendas, caixa, estoque e operação |
| Audit | Log imutável com os eventos mínimos do README |

## 3. Fora do escopo do MVP

- Emissão fiscal (NFC-e, NF-e, SAT), XML de entrada — **P2**.
- TEF, PSP de PIX, conciliação bancária, integração bancária — **P2**.
- Delivery, cardápio digital/QR, iFood, WhatsApp, marketplaces — **P1/P2**.
- Compras, fornecedores, cotações — **P1**.
- RH: funcionários, ponto, escalas, gorjetas, comissões — **P1**.
- DRE, DFC, curva ABC, analytics avançado — **P1/P3**.
- Múltiplas praças de KDS ativas (o modelo já suporta; a UI/configuração não) — **P1**.
- PWA offline / operação sem internet — **P1** (MVP é online com reconexão e reenvio idempotente).
- Impressão térmica ESC/POS — **P1** (ou P0 se o piloto exigir — pergunta Q-02).
- Subfichas técnicas (ficha dentro de ficha) — **P1**.
- Cadastro público, recuperação de senha por e-mail/SMS — **não previsto** (reset administrado).
- Redis, BullMQ, filas, workers, WebSockets, object storage, tracing — só com necessidade comprovada.

## 4. Priorização P0–P3

| Prioridade | Itens |
|---|---|
| **P0 (MVP)** | Tudo da seção 2 |
| **P1** | Delivery próprio, cardápio digital/QR, múltiplas praças de KDS, compras, fornecedores, cotações, funcionários, ponto, escalas, gorjetas, comissões, DRE, DFC, curva ABC, impressão térmica (se não for P0), PWA offline, subfichas |
| **P2** | NFC-e/NF-e (SAT conforme situação vigente em SP), XML de entrada, TEF, PIX via PSP, iFood, WhatsApp, marketplaces, roteirização, integração bancária |
| **P3** | IA, previsão de demanda e estoque, sugestão de compras, otimização de cardápio |

O roadmap pós-MVP é recalculado após o MVP Gate com base no piloto.

## 5. Golden path

Diagrama: [maps/flows/golden-path.md](../../maps/flows/golden-path.md).
Critério: executado de ponta a ponta **sem intervenção manual no banco**, coberto por E2E na Etapa 10.

## 6. Piloto

- 1 restaurante, 1 loja, 5 usuários (1 gerente, 1 caixa, 2 garçons, 1 cozinheiro),
  20 produtos, 10 insumos, 10 mesas.
- Roda **em paralelo ao sistema fiscal atual** do restaurante (o ERP não emite documento fiscal).
- Cenários de falha obrigatórios (todos viram testes automatizados):
  acesso sem permissão; acesso a outra loja; produto desativado durante o pedido; pagamento
  duplicado; cancelamento antes e depois do preparo; perda de conexão no envio do pedido e do
  pagamento; edição simultânea da mesma conta; divergência de caixa; estoque insuficiente nas
  duas políticas; sessão expirada no meio da operação; virada do dia operacional após a meia-noite.
