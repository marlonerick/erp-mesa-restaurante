# Perguntas abertas para o usuário

"Bloqueia" = a etapa que não pode começar sem a resposta. Cada pergunta traz a proposta
padrão que será adotada se você responder "use a proposta".

| ID | Pergunta | Proposta padrão | Bloqueia |
|---|---|---|---|
| Q-01 | Momento da baixa de estoque: **A** ao enviar para a cozinha ou **B** no fechamento da conta? (ADR-0006) | A | Etapa 5 |
| Q-02 | O piloto precisa de impressora na cozinha (impressão automática)? A pré-conta precisa ser impressa? Há impressora térmica? Qual modelo e conexão (USB/rede)? | Pré-conta via navegador; cozinha só KDS | Etapa 7 |
| Q-03 | Onde será hospedado? Há provedor preferido ou orçamento mensal? Como é a internet do restaurante (fibra, 4G de contingência)? | Container Node + MySQL gerenciado, região São Paulo | Etapa 10 (staging desde a Etapa 1 se possível) |
| Q-04 | O restaurante piloto usa comanda **por mesa** ou **por cliente** (cartão/comanda individual)? Como funciona o balcão (nome, senha numérica)? | Por mesa; balcão identificado por rótulo livre | Etapa 6 |
| Q-05 | Horário de funcionamento do piloto? Corte do dia operacional às 05:00 está ok? Haverá mais de um caixa aberto ao mesmo tempo? | Corte 05:00; 1 caixa | Etapa 3 |
| Q-06 | Taxa de serviço: calculada sobre o subtotal **após** descontos? Incide sobre todos os produtos (inclusive bebidas)? Aplica-se ao balcão? | Após descontos; todos os produtos; não se aplica ao balcão | Etapa 8 |
| Q-07 | Limites de desconto por perfil (ex.: GARCOM 0%, CAIXA 10%, GERENTE 100%)? | Os do exemplo | Etapa 8 |
| Q-08 | Itens sem preparo (refrigerante, água) devem aparecer no KDS? Existe **bar** como estação separada no piloto? | Não aparecem (marcados como prontos ao enviar); 1 estação | Etapa 6 |
| Q-09 | Adicionais (ex.: "bacon extra") consomem estoque? Têm preço diferente por loja? | Consomem via ficha técnica do adicional; preço único por empresa | Etapa 4 |
| Q-10 | Há venda **por peso** (buffet por kg, balança)? | Não no piloto (modelo já aceita quantidade decimal) | Etapa 4 |
| Q-11 | ~~Onde fica o repositório Git?~~ **Respondida (2026-09-28):** GitHub `marlonerick/erp-mesa-restaurante`, já com o primeiro commit; CI com GitHub Actions | — | — |
| Q-12 | Duração de sessão: expira após 12 h ociosa e 7 dias no máximo? Tablets/celulares serão **compartilhados** entre garçons (exige troca rápida de usuário)? | 12 h / 7 dias; aparelhos individuais | Etapa 2 |
| Q-13 | Retenção: auditoria 5 anos, logs 90 dias, backups diários por 30 dias e mensais por 12 meses? | Sim | Etapa 2 (auditoria) / Etapa 10 |
| Q-14 | No KDS, "iniciar/pronto" é por **ticket inteiro** ou **por item**? Tempos de alerta (ex.: amarelo 10 min, vermelho 20 min)? | Por item, com atalho "tudo" no ticket; 10/20 min configurável | Etapa 7 |
| Q-15 | Dispositivos do piloto: garçons usam celular próprio ou da casa? KDS em TV, monitor ou tablet? | Celulares da casa; KDS em tablet ≥ 10" ou monitor touch | Etapa 6 |
| Q-16 | Fechamento cego: o operador informa só o **dinheiro** ou também os totais de cartão e PIX conferidos? | Dinheiro obrigatório; cartão/PIX opcional | Etapa 8 |
| Q-17 | Couvert artístico, consumação mínima ou taxa de entrega existem no piloto? | Fora do MVP | Etapa 8 |
| Q-18 | Garçom pode **transferir e juntar** mesas, ou só gerente/caixa? (ver matriz de permissões) | Garçom pode (com auditoria) | Etapa 6 |
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

## Pontos da especificação que interpretei (confirme ou corrija)

1. **Juntar mesas**: as mesas passam a compartilhar a mesma conta; a conta de origem é encerrada
   como `CANCELADO` com motivo `MESCLADA`, sem valor (o README só define `ABERTO → FECHADO | CANCELADO`).
2. **`tables.manage`** = cadastro de mesas e forçar estado (ex.: liberar mesa em `LIMPEZA`).
   Abrir mesa = `orders.create`; transferir/juntar = `orders.update`.
3. **Receita financeira** das vendas é gerada no **fechamento do caixa**, uma entrada por método de pagamento.
4. **Movimentos de estoque de venda** usam tipos próprios (`CONSUMO_VENDA`, `ESTORNO_VENDA`) além dos
   quatro do README (entrada, saída, ajuste, perda), para os relatórios separarem venda de ajuste manual.
5. **Autorização elevada** usa um **PIN** separado da senha (username + PIN do autorizador).
6. **Reports** lê dados de vários módulos por *query services* somente leitura — exceção
   documentada à regra "nunca acessar tabelas de outro módulo" (sem escrita, sem regra de negócio).
   A alternativa (cada módulo expor consultas de relatório) é mais lenta e duplica código.
7. **Roadmap**: adicionei ao escopo da Etapa 1 o "kernel compartilhado" (Money, Quantity, Clock,
   IDs, idempotência), usado por todas as etapas seguintes.
