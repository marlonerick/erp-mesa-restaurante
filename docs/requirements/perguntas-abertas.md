# Perguntas abertas para o usuário

"Bloqueia" = a etapa que não pode começar sem a resposta. Cada pergunta traz a proposta
padrão que será adotada se você responder "use a proposta".

| ID | Pergunta | Proposta padrão | Bloqueia |
|---|---|---|---|
| Q-01 | ~~Momento da baixa de estoque?~~ **Respondida (2026-09-29): A** — ao enviar para a cozinha; cancelado antes do preparo volta ao estoque (estorno), depois do preparo vira perda (ADR-0006 aceito) | — | — |
| Q-02 | ~~Impressora na cozinha?~~ **Respondida (2026-09-30): opção A** — a tela da cozinha é o canal principal e cada pedido tem um botão **Imprimir** (navegador, 80 mm). Impressão automática (computador em modo quiosque ou ESC/POS com agente local) fica para depois do piloto, se precisar. **Ainda em aberto:** modelo/conexão da impressora térmica e se o tablet é Android ou iPad | — | — |
| Q-03 | Onde será hospedado? Há provedor preferido ou orçamento mensal? Como é a internet do restaurante (fibra, 4G de contingência)? | Container Node + MySQL gerenciado, região São Paulo | Etapa 10 (staging desde a Etapa 1 se possível) |
| Q-04 | ~~Comanda por mesa ou por cliente? Balcão?~~ **Respondida (2026-09-30):** comanda **por mesa**; no balcão, um **nome livre** identifica o pedido | — | — |
| Q-05 | ~~Horário e corte do dia?~~ **Respondida (2026-09-29):** o piloto funciona geralmente até as **15:00** (horário de funcionamento configurável fica para o futuro); virada do dia operacional às **05:00**, configurável por loja; **vários caixas abertos ao mesmo tempo**, com limite configurável por loja (padrão 1) | — | — |
| Q-06 | ~~Base da taxa de serviço?~~ **Respondida (2026-10-01):** calculada sobre o subtotal **depois dos descontos**; incide sobre **todos os produtos** (inclusive bebidas); **não** se aplica ao balcão | — | — |
| Q-07 | ~~Limites de desconto por perfil?~~ **Respondida (2026-10-01):** GARÇOM 0%, CAIXA 10%, GERENTE e ADMIN 100%; acima do limite, PIN do gerente | — | — |
| Q-08 | ~~Itens sem preparo no KDS? Bar separado?~~ **Respondida (2026-09-30):** itens sem preparo **não aparecem** na cozinha (ficam prontos ao enviar); **uma estação só** | — | — |
| Q-09 | ~~Adicionais consomem estoque? Preço por loja?~~ **Respondida (2026-09-29):** o preço do adicional é **único na empresa** (só o produto tem preço por loja); o adicional **consome estoque pela própria ficha técnica**, ligada na Etapa 5 | — | — |
| Q-10 | ~~Venda por peso?~~ **Respondida (2026-09-29):** **não** no piloto — todo produto é vendido por unidade; a quantidade decimal do kernel permite incluir depois | — | — |
| Q-11 | ~~Onde fica o repositório Git?~~ **Respondida (2026-09-28):** GitHub `marlonerick/erp-mesa-restaurante`, já com o primeiro commit; CI com GitHub Actions | — | — |
| Q-12 | ~~Duração de sessão e aparelhos compartilhados?~~ **Respondida (2026-09-28):** sessão expira após **12 h sem uso** e, no máximo, **7 dias** (depois exige login de novo). Celulares e tablets **serão compartilhados** entre garçons → a Etapa 2 precisa de troca rápida de usuário no mesmo aparelho | — | — |
| Q-13 | ~~Retenção de dados?~~ **Respondida (2026-09-28):** os dados ficam guardados **para sempre** no banco (vendas, caixa, estoque, auditoria). Ver Q-13b | — | — |
| Q-13b | ~~Apagar dados técnicos de sessões expiradas e logs após 90 dias?~~ **Aprovada (2026-09-28):** sim, via `npm run maintenance:purge`; vendas e auditoria continuam para sempre | — | — |
| Q-14 | ~~Iniciar/pronto por ticket ou por item? Tempos de alerta?~~ **Respondida (2026-09-30):** **por item**, com um atalho **"tudo pronto"** no pedido; **amarelo aos 10 minutos e vermelho aos 20**, configurável | — | — |
| Q-15 | ~~Aparelhos do piloto?~~ **Respondida (2026-09-30):** garçons com **celulares da casa**; cozinha com **tablet de 10" ou mais** | — | — |
| Q-16 | ~~Fechamento cego: o que o operador informa?~~ **Respondida (2026-10-01):** **dinheiro obrigatório**; cartão e PIX opcionais | — | — |
| Q-17 | ~~Couvert, consumação mínima, taxa de entrega?~~ **Respondida (2026-10-01):** **fora do MVP** | — | — |
| Q-18 | ~~Garçom transfere e junta mesas?~~ **Respondida (2026-09-30):** **sim**, o garçom pode, e tudo fica registrado na auditoria | — | — |
| Q-19 | ~~Custo unitário de insumo em `DECIMAL(18,6)`?~~ **Aprovado (2026-09-28)** | — | — |
| Q-20 | ~~Aprova os 6 subagentes?~~ **Aprovado (2026-09-28)** | — | — |

## Decisões tomadas na aprovação da Etapa 0 (2026-09-28)

| ID | Decisão |
|---|---|
| D-1 | TypeScript **6.0.x**; migrar para o 7 no futuro (o `typescript-eslint` ainda não suporta) |
| D-2 | Drizzle na **versão estável** (0.45.x), não a 1.0 em teste |
| D-3 | Gerenciador de pacotes **npm** (não pnpm) |
| D-4 | Tabela de idempotência criada na Etapa 1, com chave estrangeira para `store` adicionada na Etapa 3 |
| D-5 | Rotas de saúde em `/health` e `/ready` |
| D-6 | Hooks de commit com **lefthook** |
| D-7 | TS estrito + `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`; sem `exactOptionalPropertyTypes` |

## Decisões tomadas na aprovação da Etapa 1 (2026-09-28)

| ID | Decisão |
|---|---|
| D-8 | Commits no formato `tipo(semana-N): etapa N - o que foi feito` (semana N = etapa N), verificado pelo commitlint |
| D-9 | Trabalho e push **direto na `main`** enquanto o projeto não está em produção; depois, ramos + PR |
| D-10 | BDD com as **duas** ferramentas: `@amiceli/vitest-cucumber` (regras de negócio) e `playwright-bdd` (navegador) |
| E2-1 | Tabelas básicas `organization`, `company` e `store` criadas já na Etapa 2 (cadastro completo segue na Etapa 3) |
| E2-2 | Troca rápida: "Quem está usando?" lista quem entrou com senha no aparelho nos últimos 7 dias; nome + PIN; troca encerra a sessão anterior; 5 PINs errados travam o PIN |
| E2-3 | Aparelho compartilhado: sessão encerra após 3 min sem uso (tela volta para "Quem está usando?") |
| E2-4 | PIN de 6 dígitos, o mesmo para troca rápida e autorização do gerente |
| E2-5 | Primeiro ADMIN criado pelo comando `npm run admin:create` (sem senha fixa no código) |
| E2-6 | Auditoria imutável garantida por trigger no MySQL |
| E2-7 | Dependência `@node-rs/argon2` aprovada |
| D-11 | Skill do Claude Code **frontend-design** (Anthropic, Apache 2.0) instalada no projeto; find-skills, prisma-database-setup e clerk-backend-api avaliadas e **não** adotadas (ver docs/architecture/ferramentas.md) |

## Decisões tomadas na aprovação da Etapa 3 (2026-09-29)

| ID | Decisão |
|---|---|
| E3-1 | Permissão nova `terminals.manage` (ADMIN e GERENTE): o gerente registra o aparelho como terminal sem depender do dono |
| E3-2 | Configurações da loja (taxa de serviço, virada do dia, estoque negativo, caixas abertos) só pelo ADMIN (`stores.manage`) |
| E3-3 | CNPJ da empresa opcional, validado (dígitos verificadores) quando preenchido |
| E3-4 | Menu lateral (sidebar) filtrado por permissões, com seletor de loja; recolhível no computador/tablet, gaveta no celular |
| E3-5 | `store_sequence` (numeração de contas por dia) fica para a Etapa 6, quando for usada |

## Decisões tomadas na aprovação da Etapa 4 (2026-09-29)

| ID | Decisão |
|---|---|
| E4-1 | Permissão nova `products.availability` (marcar "acabou"/"disponível" na loja): ADMIN, GERENTE, CAIXA e COZINHA; garçom não |
| E4-2 | Produto nunca é apagado: é **desativado** (sai do cardápio; histórico e preços ficam guardados) |
| E4-3 | Foto do produto fica para depois do piloto |
| E4-4 | Código (SKU) do produto opcional, único na empresa |
| E4-5 | Instalar o shadcn/ui para janelas, listas e seletores (desvio registrado em docs/weeks/etapa-04.md) |

## Decisões tomadas na aprovação da Etapa 5 (2026-09-29)

| ID | Decisão |
|---|---|
| E5-1 | Permissões da matriz atual: ADMIN e GERENTE lançam (`inventory.manage`, `recipes.manage`); COZINHA só consulta (`inventory.read`, `recipes.read`) |
| E5-2 | Entrada informa a quantidade na unidade da compra e o **valor total pago**; o custo unitário é calculado |
| E5-3 | Custo médio: saldo negativo conta como zero; a compra nova define o custo |
| E5-4 | Motivos de perda: vencido, estragado, erro no preparo, quebra, outro (texto obrigatório) |
| E5-5 | Cada baixa guarda o custo do momento; mudar a ficha técnica não altera o passado |
| E5-6 | Cálculo do CMV pronto e testado nesta etapa; a tela vai para os relatórios da Etapa 9 |

## Decisões tomadas na aprovação do plano da Etapa 6 (2026-09-30)

| ID | Decisão |
|---|---|
| E6-1 | O garçom vê o **subtotal** da conta; taxa de serviço e descontos entram no caixa (Etapa 8) |
| E6-2 | Mesas cadastradas por ADMIN e GERENTE (permissão nova `tables.configure`); número em texto livre ("10", "V1") |
| E6-3 | Quantidade do item: inteiro de 1 a 99 (sem venda por peso — Q-10) |
| E6-4 | Conta aberta por engano pode ser cancelada enquanto nada foi enviado (mesa volta a LIVRE); com itens enviados, cancelar os itens antes |
| E6-5 | Instalar o shadcn/ui (Radix) para janelas: adicionais, PIN do gerente, transferir, juntar |
| E6-6 | Instalar o TanStack Query para atualizar o mapa e a comanda sozinhos (ADR-0012) |
| E6-7 | Número de pessoas na mesa: opcional ao abrir |

## Decisões tomadas na aprovação do plano da Etapa 7 (2026-09-30)

| ID | Decisão |
|---|---|
| E7-1 | Os tempos de alerta da cozinha (10 e 20 minutos) ficam nas configurações da loja, alteradas só pelo ADMIN (como E3-2) |
| E7-2 | A cozinha pode **desfazer um "Pronto"** marcado por engano enquanto o garçom ainda não entregou o item |
| E7-3 | Aviso sonoro quando chega pedido novo, ligado pelo botão **"Ativar som"** (o navegador só toca som depois de um toque na tela) |
| E7-4 | A tela da cozinha mantém o tablet **aceso** enquanto está aberta, onde o navegador permitir |

## Decisões tomadas na aprovação do plano da Etapa 8 (2026-10-01)

| ID | Decisão |
|---|---|
| E8-1 | Recebem pagamento: CAIXA, GERENTE e ADMIN (`payments.create`); o garçom não |
| E8-2 | O caixa só abre num aparelho vinculado a um **terminal do tipo CAIXA** da loja (vínculo da Etapa 3) |
| E8-3 | Cancelar pagamento lançado errado: permitido enquanto a conta não fechou, com motivo e `payments.cancel` (ou PIN do gerente) |
| E8-4 | Reabrir conta fechada fica para depois do piloto |
| E8-5 | O caixa pode ser fechado com contas ainda abertas; elas são recebidas em outro caixa ou no dia seguinte |
| E8-6 | (Revisão, 2026-10-05 — I-3) Sangria maior que o dinheiro esperado é **aceita** e apontada ao gerente na conferência do fechamento — o fechamento continua cego |
| E8-7 | (Revisão, 2026-10-05 — S-2) O limite de desconto do perfil vale na **soma** dos descontos da conta (itens + conta) |

## Decisões tomadas na aprovação do plano da Etapa 9 (2026-10-05)

| ID | Decisão |
|---|---|
| E9-1 | Uma venda conta no **dia operacional em que a conta foi fechada (paga)** — o mesmo dia do caixa que recebeu |
| E9-2 | Categorias iniciais de despesa: Insumos e fornecedores, Salários, Aluguel, Contas de consumo, Impostos e taxas, Manutenção, Outros (o gerente cria outras); receitas: Vendas (automática) e Outras receitas |
| E9-3 | Financeiro só para GERENTE e ADMIN (`finance.read`/`finance.manage`) |
| E9-4 | O CAIXA vê o painel operacional (`dashboard.read`), sem valores financeiros detalhados e sem o esperado dos caixas |
| E9-5 | Gráficos sem biblioteca nova: barras simples feitas na própria tela |
| E9-6 | Relatórios baixam em **CSV** (sem dependência nova) e imprimem pelo navegador |
| E9-7 | Margem por produto (preço − custo da ficha no momento da venda) no relatório de vendas, só para GERENTE e ADMIN |

## Pontos da especificação que interpretei (confirme ou corrija)

1. **Juntar mesas**: as mesas passam a compartilhar a mesma conta; a conta de origem é encerrada
   como `CANCELADO` com motivo `MESCLADA`, sem valor (o README só define `ABERTO → FECHADO | CANCELADO`).
2. **`tables.manage`** = mudar o estado da mesa (ex.: liberar mesa em `LIMPEZA`); o **cadastro** de
   mesas usa a permissão nova `tables.configure` (E6-2). Abrir mesa = `orders.create`;
   transferir/juntar = `orders.update` (garçom incluído — Q-18).
3. **Receita financeira** das vendas é gerada no **fechamento do caixa**, uma entrada por método de pagamento.
4. **Movimentos de estoque de venda** usam tipos próprios (`CONSUMO_VENDA`, `ESTORNO_VENDA`) além dos
   quatro do README (entrada, saída, ajuste, perda), para os relatórios separarem venda de ajuste manual.
5. **Autorização elevada** usa um **PIN** separado da senha (username + PIN do autorizador).
6. **Reports** lê dados de vários módulos por *query services* somente leitura — exceção
   documentada à regra "nunca acessar tabelas de outro módulo" (sem escrita, sem regra de negócio).
   A alternativa (cada módulo expor consultas de relatório) é mais lenta e duplica código.
7. **Roadmap**: adicionei ao escopo da Etapa 1 o "kernel compartilhado" (Money, Quantity, Clock,
   IDs, idempotência), usado por todas as etapas seguintes.
