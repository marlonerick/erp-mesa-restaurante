# <Módulo> — Especificação (SDD)

> Status: Rascunho | Em revisão | Aprovado — Etapa: XX — Responsável: domain-spec

## 1. Objetivo
O que o módulo resolve para o restaurante, em 2–3 frases.

## 2. Atores
Perfis (ADMIN, GERENTE, CAIXA, GARCOM, COZINHA) e sistemas que interagem.

## 3. Regras de negócio
- **RN-<MOD>-01** — ...
- **RN-<MOD>-02** — ...

## 4. Entidades
Tabela: entidade, atributos relevantes, invariantes. Link para o ERD.

## 5. Estados e transições
Diagrama Mermaid `stateDiagram-v2` + tabela: de → para, comando, permissão, condição, evento de auditoria.

## 6. Fluxos
Fluxo principal e alternativos (Mermaid `sequenceDiagram` quando houver mais de 2 atores).

## 7. Exceções
| Situação | Código de erro | Mensagem | Comportamento |
|---|---|---|---|

## 8. Permissões
| Ação | Permissão | Autorização elevada? |
|---|---|---|

## 9. Contratos
Um bloco por Server Action / Route Handler conforme o template de docs/api/convencoes.md.

## 10. Critérios de aceite
- **CA-<MOD>-01** — ... → cenário `tests/features/<modulo>/<arquivo>.feature:<Cenário>`

## 11. Dependências
Módulos e casos de uso públicos consumidos; eventos publicados/assinados.

## 12. Testes previstos
Unit (domínio), integração (MySQL), BDD, E2E, isolamento entre lojas, performance.

## 13. Fora do escopo
O que explicitamente não entra nesta versão.
