// Completa o build "standalone" do Next (ADR-0011): o server.js gerado não inclui os arquivos
// estáticos, que precisam ser copiados para dentro de .next/standalone.
import { cpSync, existsSync } from 'node:fs';

const target = '.next/standalone';
if (!existsSync(target)) {
  console.error('Build standalone não encontrado. Rode "npm run build" primeiro.');
  process.exit(1);
}

cpSync('.next/static', `${target}/.next/static`, { recursive: true });
if (existsSync('public')) {
  cpSync('public', `${target}/public`, { recursive: true });
}
console.info('Build standalone pronto em .next/standalone');
