# ADR-0009 — Estratégia multi-tenant

- Status: **Aceito** em 2026-09-28
- Data: 2026-09-27
- Responsável: architect + reviewer

## Contexto
Hierarquia Organization → Company → Store → Terminal. MVP com 1 empresa e 1 loja, mas sem
reescrita futura. MySQL não tem Row Level Security.

## Opções
1. Banco por organização.
2. Schema por organização.
3. **Banco e schema compartilhados, discriminador por coluna.**

## Decisão (proposta)
**Opção 3.**
- Dados operacionais (mesas, contas, caixa, estoque, pagamentos, auditoria): `store_id NOT NULL`.
- Cadastros compartilhados pela empresa (categoria, produto, insumo, ficha, categorias financeiras):
  `company_id`; valores por loja em tabela própria (`product_store`, `ingredient_stock`).
- Usuários pertencem à organização; acesso por loja via `user_role_assignment` com escopo.
- Enforcement em camadas:
  1. `RequestContext.storeId` vem da sessão (validado contra os papéis do usuário).
  2. Repositórios exigem `StoreScope` como parâmetro; não existe método "buscar por id" sem escopo.
  3. Índices compostos começam por `store_id`.
  4. Testes de isolamento automatizados (loja A x loja B) em cada etapa.
  5. Revisão do `reviewer` bloqueia query sem filtro de escopo.

Opções 1/2 ficam para eventual cliente enterprise com exigência contratual (novo ADR).

## Consequências
- (+) Simples de operar, relatórios multi-loja triviais no futuro.
- (−) Isolamento depende de disciplina de código — por isso as camadas 2, 4 e 5 são obrigatórias.
