# Como rodar o projeto no seu computador

## Pré-requisitos

| Programa | Versão | Como conferir |
|---|---|---|
| Node.js | 24 | `node --version` |
| Docker Desktop | atual, **aberto** | `docker info` |
| Git | atual | `git --version` |

O npm já vem com o Node (decisão D-3).

## Primeira vez

```bash
npm install                 # instala as dependências e os hooks de Git (lefthook)
cp .env.example .env        # no PowerShell: Copy-Item .env.example .env
npm run db:up               # sobe o MySQL 8.4 no Docker (bancos erp_dev e erp_e2e)
npm run db:migrate          # cria as tabelas
npx playwright install chromium   # navegador para os testes de ponta a ponta
```

## Dia a dia

| Quero... | Comando |
|---|---|
| Abrir o sistema em modo desenvolvimento | `npm run dev` → http://localhost:3000 |
| Rodar todos os testes rápidos (unitários + banco real) | `npm test` |
| Só os testes unitários | `npm run test:unit` |
| Só os testes com MySQL real (sobe um container próprio) | `npm run test:integration` |
| Testes no navegador (celular, tablet, desktop) + BDD | `npm run test:e2e` |
| Cobertura de testes | `npm run test:coverage` |
| Verificar código | `npm run lint` e `npm run typecheck` |
| Formatar código | `npm run format` |
| Criar migration depois de mudar o schema | `npm run db:generate` (revisar o SQL gerado antes do commit) |
| Aplicar migrations | `npm run db:migrate` |
| Dados de exemplo | `npm run db:seed` (vazio até a Etapa 2) |
| Compilar e rodar como em produção | `npm run build` e depois `npm run start` |
| Desligar o MySQL | `npm run db:down` (os dados ficam no volume do Docker) |

## Verificações automáticas

- **Ao fazer commit:** lint e formatação dos arquivos alterados; mensagem no formato
  `tipo(semana-N): etapa N - o que foi feito` (ex.: `feat(semana-6): etapa 6 - permite transferir mesa`).
  Tipos: `feat` (funcionalidade), `fix` (correção), `test`, `docs`, `chore`, `ci`, `refactor`.
  Por enquanto, os commits vão direto na `main` (decisão D-9).
- **Ao fazer push:** typecheck e testes unitários.
- **No GitHub (CI):** a esteira completa — lint → typecheck → unitários → integração → E2E →
  vulnerabilidades → build.

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Could not find a working container runtime strategy` | Docker Desktop fechado | Abra o Docker Desktop e aguarde ficar pronto |
| `Variáveis de ambiente inválidas ou ausentes: DATABASE_URL` | Falta o `.env` | `cp .env.example .env` |
| `/ready` responde 503 | MySQL parado | `npm run db:up` |
| Porta 3306 ocupada | Outro MySQL instalado na máquina | Pare o outro MySQL ou mude a porta em `docker/compose.dev.yml` e no `.env` |
