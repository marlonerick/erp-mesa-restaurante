# Estratégia de segurança e LGPD

## 1. Autenticação (ADR-0002)

- Login por `username` + senha (sem e-mail obrigatório — mínimo de dados pessoais).
- Hash **Argon2id** (`@node-rs/argon2`, parâmetros OWASP: m=19 MiB, t=2, p=1) para senha e PIN.
  Usuário inexistente também passa pelo Argon2 (hash descartável): tempo de resposta igual.
- Sessão própria em banco: token aleatório de 256 bits no cookie; no banco apenas `SHA-256(token)`.
- Cookies `erp_session` e `erp_device`: `HttpOnly`, `SameSite=Lax`, `Path=/`; com `APP_ORIGIN`
  em `https://` ganham `Secure` e o prefixo `__Host-`.
- Expiração (Q-12): 12 h sem uso, 7 dias no máximo; **3 min em aparelho compartilhado** (E2-3).
  Consultas automáticas não renovam o tempo de uso.
- Revogação no servidor: logout, bloqueio de tela, troca de usuário no aparelho, troca/redefinição
  de senha e desativação encerram sessões.
- Limite de tentativas (tabela `rate_limit_bucket`): 5 falhas/15 min por usuário, 30/15 min por IP;
  mesma mensagem para usuário inexistente, senha errada e usuário desativado.
- **IP do cliente:** só é lido do `X-Forwarded-For` com `TRUST_PROXY=true` (atrás de proxy que
  sobrescreve o cabeçalho). Sem isso o IP é desconhecido e só o limite por usuário vale — confiar no
  cabeçalho sem proxy permitiria driblar o limite trocando o IP falsamente.
- PIN: 6 dígitos, sem sequência/repetição; **5 erros travam** (destrava com login por senha).
- Senha provisória (criação/redefinição pelo gerente) obriga troca; até lá nenhuma permissão vale.

## 2. Autorização

- `authorize(ctx, permission)` em **todo caso de uso**, antes de qualquer leitura/escrita.
- Permissões efetivas = união dos papéis do usuário cujo escopo cobre a loja ativa
  (`STORE = loja`, `COMPANY = empresa da loja`, `ORGANIZATION`).
- Anti-escalada: um usuário só atribui papéis cujas permissões ele próprio possui, e apenas em
  escopos a que tem acesso.
- **Autorização elevada:** o autorizador digita username + PIN (6 dígitos, Argon2id, rate limit
  próprio) no dispositivo atual; vale para **uma** operação (token de uso único, 60 s). Auditoria
  registra `actor_user_id` e `authorizer_user_id` (`ELEVATED_AUTH_GRANTED`).
- Troca de loja em 1 clique valida que o usuário tem papel na loja de destino; grava na sessão (Etapa 3).
- Implementação (Etapa 2): `requirePermission(ctx, ...)` no kernel; `authorizeOrElevate` no módulo
  Authorization consome a autorização com um `UPDATE` condicional (uso único mesmo em paralelo),
  presa à sessão, à loja e à permissão.

## 3. Isolamento entre lojas (IDOR/BOLA)

- Repositórios exigem `storeId` do `RequestContext` como parâmetro obrigatório (tipo `StoreScope`),
  e todo `WHERE` inclui `store_id`. Busca por id de outra loja retorna `404`.
- Suíte automatizada: para cada caso de uso, usuário da loja A tenta ler/alterar recurso da
  loja B → deve falhar. Faz parte do DoD de cada etapa a partir da 3.

## 4. Proteções web

- Validação Zod em toda fronteira; queries parametrizadas via ORM; SQL cru apenas com template
  parametrizado do Drizzle e revisão do `reviewer`.
- XSS: React escapa por padrão; `dangerouslySetInnerHTML` proibido com dado de usuário (regra de lint).
- CSRF: Server Actions do Next verificam `Origin`; Route Handlers mutáveis verificam `Origin`
  explicitamente; cookie `SameSite=Lax`.
- Headers: CSP com nonce, HSTS (produção), `X-Content-Type-Options`, `Referrer-Policy`,
  `frame-ancestors 'none'`, `Permissions-Policy`.
- Secrets somente em variáveis de ambiente; `.env.example` sem valores reais; validação do env com Zod na inicialização.
- Usuário MySQL da aplicação com privilégios mínimos (sem DDL em produção; sem UPDATE/DELETE em `audit_log`).
  Migrations rodam com usuário separado.

## 5. Erros e logs

- Nunca expor stack, SQL ou nome de tabela ao cliente (padrão em docs/api/convencoes.md).
- Pino com `redact` (até 3 níveis de profundidade) para `password`, `passwordHash`, `pin`,
  `pinHash`, `token`, `accessToken`, `refreshToken`, `secret`, `cookie`, `set-cookie`,
  `authorization` e `cpf`.
- Erros de banco no log: o serializador remove `sql`, `params`, `query` e `values`, e troca o trecho
  `params: ...` da mensagem e do stack por `[REDACTED]` — as consultas carregam valores como hash
  de senha e PIN (achado da revisão da Etapa 1, coberto por teste).
- Todo log carrega `requestId`, `storeId`, `userId`.

## 6. LGPD

| Dado pessoal | Onde | Base legal (proposta) | Retenção |
|---|---|---|---|
| Nome e username de funcionários | `user` | Execução de contrato de trabalho | **Para sempre** (desativação por soft delete; vínculo com a auditoria) |
| Dados de negócio (vendas, caixa, estoque, financeiro) | tabelas operacionais | Obrigação legal/legítimo interesse | **Para sempre** (decisão Q-13) |
| Auditoria (inclui IP e navegador de quem agiu) | `audit_log` | Obrigação legal/legítimo interesse (prova de operações financeiras) | **Para sempre** (decisão Q-13) |
| IP e navegador de sessões expiradas | `session` | Legítimo interesse (segurança) | 90 dias após expirar (**proposta — Q-13b**) |
| Logs de aplicação | stdout / coletor (fora do banco) | Legítimo interesse | 90 dias (**proposta — Q-13b**) |
| Clientes do restaurante | **não coletados no MVP** (`label` livre da conta desencorajado para dados pessoais) | — | — |

Decisão Q-13 (2026-09-28): tudo o que está no banco é guardado para sempre. Pela LGPD, dado
pessoal só deve ser mantido enquanto necessário; por isso os dados técnicos de sessão e os logs
têm prazo proposto (Q-13b). A auditoria nunca é alterada nem apagada.

## 7. Cabeçalhos e rastreio (Etapa 1)

- `next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`,
  `Permissions-Policy`, HSTS em produção, sem `X-Powered-By`.
- **CSP com nonce (Etapa 2)** em `src/proxy.ts`: nonce novo por requisição; `script-src 'self'
  'nonce-…' 'strict-dynamic'` (sem `unsafe-eval` em produção), `object-src 'none'`,
  `frame-ancestors 'none'`, `upgrade-insecure-requests` em HTTPS. Todas as páginas são geradas por
  requisição (`connection()` no layout raiz) para o nonce valer. Estilos inline permitidos
  (`'unsafe-inline'` só em `style-src`) — risco bem menor que em scripts.
- `src/proxy.ts`: todo request recebe `x-request-id` (reaproveitado só se tiver formato seguro,
  evitando injeção em logs).

## 8. Vulnerabilidades aceitas

Registro em `osv-scanner.toml`, sempre com justificativa e data de revisão.

| ID | Pacote | Motivo | Revisar até |
|---|---|---|---|
| GHSA-67mh-4wv8-2f99 | esbuild ≤ 0.24.2 (via drizzle-kit, só desenvolvimento) | A falha exige o servidor de desenvolvimento do esbuild (`--serve`), que não usamos; não vai para produção. A "correção" do npm rebaixaria o drizzle-kit | 2027-03-31 |
| GHSA-vfj7-8cjw-p6xm | braces ≤ 3.0.3 (via @next/eslint-plugin-next → fast-glob → micromatch, só desenvolvimento) | Estouro de pilha com padrões `{}` maliciosamente aninhados. Só o lint usa, com os padrões do próprio projeto; não vai para produção. Sem versão corrigida em 2026-10-05 — atualizar assim que sair | 2026-12-31 |

No CI: `npm audit --omit=dev --audit-level=high` (código de produção) e OSV-Scanner em todo o lockfile.

## 9. Revisão de segurança por etapa

Checklist do `reviewer` (fechamento de cada etapa): autorização em todos os casos de uso novos,
teste de isolamento, validação de entrada, idempotência onde aplicável, segredos, logs sem
dados sensíveis, dependências auditadas (`npm audit`, OSV-Scanner), headers.
