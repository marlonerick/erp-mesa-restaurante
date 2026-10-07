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
npm run db:seed             # equipe FICTÍCIA do piloto (tabela abaixo)
npx playwright install chromium   # navegador para os testes de ponta a ponta
```

### Usuários de exemplo (só desenvolvimento)

| Usuário | Senha | PIN | Perfil |
|---|---|---|---|
| admin | Admin@2026 | — | Administrador (toda a organização) |
| gerente | Gerente@2026 | 739104 | Gerente — loja Centro |
| caixa | Caixa@2026 | 551208 | Caixa — loja Centro |
| joao | Garcom@2026 | 305917 | Garçom — loja Centro |
| ana | Garcom@2026 | 482915 | Garçom — loja Centro |
| cozinha | Cozinha@2026 | 624081 | Cozinha — loja Centro |
| rui | Garcom@2026 | 270593 | Garçom — loja Praia (para ver o isolamento) |

Para testar a troca rápida: entre com `joao` e com `ana` marcando "Este aparelho é compartilhado",
depois toque em "Trocar usuário".

## Primeira instalação em um servidor novo

```bash
npm run db:migrate
npm run admin:create        # pergunta nome do restaurante, loja e cria o ADMINISTRADOR
```

O comando só funciona com o banco sem usuários. Depois disso, a equipe é cadastrada pela tela
**Usuários**.

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
| Dados de exemplo | `npm run db:seed` (só com o banco vazio) |
| Limpeza LGPD (sessões antigas, contadores) | `npm run maintenance:purge` |
| Compilar e rodar como em produção | `npm run build` e depois `npm run start` |
| Desligar o MySQL | `npm run db:down` (os dados ficam no volume do Docker) |

### Testar de outro aparelho na mesma rede (celular, tablet, outro PC)

1. Descubra o IP do computador: `ipconfig` → "Endereço IPv4" (ex.: `192.168.1.18`).
2. No `.env`: `DEV_ALLOWED_ORIGINS=192.168.1.18` (vários: separe por vírgula).
3. Pare e rode de novo: `npm run dev -- -H 0.0.0.0`.
4. No outro aparelho: `http://192.168.1.18:3000`. Se não abrir, libere a porta 3000 no Firewall
   do Windows (rede privada).

Sem o passo 2 a tela aparece, mas nenhum botão funciona (o Next bloqueia os scripts para outros
endereços no modo desenvolvimento).

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
| `Unknown column '…'` no log | Banco sem as migrations mais novas | `npm run db:migrate` |
| Outro aparelho abre a tela, mas os botões não respondem | IP não liberado no modo desenvolvimento | `DEV_ALLOWED_ORIGINS` (seção acima) |
| Porta 3306 ocupada | Outro MySQL instalado na máquina | Pare o outro MySQL ou mude a porta em `docker/compose.dev.yml` e no `.env` |
