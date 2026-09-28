# Etapa 2 — Identidade e acesso (`semana-2`)

Plano aprovado em 2026-09-28 com as decisões E2-1 a E2-7 e Q-13b (docs/requirements/perguntas-abertas.md).

## Objetivo
Login seguro, sessões revogáveis, usuários, perfis e permissões por loja, autorização do gerente
por PIN, troca rápida em aparelho compartilhado e auditoria imutável.

## Entregue

| Área | Entrega |
|---|---|
| Especificação | SDDs `auth`, `authorization`, `users`, `audit`, `organizations` (mínimo); 22 cenários BDD em português |
| Banco | 14 tabelas (migration 0001) + triggers de auditoria imutável e catálogo de 34 permissões / 5 perfis (migration 0002) |
| Regras (domínio) | Senha, PIN, expiração de sessão (12 h / 3 min compartilhado / 7 dias), limite de tentativas, permissões por escopo, anti-escalada, nome de usuário |
| Casos de uso | Login, troca rápida por PIN, sessão/contexto, sair, bloquear tela, trocar senha, cadastrar PIN, autorização do gerente (uso único, 60 s), administração de usuários, primeira instalação, limpeza LGPD |
| Web | Cookies HttpOnly/SameSite (Secure e `__Host-` em HTTPS), Server Actions com Zod, **CSP com nonce** por requisição |
| Telas | Login, "Quem está usando?" com teclado de PIN, trocar senha, meu PIN, início, usuários (lista, cadastro, edição) — identidade de azulejo (skill frontend-design) |
| Comandos | `npm run admin:create`, `npm run db:seed`, `npm run maintenance:purge` |

## Desvios e decisões tomadas durante a etapa

| Situação | Decisão | Onde |
|---|---|---|
| Trigger não podia ser criado com binlog ligado (erro 1419) | `log_bin_trust_function_creators=1` em todos os ambientes (produção inclusive) | docs/deployment/ambientes.md |
| Módulos precisavam de funções web de outros sem carregar Next nos scripts | Porta `@/modules/<m>/web` + injeção entre módulos + tabelas centralizadas | ADR-0014 |
| Scripts TypeScript com atalho `@/` | Tradutor próprio (`scripts/register-alias.mjs`, ~30 linhas) em vez de instalar `tsx` | — |
| Componentes shadcn/ui | Escritos no estilo shadcn (código no projeto), sem CLI nem Radix por ora; instalação completa quando houver janelas/seletores (Etapa 4) | — |
| Formulários | `useActionState` do React + Zod no servidor; React Hook Form fica para formulários complexos | ADR-0012 |
| IP do cliente para o limite por IP | Só confiado atrás de proxy (`TRUST_PROXY=true`); sem isso, apenas o limite por usuário vale | docs/security |
| Nome de usuário único | Único **no sistema** (não por organização): login sem escolher empresa | docs/modules/auth.md |

## Problemas encontrados e corrigidos
1. **Deadlock em logins simultâneos (troca de turno).** `UPDATE`/`DELETE` que não encontram linhas
   ainda "trancam" trechos do índice (gap lock); com ids UUIDv7 crescentes, todos os logins em
   aparelhos novos disputavam o mesmo trecho. Correção: não encerrar sessões de aparelho recém-criado
   nem apagar contador vazio. Teste de 20 logins simultâneos **falha sem a correção**.
2. **Falha de login precisa ser gravada antes do erro:** se o erro fosse lançado dentro da
   transação, o banco desfaria o contador de tentativas e o limite de 5 nunca funcionaria. Os casos
   de uso devolvem o resultado da transação e só depois lançam o erro.
3. **Acessibilidade da lista de usuários:** mudar o `display` de `<tr>` apagava a tabela para
   leitores de tela. Agora: tabela no computador, lista no celular.
4. **Classes CSS que se anulavam** no teclado de PIN (achado na revisão por capturas de tela).

## Revisão do `reviewer` (2026-09-28)

1ª revisão: **reprovada** (2 bloqueantes, 6 importantes, 7 sugestões). Todos os bloqueantes e
importantes foram reproduzidos por testes (`tests/integration/modules/review-etapa-02.test.ts`,
11 vermelhos antes da correção) e corrigidos:

| # | Achado | Correção |
|---|---|---|
| B1 | Gerente conseguia redefinir a senha do ADMIN da organização (e de quem é gerente em outra loja) e virar ADMIN | Guarda "quem age está acima do alvo" em todos os escopos (RN-AUTHZ-09) |
| B2 | Limite de 5 tentativas furado por tentativas simultâneas | Reservar antes de conferir (RN-AUTH-16); teste: 20 em paralelo → ≤ 5 conferências |
| I1 | Travamento do PIN com a mesma janela | Reserva atômica no `app_user` antes do Argon2 |
| I2 | Troca por PIN em aparelho não compartilhado; login sem a caixa "descompartilhava" o tablet | Só em compartilhado; compartilhado é permanente (RN-AUTH-18) |
| I3 | Filtro de segredos da auditoria apagava a descrição dos eventos de senha/PIN | Filtro por nome exato do campo + campo neutro `change` |
| I4 | Senha atual podia ser adivinhada sem limite | Mesmo limite do login (RN-AUTH-19) |
| I5 | Argon2 segurava conexão do pool | Três passos: reserva → Argon2 fora → grava (RN-AUTH-17) |
| I6 | Auth apagava tabela do Authorization | Limpeza das autorizações pela API do Authorization |
| S1 | Autorização do gerente revelava quem existe | Resposta única `INVALID_AUTHORIZATION` + tempo constante + auditoria |
| S2 | Autorizador com senha provisória autorizava | Recusado |
| S3 | Cookie `__Host-` não era apagado | Regravado vazio com as mesmas opções |
| S4 | `APP_ORIGIN` http em produção | Exige https (exceto localhost) |
| S5 | Primeiro IP do X-Forwarded-For (falsificável) | Último IP (o que o nosso proxy viu) |
| S6 | Janela fixa | Registrado no SDD (RN-AUTH-20) |
| S7 | Texto digitado no campo usuário ia para a auditoria | Só grava se tiver formato de usuário |

Também: o limite por IP agora devolve a tentativa em login certo — sem isso, a troca de turno
(toda a equipe no mesmo IP) bloquearia o restaurante.

## Testes (2026-09-28)

| Tipo | Resultado |
|---|---|
| Unitários (domínio, kernel, arquitetura, CSP) | ✅ 220 |
| Integração com MySQL 8.4 real (BDD + regras de borda + auditoria + concorrência + achados da revisão) | ✅ 154 |
| E2E no navegador (celular, tablet, desktop) + BDD | ✅ 37 (2 execuções seguidas, sem instabilidade) |
| Cobertura do kernel | ✅ 96,8% |

## Segurança
Senhas e PINs em Argon2id; token de sessão só como hash no banco; cookies HttpOnly/SameSite/Secure;
mesma mensagem para usuário inexistente, senha errada e usuário desativado (tempo constante);
limite de tentativas por usuário e IP; PIN trava após 5 erros; autorização elevada de uso único
presa à sessão e à permissão; anti-escalada de perfis; isolamento entre lojas testado (lista,
edição, senha, desativação, perfis); auditoria imutável garantida por trigger; CSP com nonce.

## Definition of Done
- [x] SDDs e cenários BDD
- [x] Migrations revisadas
- [x] Testes unitários, integração (MySQL real), BDD, isolamento entre lojas, E2E
- [x] Lint, typecheck, build
- [ ] CI no GitHub (após o push)
- [ ] Revisão do `reviewer`
- [x] Docs, mapas e `PROJECT_STATUS.md`
- [ ] `APROVADO` do usuário
