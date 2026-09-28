# Organizations — Especificação (SDD) — parte mínima

> Status: Aprovado (parcial) — Etapas: 2 (base) e 3 (completo) — Decisão E2-1

## Etapa 2 (esta)
Só o necessário para os perfis valerem "por loja":
- Tabelas `organization`, `company`, `store` com nome, código e fuso da loja.
- Criadas pelo comando `npm run admin:create` (primeira instalação) e pelo seed de desenvolvimento.
- Consulta pública: `getStore(storeId)`, `listStoresOf(organizationId)`.

## Etapa 3 (próxima)
Cadastro completo (telas), terminais, estação de cozinha, configurações da loja (horário de corte,
taxa de serviço, política de estoque negativo), troca de loja em 1 clique.
