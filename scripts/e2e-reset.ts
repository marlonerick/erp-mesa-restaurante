// Recria VAZIO o banco de E2E (erp_e2e) do MySQL de desenvolvimento (docker/compose.dev.yml).
// Os testes de navegador cadastram mesas e contas a cada execução; com o tempo o mapa do salão e a
// fila da cozinha ficam enormes e os testes ficam lentos. O Playwright aplica as migrations e o
// seed de novo na próxima execução. NUNCA aponta para outro banco: o nome é fixo.
import { spawnSync } from 'node:child_process';

const DATABASE = 'erp_e2e';
const sql = `DROP DATABASE IF EXISTS ${DATABASE}; CREATE DATABASE ${DATABASE};`;

// Sem shell na máquina: os argumentos vão direto para o docker. A senha de root (só de
// desenvolvimento) é lida DENTRO do container, da variável que o compose define.
const result = spawnSync(
  'docker',
  [
    'compose',
    '-f',
    'docker/compose.dev.yml',
    'exec',
    '-T',
    'mysql',
    'sh',
    '-c',
    `mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "${sql}"`,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error(
    'Não consegui recriar o banco de E2E. O MySQL de desenvolvimento está no ar (npm run db:up)?',
  );
  process.exit(result.status ?? 1);
}
console.log(
  `Banco ${DATABASE} recriado vazio. A próxima execução do E2E aplica migrations e seed.`,
);
