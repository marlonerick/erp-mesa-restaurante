# Estratégia de segurança e LGPD

## 1. Autenticação (ADR-0002)

- Login por `username` + senha (sem e-mail obrigatório — mínimo de dados pessoais).
- Hash **Argon2id** (`@node-rs/argon2`, parâmetros OWASP: m=19 MiB, t=2, p=1, revisados na Etapa 2).
- Sessão própria em banco: token aleatório de 256 bits no cookie; no banco apenas `SHA-256(token)`.
- Cookie `__Host-session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- Expiração: ociosa 12 h (turno) e absoluta 7 dias (valores a confirmar — Q-12); renovação deslizante.
- Revogação no servidor: logout, desativação de usuário, troca de senha e reset revogam todas as sessões.
- Rate limit de login por `username` e por IP (tabela `rate_limit_bucket`): 5 falhas/15 min por usuário,
  30/15 min por IP; resposta genérica ("usuário ou senha inválidos").
- Reset de senha apenas por ADMIN/GERENTE, com `must_change_password`.

## 2. Autorização

- `authorize(ctx, permission)` em **todo caso de uso**, antes de qualquer leitura/escrita.
- Permissões efetivas = união dos papéis do usuário cujo escopo cobre a loja ativa
  (`STORE = loja`, `COMPANY = empresa da loja`, `ORGANIZATION`).
- Anti-escalada: um usuário só atribui papéis cujas permissões ele próprio possui, e apenas em
  escopos a que tem acesso.
- **Autorização elevada:** o autorizador digita username + PIN (6 dígitos, Argon2id, rate limit
  próprio) no dispositivo atual; vale para **uma** operação (token de uso único, 60 s). Auditoria
  registra `actor_user_id` e `authorizer_user_id` (`ELEVATED_AUTH_GRANTED`).
- Troca de loja em 1 clique valida que o usuário tem papel na loja de destino; grava na sessão.

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
- Pino com `redact` para `password`, `pin`, `token`, `cookie`, `authorization`, `*.cpf`.
- Todo log carrega `requestId`, `storeId`, `userId`.

## 6. LGPD

| Dado pessoal | Onde | Base legal (proposta) | Retenção |
|---|---|---|---|
| Nome e username de funcionários | `user` | Execução de contrato de trabalho | Enquanto ativo; após desativação, mantido (soft delete) por vínculo com auditoria — 5 anos |
| IP e user-agent | `session`, `audit_log` | Legítimo interesse (segurança) | Sessões: 90 dias após expirar; auditoria: 5 anos |
| Logs de aplicação | stdout / coletor | Legítimo interesse | 90 dias |
| Auditoria | `audit_log` | Obrigação legal/legítimo interesse (prova de operações financeiras) | 5 anos |
| Clientes do restaurante | **não coletados no MVP** (`label` livre da conta desencorajado para dados pessoais) | — | — |

Valores de retenção são proposta — confirmar com o usuário (Q-13). Descarte: job de limpeza
agendado; auditoria nunca é alterada, apenas expurgada após o prazo.

## 7. Cabeçalhos e rastreio (Etapa 1)

- `next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`,
  `Permissions-Policy`, CSP parcial (`frame-ancestors 'none'; base-uri; form-action; object-src`),
  HSTS em produção, sem `X-Powered-By`. **CSP completa com nonce: Etapa 2.**
- `src/proxy.ts`: todo request recebe `x-request-id` (reaproveitado só se tiver formato seguro,
  evitando injeção em logs).

## 8. Vulnerabilidades aceitas

Registro em `osv-scanner.toml`, sempre com justificativa e data de revisão.

| ID | Pacote | Motivo | Revisar até |
|---|---|---|---|
| GHSA-67mh-4wv8-2f99 | esbuild ≤ 0.24.2 (via drizzle-kit, só desenvolvimento) | A falha exige o servidor de desenvolvimento do esbuild (`--serve`), que não usamos; não vai para produção. A "correção" do npm rebaixaria o drizzle-kit | 2027-03-31 |

No CI: `npm audit --omit=dev --audit-level=high` (código de produção) e OSV-Scanner em todo o lockfile.

## 9. Revisão de segurança por etapa

Checklist do `reviewer` (fechamento de cada etapa): autorização em todos os casos de uso novos,
teste de isolamento, validação de entrada, idempotência onde aplicável, segredos, logs sem
dados sensíveis, dependências auditadas (`npm audit`, OSV-Scanner), headers.
