# Users — Especificação (SDD)

> Status: Aprovado — Etapa: 2 — Responsável: domain-spec

## 1. Objetivo
Cadastrar e manter as pessoas que usam o sistema, sempre por um ADMIN ou GERENTE.

## 3. Regras de negócio
- **RN-USERS-01** — Não há cadastro público; só quem tem `users.create` cria usuários.
- **RN-USERS-02** — Nome de usuário: 3 a 50 caracteres, letras minúsculas sem acento, números, ponto, hífen e sublinhado; único no sistema (sem diferenciar maiúsculas).
- **RN-USERS-03** — Ao criar, o gerente define uma **senha provisória** e ao menos um perfil em uma loja; o usuário troca a senha no primeiro acesso (RN-AUTH-09).
- **RN-USERS-04** — Usuário é **desativado**, nunca apagado (histórico e auditoria). Desativar encerra todas as sessões dele.
- **RN-USERS-05** — Ninguém desativa a si mesmo.
- **RN-USERS-06** — Redefinir senha (`users.update`) gera nova senha provisória, encerra as sessões e destrava o PIN.
- **RN-USERS-07** — O gerente só vê e altera usuários que tenham perfil em lojas a que ele tem acesso (isolamento).
- **RN-USERS-08** — Dados pessoais mínimos (LGPD): nome e usuário. Sem CPF, e-mail ou telefone no MVP.
- **RN-USERS-09** — Cadastrar e definir perfis valem para a **loja ativa**: o formulário envia a loja
  da tela e o servidor recusa com `STORE_CHANGED` se a sessão trocou de loja em outra aba (Etapa 3,
  achado I-5). Renomear, redefinir senha e desativar mexem em dados da pessoa (da organização),
  não da loja — por isso não conferem a loja da tela; a busca continua limitada aos usuários da
  loja ativa (RN-USERS-07).

## 7. Exceções
| Situação | Código | HTTP | Mensagem |
|---|---|---|---|
| Nome de usuário inválido | `INVALID_USERNAME` | 400 | Use de 3 a 50 letras minúsculas, números, ponto, hífen ou sublinhado. |
| Nome de usuário em uso | `USERNAME_TAKEN` | 409 | Este nome de usuário já está em uso. |
| Usuário não encontrado (ou de outra loja) | `USER_NOT_FOUND` | 404 | Usuário não encontrado. |
| Desativar a si mesmo | `CANNOT_DISABLE_SELF` | 422 | Você não pode desativar o seu próprio usuário. |
| Alterar os próprios perfis | `CANNOT_CHANGE_OWN_ROLES` | 422 | Você não pode alterar os seus próprios perfis. |

## 8. Permissões
| Ação | Permissão |
|---|---|
| Listar / ver | `users.read` |
| Criar | `users.create` (+ anti-escalada nos perfis) |
| Editar nome, perfis, redefinir senha | `users.update` (+ anti-escalada) |
| Desativar | `users.disable` |

## 9. Contratos
| Ação | Entrada | Saída | Auditoria |
|---|---|---|---|
| `users.list` | — | `UserSummary[]` (id, nome, usuário, status, perfis na loja) | — |
| `users.create` | `{ name, username, temporaryPassword, roleCodes[] }` (perfis na loja ativa) | `{ id }` | USER_CREATED, ROLE_CHANGED |
| `users.update` | `{ userId, name }` | ok | USER_UPDATED |
| `users.setRoles` | `{ userId, roleCodes[] }` (loja ativa) | ok | ROLE_CHANGED |
| `users.resetPassword` | `{ userId, temporaryPassword }` | ok | USER_UPDATED (sem a senha) |
| `users.disable` | `{ userId }` | ok | USER_DISABLED |

## 10. Critérios de aceite
- **CA-USERS-01** — Gerente cria garçom com senha provisória → `tests/features/users/cadastro.feature`
- **CA-USERS-02** — Nome de usuário repetido é recusado → `cadastro.feature`
- **CA-USERS-03** — Desativar encerra as sessões e impede login → `cadastro.feature`
- **CA-USERS-04** — Garçom não cria usuários → `cadastro.feature`
- **CA-USERS-05** — Gerente da loja A não vê usuários só da loja B → `cadastro.feature`
