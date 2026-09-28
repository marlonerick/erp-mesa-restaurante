# Riscos

Escala: Probabilidade (P) e Impacto (I) em Baixa / Média / Alta.

## Tabela de riscos

| ID | Risco | P | I | Mitigação |
|---|---|---|---|---|
| R-01 | Piloto vende sem documento fiscal (problema legal) | Alta | Alta | Piloto em paralelo ao sistema fiscal atual; registrar no plano do piloto e no manual de operação; confirmar situação SAT → NFC-e em SP antes do módulo fiscal |
| R-02 | Dupla digitação no piloto (ERP + sistema fiscal) gera resistência da equipe | Alta | Média | Medir tempo por conta no piloto; escopo de UI mínimo em cliques; decidir cedo se fiscal sobe para P1 |
| R-03 | Pagamento registrado duas vezes (rede instável, duplo clique) | Média | Alta | Chave de idempotência gerada no cliente, `UNIQUE (store_id, idempotency_key)`, teste de reenvio |
| R-04 | Inconsistência entre pagamento, caixa, estoque e auditoria | Média | Alta | Uma transação por caso de uso (ADR-0008); testes de integração com MySQL real verificando todas as tabelas |
| R-05 | Edição concorrente da mesma conta sobrescreve dados | Alta | Média | Locking otimista (`version`) em order, dining_table, cash_session, ingredient_stock; erro `CONCURRENT_MODIFICATION` + recarga na UI |
| R-06 | Vazamento de dados entre lojas (IDOR/BOLA) | Média | Alta | `store_id` obrigatório em todo repositório vindo do contexto de sessão; suíte de testes de isolamento por endpoint |
| R-07 | Erro de arredondamento em dinheiro/quantidade | Média | Alta | Inteiros (centavos / milésimos / micro-reais), proibição de FLOAT, testes de propriedade em `Money` e `Quantity` |
| R-08 | Vendas após meia-noite atribuídas ao dia errado | Alta | Média | Dia operacional com horário de corte por loja (ADR-0013); teste com `Clock` injetável |
| R-09 | Momento da baixa de estoque escolhido errado gera CMV/perdas incorretas | Média | Média | ADR-0006 com decisão explícita do usuário; cenários BDD de cancelamento antes/depois do preparo |
| R-10 | Internet instável no restaurante derruba a operação (MVP é online) | Média | Alta | Reenvio idempotente, UI que mostra estado de conexão, polling tolerante; avaliar 4G de contingência; PWA offline como P1 |
| R-11 | Cozinha não opera sem via impressa | Média | Alta | Pergunta Q-02; impressão via navegador do ticket como paliativo; ESC/POS como P1/P0 |
| R-12 | Testes com mocks escondem bugs de MySQL (locks, collation, DECIMAL) | Média | Média | Integração obrigatória contra MySQL 8.4 em Testcontainers |
| R-13 | Escopo cresce durante o MVP | Alta | Média | Regra inviolável 1; toda inclusão passa por registro e aprovação |
| R-14 | Etapa 6 (salão + pedidos) grande demais para um gate | Média | Média | Entregar em 2 sub-entregas com checkpoint interno (6A mesas, 6B pedidos) |
| R-15 | Perda de dados por falta de backup testado | Baixa | Alta | Backup diário + binlog; restauração testada antes do piloto (Etapa 10) |
| R-16 | Credencial de gerente compartilhada/observada no dispositivo do garçom | Média | Média | PIN separado da senha, rate limit, auditoria de quem pediu e quem autorizou |
| R-17 | Dependência de biblioteca abandonada ou com breaking changes (ORM, auth) | Média | Média | ADRs com critérios; versões fixadas; sessão própria (sem dependência de framework de auth) |
| R-18 | Performance do KDS/mesas degradar com polling em muitos dispositivos | Baixa | Média | Endpoint leve com cursor `since`, índices; SSE como evolução (ADR-0005) |
| R-19 | LGPD: dados pessoais em logs/auditoria sem retenção definida | Média | Média | Mínimo de dados pessoais; retenção definida (docs/security); redaction no logger |
| R-20 | Hospedagem distante (latência) ou servidor serverless incompatível com pool MySQL | Média | Média | ADR-0011: processo Node persistente e banco na região São Paulo |

## Rastreabilidade da Parte A.3

| Item A.3 | Tratamento |
|---|---|
| 1. Ordem das etapas | Roadmap reordenado confirmado ([maps/ROADMAP.md](../../maps/ROADMAP.md)) |
| 2. Estados pedido x item | Order / OrderItem / KitchenTicket separados ([maps/flows/estados.md](../../maps/flows/estados.md)) |
| 3. Estados da mesa | `LIVRE → OCUPADA → AGUARDANDO_CONTA → EM_PAGAMENTO → LIMPEZA → LIVRE` |
| 4. Momento da baixa | ADR-0006 — aguardando decisão |
| 5. Estoque negativo | ADR-0007 — política por loja |
| 6. Taxa de serviço | No PDV do MVP (Etapa 8), configurável por loja (Etapa 3) |
| 7. Dinheiro e quantidades | ADR-0003 |
| 8. Dia operacional e fuso | ADR-0013 |
| 9. Concorrência e idempotência | Coluna `version` + tabela de idempotência (docs/api/convencoes.md) |
| 10. Terminal | Entidade `terminal`; índice único garante 1 sessão de caixa aberta por terminal |
| 11. Risco fiscal | R-01 |
| 12. PIX sem integração | `PaymentProvider` com implementação `ManualConfirmationProvider` |
| 13. Impressão | ADR-0010 |
| 14. Aprovação de gerente | Autorização elevada com PIN (ADR-0002, docs/security) |
| 15. Deploy, versões, LGPD | ADR-0011, docs/security |
| 16. Testes com banco real | Testcontainers MySQL (docs/testing) |
| 17. "Semanas" → Etapas | Etapas com gate, `docs/weeks/etapa-XX.md` |
