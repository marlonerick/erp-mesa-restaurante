// Primeira instalação: cria organização, empresa, loja e o ADMINISTRADOR (decisão E2-5).
// Uso: npm run admin:create
// Automação (deploy): defina ADMIN_ORGANIZATION, ADMIN_STORE, ADMIN_NAME, ADMIN_USERNAME,
// ADMIN_PASSWORD e rode com --yes.
import { bootstrapFirstAdmin } from '@/modules/users';
import { getDatabase } from '@/shared/db/client';
import { isDomainError } from '@/shared/kernel';
import { ask, askHidden } from './lib/prompt.ts';

const env = process.env;
const automatic = process.argv.includes('--yes');
const value = (name: string, question: string, fallback?: string) =>
  automatic ? Promise.resolve(env[name] ?? fallback ?? '') : ask(question, env[name] ?? fallback);

console.info('\n== ERP Restaurante — primeira instalação ==\n');

const organizationName = await value('ADMIN_ORGANIZATION', 'Nome do restaurante (organização)');
const companyLegalName = await value('ADMIN_COMPANY', 'Razão social', organizationName);
const cnpj = (await value('ADMIN_CNPJ', 'CNPJ (só números, opcional)', '')).replace(/\D/g, '');
const storeName = await value('ADMIN_STORE', 'Nome da loja', 'Loja principal');
const storeCode = await value('ADMIN_STORE_CODE', 'Código da loja', 'LOJA01');
const adminName = await value('ADMIN_NAME', 'Seu nome');
const adminUsername = await value('ADMIN_USERNAME', 'Usuário de acesso', 'admin');

let adminPassword = env.ADMIN_PASSWORD ?? '';
if (!automatic) {
  adminPassword = await askHidden('Senha (mínimo 8 caracteres)');
  if ((await askHidden('Repita a senha')) !== adminPassword) {
    console.error('As senhas não conferem. Nada foi criado.');
    process.exit(1);
  }
}

const { close } = getDatabase();
try {
  const result = await bootstrapFirstAdmin({
    organizationName,
    companyLegalName,
    companyTradeName: organizationName,
    cnpj: cnpj.length === 14 ? cnpj : null,
    storeName,
    storeCode: storeCode.toUpperCase(),
    adminName,
    adminUsername,
    adminPassword,
  });
  console.info(`\nPronto! Entre no sistema com o usuário "${adminUsername.toLowerCase()}".`);
  console.info(`Organização: ${result.organizationId}\nLoja: ${result.storeId}`);
} catch (error) {
  console.error(isDomainError(error) ? `\n${error.message}` : error);
  process.exitCode = 1;
} finally {
  await close();
}
