# Etapa 3 — Organização e contexto (`semana-3`)

Plano aprovado em 2026-09-29 com as decisões Q-05 e E3-1 a E3-5
(docs/requirements/perguntas-abertas.md).

## Objetivo
Montar a estrutura do negócio — empresa → lojas → terminais — com as configurações de cada loja
das quais as próximas etapas dependem, e permitir trocar de loja com 1 clique.

## Entregue

| Área | Entrega |
|---|---|
| Especificação | SDD `organizations` completo (RN-ORG-01 a 13); 16 cenários BDD em português (lojas, empresa, terminais, troca de loja, dia operacional) |
| Banco | Migration 0003: configurações em `store` (virada do dia, taxa de serviço, estoque negativo, caixas abertos), tabelas `terminal` e `kitchen_station`, `version` em `company`, FK da idempotência para a loja (D-4), permissão `terminals.manage` |
| Regras | CNPJ com dígitos verificadores, códigos de loja/terminal, fusos do Brasil, taxa em pontos-base sem ponto flutuante, **dia operacional** (`operationalDate`) no kernel |
| Casos de uso | Empresa (cadastrar, alterar), loja (cadastrar com estação "Cozinha", alterar, desativar/reativar), terminal (cadastrar, alterar, desativar, **usar este aparelho**, desvincular), troca de loja, sessão que conhece o terminal e sai de loja desativada |
| Web | Server Actions com Zod; `ActionForm` (não perde o que foi digitado quando o servidor recusa) |
| Telas | **Menu lateral** (computador fixo e recolhível, tablet só ícones, celular em gaveta) com seletor de loja; Empresa, Lojas (lista, cadastro, edição, desativar), Terminais (lista, cadastro, edição, vínculo do aparelho); Início mostra o **dia de trabalho** |

## Desvios e decisões tomadas durante a etapa

| Situação | Decisão | Onde |
|---|---|---|
| Organizations precisa consultar permissões por escopo, mas Authorization já depende de Organizations | Porta `StoreAccess` **injetada** pela camada web (mesmo padrão da Etapa 2) | ADR-0014, maps/modules/dependencias.md |
| Modelo previa `terminal.device_token_hash` | `terminal.device_id` → `known_device`: reaproveita o aparelho da Etapa 2 (sem segundo cookie) | docs/database/modelo-de-dados.md |
| ADR-0013 previa `shared/operational-day` | Função no **kernel**, porque o domínio (caixa, estoque) vai usá-la | ADR-0013 |
| Estação padrão para lojas já existentes | Criada na migration com id UUIDv7 montado em SQL (conferido no banco de desenvolvimento) | drizzle/0003 |
| React 19 limpa o formulário depois de cada envio, até com erro | `src/ui/action-form.tsx` cancela a limpeza; só limpa após cadastro bem-sucedido | — |

## Problemas encontrados e corrigidos
1. **Organização podia ficar sem nenhuma loja ativa.** Dois administradores, cada um em uma loja,
   desativando ao mesmo tempo a loja do outro: cada um contava "2 ativas" e os dois passavam.
   Correção: a contagem trava as lojas da organização (`SELECT … FOR UPDATE`); a segunda
   desativação espera a primeira e é recusada. Teste de concorrência **falhou antes** da correção.
2. **Página mais larga que o celular no cadastro de loja.** `fieldset` tem, por padrão, largura
   mínima igual ao conteúdo; a lista de fusos com nomes longos alargou a página (491 px numa tela de
   412 px) e o bloco cobriu o botão. Correção: `min-w-0` no `fieldset` e no campo de lista.
3. **Mensagem de sucesso sumia ao vincular o terminal.** Depois de vincular, a tela atualiza e o
   botão some (o aparelho já é aquele terminal) — levando a mensagem junto. A mensagem agora fica
   fora dos formulários.
4. **MySQL do CI caía na criação** (antes desta etapa, registrado em etapa-02.md, problema 5).

## Revisão do `reviewer` (2026-09-29)

1ª revisão: **reprovada** (1 bloqueante, 7 importantes, 10 sugestões). Correções com testes em
`tests/integration/modules/review-etapa-03.test.ts` e `tests/unit/shared/kernel/same-store.test.ts`:

| # | Achado | Correção |
|---|---|---|
| B-1 | Vincular um aparelho desfazia o vínculo de um terminal de **outra organização** (tablet reaproveitado por outro restaurante) | `terminal.organization_id` + índice único (organização, aparelho) — migration 0004; a busca exige a organização |
| I-1 | Buscas por id sem escopo no repositório (contra o ADR-0009) | `findCompany`, `findStoreRecord`, `findTerminal` e `getStoreSettings` exigem organização/loja |
| I-2 | Vincular/desativar/desvincular ao mesmo tempo podia perder vínculos ou deixar terminal desativado com aparelho | Terminal lido com trava; vínculo só grava se ativo e na versão da tela; desfazer só se o aparelho ainda for aquele; testes de concorrência (5 rodadas cada) |
| I-3 | Auditoria gravava a loja da sessão, não a loja alterada | `recordAuditFromContext` aceita a loja afetada; empresa grava sem loja |
| I-4 | "Sem loja, a sessão termina" não encerrava a sessão no banco | Sessão encerrada com motivo `SEM_LOJA`; teste reativa a loja e confere que o cookie antigo não volta |
| I-5 | Aba antiga gravava na loja nova sem aviso | Formulários de dados da loja ativa (terminais, perfis de usuário) enviam a loja da tela; servidor recusa com `STORE_CHANGED` |
| I-6 | Faltavam testes de perfil de EMPRESA e de ADMIN só de loja | Testes adicionados |
| I-7 | Documentação fora do commit | Incluída neste commit |

Sugestões aplicadas: sessão lida uma vez por envio (1); conflito de versão já recarrega a tela
(2); aviso quando a troca de loja é recusada (3); quem perde o perfil na loja ativa também é movido
(4) e a mudança automática vai para a auditoria (5); uma estação padrão por loja garantida no banco
(6); perfis consultados uma vez só (7); "Cadastrar outra empresa" só para quem administra a
organização (8); seletor de loja fecha com Esc/toque fora e botão de recolher com `aria-controls`
(9); apagar um aparelho no futuro só desfaz o vínculo (`ON DELETE SET NULL`) (10).

2ª revisão (reverificação): **aprovada com ressalvas** — bloqueante e importantes resolvidos; a
migration 0004 foi testada pelo revisor num banco com terminais existentes. Ressalvas tratadas:

| # | Achado | Correção |
|---|---|---|
| R-1 | Mudança automática de loja podia gravar a auditoria em dobro (layout e página autenticam ao mesmo tempo) | Mudança de loja da sessão só acontece se ela ainda estiver na loja antiga (UPDATE condicional); só quem mudou registra; teste com duas autenticações simultâneas |
| S-2 | Teste de troca cruzada aceitava erro bruto do banco | Falha só pode ser `CONCURRENT_MODIFICATION`; teste novo: dois aparelhos em dois terminais livres ao mesmo tempo, os dois conseguem |
| S-3 | Índice criado pelo MySQL fora do snapshot | Registrado em docs/database/modelo-de-dados.md |
| S-4 | Formulários de usuário sem a loja da tela | Decisão registrada (RN-USERS-09) |
| S-1 | Consultas repetidas em `authenticate` | Débito técnico: `cache()` por requisição arriscaria mostrar a sessão de ANTES de uma ação (ex.: terminal recém-vinculado) |

## Como experimentar (banco de desenvolvimento)
1. `npm run db:up`, `npm run db:migrate` (aplica a 0003 e a 0004), `npm run dev`.
2. Entre como `admin` / `Admin@2026`: menu lateral → **Lojas** → Praia → mude a taxa de serviço
   para 12,5 e salve. Troque de loja pelo topo do menu.
3. Entre como `gerente` / `Gerente@2026` → **Terminais** → cadastre "CX1 · Caixa 1" → abra →
   **Usar este aparelho como Caixa 1**. O menu e o Início passam a mostrar o terminal.
4. No celular (ou janela estreita), o menu abre pelo botão ☰.

## Testes (2026-09-29)

| Tipo | Resultado |
|---|---|
| Unitários (regras, CNPJ, taxa, fusos, dia operacional com fast-check) | ✅ 300 |
| Integração com MySQL 8.4 real (BDD + regras de borda + concorrência + achados da revisão) | ✅ 249 |
| E2E no navegador (celular, tablet, desktop + BDD) | ✅ 60 (4 pulados de propósito: testes só de computador ou só de celular) |

## Definition of Done
- [x] SDD e cenários BDD
- [x] Migration revisada (e aplicada no banco de desenvolvimento)
- [x] Testes unitários, integração (MySQL real), BDD, isolamento entre lojas/organizações, E2E
- [x] Lint, typecheck, build
- [x] CI no GitHub (verde no commit da implementação; conferido de novo após as correções)
- [x] Revisão do `reviewer` (1ª reprovada; achados corrigidos e reverificados)
- [x] Docs e maps
- [x] `PROJECT_STATUS.md`
- [x] `APROVADO` do usuário (2026-09-29)
