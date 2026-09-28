// Permite rodar os scripts TypeScript com o Node 24 puro, sem ferramentas extras:
//   - "@/x"  → src/x   (mesmo atalho do tsconfig)
//   - imports sem extensão ("./money") → ./money.ts ou ./money/index.ts
// Uso: node --experimental-transform-types --import ./scripts/register-alias.mjs scripts/x.ts
import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url);
const CANDIDATES = ['', '.ts', '.tsx', '/index.ts'];

function findFile(baseUrl) {
  for (const suffix of CANDIDATES) {
    const url = new URL(baseUrl.href + suffix);
    const path = fileURLToPath(url);
    if (existsSync(path) && statSync(path).isFile()) return url.href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const found = findFile(new URL(specifier.slice(2), SRC));
      if (found) return { url: found, shortCircuit: true };
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        const found = findFile(new URL(specifier, context.parentURL));
        if (found) return { url: found, shortCircuit: true };
        throw error;
      }
    }
    return nextResolve(specifier, context);
  },
});
