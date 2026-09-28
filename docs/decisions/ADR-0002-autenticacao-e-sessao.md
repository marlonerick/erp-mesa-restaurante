# ADR-0002 — Autenticação e sessão

- Status: **Proposto**
- Data: 2026-09-27
- Responsável: architect + reviewer

## Contexto
Requisitos: login por credenciais, Argon2id, cookies `HttpOnly`/`Secure`/`SameSite`, **sessão
revogável no servidor**, expiração, rate limit, loja ativa e terminal na sessão, PIN de gerente
para autorização elevada. Não há login social nem cadastro público.

## Opções

| Critério | Auth.js v5 (Credentials) | Sessão própria em banco |
|---|---|---|
| Revogação no servidor | O provider Credentials opera com estratégia JWT por padrão; revogação exige lista de bloqueio ou adaptações | Nativa (`revoked_at`) |
| Dados de contexto (loja ativa, terminal) | Via callbacks do JWT; atualizar exige reemitir token | Colunas da sessão, atualização direta |
| Código a manter | Menos código, mais configuração e mágica | ~300 linhas testadas (criar, validar, rotacionar, revogar) |
| Rate limit, PIN, autorização elevada | Fora do escopo da biblioteca — implementação própria de qualquer forma | Implementação própria |
| Dependência externa | Sim (histórico de mudanças entre versões) | Não |
| Benefício futuro | Fácil adicionar OAuth | OAuth pode ser adicionado depois se necessário |

## Decisão (proposta)
**Sessão própria em banco.** A combinação Credentials + JWT do Auth.js contraria o requisito
de sessão revogável, e as partes difíceis (rate limit, PIN, escopo de loja) seriam próprias de qualquer forma.

Desenho:
- Token opaco de 256 bits (`crypto.randomBytes`), cookie `__Host-session`; banco guarda `SHA-256`.
- Validação a cada requisição (1 query por PK de hash), `last_seen_at` atualizado no máximo a cada 5 min.
- Expiração ociosa + absoluta; rotação do token no login e na troca de privilégio.
- Senhas e PINs com Argon2id (`@node-rs/argon2`).
- Rate limit em tabela MySQL (`rate_limit_bucket`) — sem Redis.
- Autorização elevada: username + PIN do autorizador → token de uso único (60 s) vinculado à operação.

## Consequências
- (+) Controle total, revogação imediata, sem dependência de framework de auth.
- (−) Código de segurança próprio → TDD obrigatório e revisão do `reviewer` em 100% do módulo.
