# Organizations — Especificação (SDD)

> Status: Aprovado — Etapas: 2 (base, E2-1) e 3 (completo) — Responsável: domain-spec
> Decisões: Q-05, E3-1 a E3-5 (docs/requirements/perguntas-abertas.md), ADR-0007, ADR-0009, ADR-0013

## 1. Objetivo
Representar a estrutura do negócio — **organização → empresas → lojas → terminais** — e as
configurações de cada loja das quais as próximas etapas dependem (dia operacional, taxa de serviço,
estoque negativo, caixas abertos). Permitir que quem trabalha em mais de uma loja troque de loja
com 1 clique.

## 2. Glossário
| Termo | Significado |
|---|---|
| Organização | O dono do sistema (o grupo). Tudo pertence a uma organização. |
| Empresa | CNPJ (razão social, nome fantasia). Uma organização pode ter várias. |
| Loja | Um ponto de venda físico. Perfis, mesas, estoque e caixa são **por loja**. |
| Terminal | Um aparelho registrado na loja: `CAIXA` (computador/tablet do caixa), `KDS` (tela da cozinha) ou `MOVEL` (celular/tablet do salão). |
| Loja ativa | A loja em que a sessão está trabalhando agora (fica na sessão, nunca vem do formulário). |
| Dia operacional | O "dia de trabalho": vendas depois da meia-noite e antes da virada contam no dia anterior. |
| Virada do dia | Horário local em que começa um novo dia operacional (padrão 05:00). |

## 3. Regras de negócio

### Empresa
- **RN-ORG-01** — Toda leitura e alteração é limitada à organização da sessão (ADR-0009).
- **RN-ORG-02** — Empresa: razão social (2–150 caracteres) e nome fantasia (2–120). **CNPJ opcional**
  (E3-3); quando informado, aceita com ou sem pontuação, grava só os 14 dígitos, confere os dígitos
  verificadores e é único no sistema.

### Loja
- **RN-ORG-03** — Loja: nome (2–120) e código (2–20 caracteres: letras maiúsculas, números e hífen;
  único por empresa; digitado em minúsculas vira maiúsculas). Nasce **ativa** e com a estação de
  cozinha padrão "Cozinha" (RN-ORG-10).
- **RN-ORG-04** — Configurações da loja (E3-2, Q-05):

  | Configuração | Regra | Padrão |
  |---|---|---|
  | Fuso horário | Um dos fusos do Brasil (lista fechada, nomes IANA) | `America/Sao_Paulo` |
  | Virada do dia | `HH:MM` entre 00:00 e 23:59 | 05:00 |
  | Taxa de serviço | 0% a 100%, até 2 casas decimais (guardada em pontos-base: 10% = 1000) | 10% |
  | Estoque negativo | `PERMITIR_COM_ALERTA` ou `BLOQUEAR` (ADR-0007) | `PERMITIR_COM_ALERTA` |
  | Caixas abertos ao mesmo tempo | 1 a 20 (usado na Etapa 8) | 1 |

- **RN-ORG-05** — Alterar loja ou empresa usa bloqueio otimista (`version`, ADR-0008): se outra
  pessoa salvou antes, a alteração é recusada com `CONCURRENT_MODIFICATION` e a tela pede para
  recarregar. Salvar sem mudança nenhuma não grava nem audita.
- **RN-ORG-06** — Loja é **desativada**, nunca apagada. Não é permitido desativar:
  (a) a loja ativa da própria sessão (troque de loja antes); (b) a última loja ativa da organização.
- **RN-ORG-07** — Loja desativada some do seletor de lojas e não aceita login. Quem estava nela é
  levado, na próxima requisição, para outra loja ativa em que tenha perfil (a primeira em ordem
  alfabética), com auditoria `STORE_SWITCHED` (motivo `LOJA_INDISPONIVEL`); o mesmo vale para quem
  perdeu o perfil na loja ativa. Sem nenhuma loja, a sessão é **encerrada no banco** (motivo
  `SEM_LOJA`) — reativar a loja depois não reabre um cookie antigo. Reativar devolve a loja ao
  funcionamento.

### Terminal
- **RN-ORG-08** — Terminal: código (1–20: letras maiúsculas, números e hífen; único na loja), nome
  (2–60) e tipo (`CAIXA`, `KDS`, `MOVEL`). Terminal é desativado, nunca apagado; desativar desfaz o
  vínculo com o aparelho.
- **RN-ORG-09** — **Vincular aparelho**: "usar este aparelho como o terminal X" vincula o aparelho
  **da sessão atual** (cookie de aparelho, RN-AUTH-13) — nunca um aparelho informado no formulário.
  Em cada organização, um aparelho é no máximo um terminal: vincular a outro terminal desfaz o
  vínculo anterior (mesmo de outra loja da organização). Terminais de **outra organização** nunca
  são tocados — um tablet reaproveitado por outro restaurante não derruba o caixa do primeiro.
  Vincular e desvincular conferem a versão que a tela mostrou (bloqueio otimista) e travam o
  terminal: ações simultâneas no mesmo terminal fazem uma delas receber "outra pessoa alterou".
  Desvincular é permitido a qualquer momento.
- **RN-ORG-10** — Cada loja tem uma estação de cozinha padrão ("Cozinha"). Cadastro de outras
  estações fica para depois do MVP (P1); o KDS (Etapa 7) usa a estação padrão.
- **RN-ORG-11** — **Terminal da sessão**: calculado a cada requisição a partir do aparelho da sessão
  e da loja ativa. Terminal inativo ou de outra loja → a sessão fica sem terminal.

### Troca de loja e dia operacional
- **RN-ORG-12** — **Troca de loja** (módulo Auth): só para loja **ativa** da organização em que a
  pessoa tem algum perfil. A sessão continua a mesma (mesmo aparelho, mesmos prazos); as permissões
  passam a ser as da nova loja (RN-AUTHZ-02). Auditoria `STORE_SWITCHED` (de → para). Eventos de loja registram a loja **afetada** (não a da
  sessão), para a auditoria da loja mostrar o que mudou nela.
- **RN-ORG-13** — **Dia operacional** de um instante = data local de *(instante no fuso da loja −
  virada)* (ADR-0013). Ex.: virada 05:00 → 01:30 de 15/03 pertence a 14/03; 05:00 de 15/03 já é 15/03.

## 4. Permissões (E3-1, E3-2)

| Ação | Permissão | Escopo exigido |
|---|---|---|
| Ver/editar empresa, cadastrar empresa | `stores.manage` | Perfil na **organização** (ou na própria empresa, para editá-la) |
| Cadastrar loja numa empresa | `stores.manage` | Perfil na organização ou na empresa |
| Listar lojas administráveis | `stores.manage` | Lojas em que a permissão vale |
| Editar dados, configurações, desativar/reativar loja | `stores.manage` | Valer **na loja alterada** (inclusive desativada) |
| Cadastrar, editar, desativar terminal; vincular aparelho | `terminals.manage` (nova — ADMIN e GERENTE) | Loja ativa |
| Trocar de loja | — (qualquer usuário) | Ter perfil na loja de destino |

Perfis: `stores.manage` só ADMIN (inalterado); `terminals.manage` ADMIN e GERENTE (migration 0003).

## 5. Exceções
| Situação | Código | HTTP | Mensagem |
|---|---|---|---|
| Nome inválido | `INVALID_NAME` | 400 | Informe um nome entre N e M caracteres. |
| CNPJ inválido | `INVALID_CNPJ` | 400 | CNPJ inválido. Confira os 14 dígitos. |
| CNPJ já cadastrado | `CNPJ_TAKEN` | 409 | Este CNPJ já está cadastrado. |
| Código de loja inválido | `INVALID_STORE_CODE` | 400 | Use de 2 a 20 letras, números ou hífen. Ex.: CENTRO |
| Código de loja em uso | `STORE_CODE_TAKEN` | 409 | Já existe uma loja com este código nesta empresa. |
| Fuso fora da lista | `INVALID_TIMEZONE` | 400 | Escolha um fuso horário da lista. |
| Virada inválida | `INVALID_CUTOFF` | 400 | Informe a virada do dia no formato HH:MM (00:00 a 23:59). |
| Taxa inválida | `INVALID_SERVICE_FEE` | 400 | A taxa de serviço deve ficar entre 0% e 100%, com até 2 casas decimais. |
| Caixas abertos inválido | `INVALID_MAX_OPEN_CASH` | 400 | Informe de 1 a 20 caixas abertos ao mesmo tempo. |
| Empresa/loja/terminal inexistente ou de outra organização | `COMPANY_NOT_FOUND` / `STORE_NOT_FOUND` / `TERMINAL_NOT_FOUND` | 404 | … não encontrada(o). |
| Desativar a loja em uso | `CANNOT_DISABLE_ACTIVE_STORE` | 422 | Troque para outra loja antes de desativar esta. |
| Desativar a última loja | `LAST_ACTIVE_STORE` | 422 | A organização precisa de pelo menos uma loja ativa. |
| Código de terminal inválido / em uso | `INVALID_TERMINAL_CODE` / `TERMINAL_CODE_TAKEN` | 400 / 409 | … |
| Sessão sem aparelho identificado | `DEVICE_REQUIRED` | 422 | Não foi possível identificar este aparelho. Saia e entre de novo. |
| Terminal desativado | `TERMINAL_INACTIVE` | 422 | Este terminal está desativado. |
| Outra pessoa alterou antes | `CONCURRENT_MODIFICATION` | 409 | Outra pessoa alterou estes dados. Recarregue a página e tente de novo. |
| A sessão trocou de loja em outra aba (formulários de dados da loja ativa: terminais, perfis de usuário) | `STORE_CHANGED` | 409 | A loja mudou em outra aba. Recarregue a página e confira antes de salvar. |
| Loja de destino sem acesso/inativa | `STORE_NOT_FOUND` | 404 | Loja não encontrada. (não revela se existe) |

## 6. Contratos (casos de uso)
| Ação | Entrada | Saída | Auditoria |
|---|---|---|---|
| `companies.list` / `get` | — / `companyId` | empresas administráveis | — |
| `companies.create` | `{ legalName, tradeName, cnpj? }` | `{ id }` | `COMPANY_CREATED` |
| `companies.update` | `{ companyId, version, legalName, tradeName, cnpj? }` | ok | `COMPANY_UPDATED` (antes/depois) |
| `stores.list` | — | lojas administráveis (ativas e inativas) | — |
| `stores.create` | `{ companyId, name, code, ...configurações }` | `{ id }` | `STORE_CREATED` |
| `stores.update` | `{ storeId, version, name, code, ...configurações }` | ok | `STORE_UPDATED` (só campos alterados) |
| `stores.setStatus` | `{ storeId, version, status }` | ok | `STORE_DISABLED` / `STORE_ENABLED` |
| `terminals.list` | — (loja ativa) | terminais + "é este aparelho?" | — |
| `terminals.create` | `{ code, name, kind }` | `{ id }` | `TERMINAL_CREATED` |
| `terminals.update` | `{ terminalId, version, code, name, kind }` | ok | `TERMINAL_UPDATED` |
| `terminals.setStatus` | `{ terminalId, version, active }` | ok | `TERMINAL_DISABLED` / `TERMINAL_ENABLED` |
| `terminals.bindThisDevice` | `{ terminalId, version }` | ok | `TERMINAL_BOUND` (desfaz o anterior da mesma organização) |
| `terminals.unbind` | `{ terminalId, version }` | ok | `TERMINAL_UNBOUND` |
| `auth.switchStore` | `{ storeId }` | ok | `STORE_SWITCHED` |
| Consulta pública | `getStoreSettings(storeId)`, `findTerminalOfDevice(storeId, deviceId)`, `operationalDate(instante, fuso, virada)` | — | — |

## 7. Modelo de dados (migration 0003)
- `store` + `operational_day_cutoff TIME`, `service_fee_bp INT` (CK 0–10000),
  `negative_stock_policy ENUM`, `max_open_cash_sessions SMALLINT` (CK 1–20).
- `terminal` (id, organization_id, store_id, code, name, kind, device_id NULL → `known_device` com
  ON DELETE SET NULL, active, version, timestamps) — UQ (store_id, code); UQ (organization_id,
  device_id) — migration 0004, achado B-1 da revisão.
- `kitchen_station` (id, store_id, name, is_default, default_store_id calculada, timestamps) —
  UQ (store_id, name); UQ default_store_id (uma estação padrão por loja).
- FK `idempotency_record.store_id → store` (D-4).
- `store_sequence` fica para a Etapa 6 (E3-5).

## 8. Critérios de aceite
- **CA-ORG-01** — Admin cadastra loja com configurações padrão e estação "Cozinha" → `tests/features/organizations/lojas.feature`
- **CA-ORG-02** — Código de loja repetido na empresa é recusado → `lojas.feature`
- **CA-ORG-03** — Gerente não altera configurações da loja → `lojas.feature`
- **CA-ORG-04** — Alteração simultânea: a segunda é recusada → `lojas.feature`
- **CA-ORG-05** — Não desativa a loja em uso nem a última loja → `lojas.feature`
- **CA-ORG-06** — CNPJ com dígito errado é recusado → `empresa.feature`
- **CA-ORG-07** — Gerente registra este aparelho como terminal e a sessão passa a conhecê-lo → `terminais.feature`
- **CA-ORG-08** — Um aparelho é um terminal só → `terminais.feature`
- **CA-ORG-09** — Troca de loja em 1 clique muda as permissões → `troca-de-loja.feature`
- **CA-ORG-10** — Não troca para loja sem perfil → `troca-de-loja.feature`
- **CA-ORG-11** — Loja desativada leva a sessão para outra loja → `troca-de-loja.feature`
- **CA-ORG-12** — Dia operacional (23:59, 00:00, 04:59, 05:00, virada do ano, outro fuso) → `tests/features/organizations/dia-operacional.feature`

## 9. Fora do escopo desta etapa
Horário de funcionamento (abre/fecha — Q-05, futuro), cadastro de estações de cozinha (P1),
numeração de contas (`store_sequence`, Etapa 6), uso real da taxa de serviço (Etapa 8), da política
de estoque (Etapa 5) e do limite de caixas (Etapa 8).
