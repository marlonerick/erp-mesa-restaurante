# Audit — Especificação (SDD)

> Status: Aprovado — Etapa: 2 — Responsável: domain-spec — Decisões: README B.7.8, Q-13, E2-6

## 1. Objetivo
Registro permanente e à prova de alteração de quem fez o quê, quando, onde e com autorização de quem.

## 3. Regras de negócio
- **RN-AUDIT-01** — Cada registro tem: evento, usuário, usuário autorizador (se houver), organização, loja, entidade e id, dados antes/depois (sem segredos), IP, navegador, `requestId`, data/hora (UTC).
- **RN-AUDIT-02** — **Somente inclusão.** Alterar ou apagar é impedido **pelo próprio MySQL** (trigger), não só pelo código (E2-6).
- **RN-AUDIT-03** — Guardado **para sempre** (Q-13).
- **RN-AUDIT-04** — O registro é gravado na **mesma transação** da operação: se a operação desfaz, o registro também; se o registro falha, a operação falha.
- **RN-AUDIT-05** — Nunca registrar senha, PIN, hash, token ou cookie nos dados antes/depois.
- **RN-AUDIT-06** — Eventos da Etapa 2: `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `USER_CREATED`, `USER_UPDATED`, `USER_DISABLED`, `ROLE_CHANGED`, `ELEVATED_AUTH_GRANTED`.
- **RN-AUDIT-07** — `LOGIN_FAILED` de usuário inexistente não tem usuário nem organização; registra o nome tentado.

## 10. Critérios de aceite
- **CA-AUDIT-01** — Tentar `UPDATE`/`DELETE` em `audit_log` falha no banco → teste de integração
- **CA-AUDIT-02** — Login, falha e logout geram eventos com IP e requestId → `tests/features/auth/login.feature`
- **CA-AUDIT-03** — Nenhum evento contém senha/PIN/hash → teste de integração

## 13. Fora do escopo
Tela de consulta (Etapa 9).
