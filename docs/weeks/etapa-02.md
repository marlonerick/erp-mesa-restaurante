# Etapa 2 — Identidade e acesso (`semana-2`)

Plano aprovado em 2026-09-28 com as decisões E2-1 a E2-7 e Q-13b (docs/requirements/perguntas-abertas.md).

## Objetivo
Login seguro, sessões revogáveis, usuários, perfis e permissões por loja, autorização do gerente
por PIN, troca rápida em aparelho compartilhado e auditoria imutável.

## Escopo
Especificações: `docs/modules/auth.md`, `authorization.md`, `users.md`, `audit.md`,
`organizations.md` (parte mínima). Cenários: `tests/features/{auth,authorization,users}/`.

## Fora do escopo
Cadastro completo de empresa/loja/terminal e troca de loja (Etapa 3); tela de auditoria (Etapa 9);
recuperação de senha por e-mail/SMS (não previsto).

## Dependências
Etapa 1 (kernel, banco, idempotência, erros, logger).

## Andamento
(atualizado ao fim da etapa)

## Definition of Done
- [ ] SDDs e cenários BDD
- [ ] Migrations revisadas
- [ ] Testes unitários, integração (MySQL real), BDD, isolamento entre lojas, E2E
- [ ] Lint, typecheck, build, CI
- [ ] Revisão do `reviewer`
- [ ] Docs, mapas e `PROJECT_STATUS.md`
- [ ] `APROVADO` do usuário
