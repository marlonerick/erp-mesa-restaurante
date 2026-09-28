# ADR-0014 — Portas públicas dos módulos, injeção entre módulos e tabelas centralizadas

- Status: **Aceito** em 2026-09-28 (surgiu na implementação da Etapa 2; registrado para revisão do usuário)
- Data: 2026-09-28
- Responsável: architect

## Contexto
Na Etapa 2 apareceram três necessidades não previstas em detalhe no ADR-0009 e na visão geral:
1. Telas e Server Actions de um módulo precisam de funções web de outro (ex.: `requireSession`
   do Auth), mas essas funções dependem do Next.js — não podem estar na API principal, que também
   é usada por scripts de terminal e testes.
2. Users precisa encerrar sessões (Auth) e Auth precisa ler credenciais (Users): dependência
   circular.
3. Tabelas de módulos diferentes têm chaves estrangeiras entre si (sessão → usuário → organização);
   o drizzle-kit precisa enxergar todas juntas.

## Decisão
1. **Duas portas públicas por módulo:** `@/modules/<m>` (núcleo, sem Next) e
   `@/modules/<m>/web` (adaptadores Next: cookies, cabeçalhos, redirecionamento). O ESLint permite
   importar só essas duas; teste de arquitetura cobre o caso.
2. **Direção única de dependência:** `auth → users → authorization → organizations`, e todos → `audit`.
   Quando a direção precisa ser "invertida", a função é **injetada** por quem monta o serviço
   (ex.: `userAdministration({ revokeUserSessions })`, montado em `users/interface/service.ts`).
3. **Definições de tabela em `src/shared/db/tables/<modulo>.ts`**, agregadas em `schema.ts`.
   A posse continua por módulo: cada módulo lê e grava apenas as SUAS tabelas, pelos próprios
   repositórios (revisão do `reviewer` confere).
4. **Casos de uso com portas:** `application/ports.ts` define o que o caso de uso precisa;
   `infrastructure/` implementa; o `index.ts` liga os dois.

## Consequências
- (+) Scripts (`admin:create`, seed, limpeza) e testes usam os módulos sem carregar Next.
- (+) Sem ciclos de importação; fronteiras verificadas no lint.
- (−) Um arquivo a mais por módulo (`web.ts`) e injeção explícita em alguns serviços.
- (−) As tabelas ficam fora da pasta do módulo; a posse depende de convenção + revisão.
