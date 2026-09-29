import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// As Server Actions dependem da sessão do Next e não rodam fora do servidor. Este teste confere o
// CÓDIGO: cada formulário de dados da loja ativa chama `requireSameStore` (recusa com
// STORE_CHANGED se a pessoa trocou de loja em outra aba — achado I-5 da Etapa 3, I-3 da Etapa 5).
// O comportamento de `requireSameStore` é testado em tests/unit/shared/kernel/same-store.test.ts.

function actionBody(file: string, name: string): string {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(`export async function ${name}(`);
  if (start < 0) throw new Error(`${name} não encontrada em ${file}`);
  const next = source.indexOf('export async function ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

const GUARDED: Readonly<Record<string, readonly string[]>> = {
  'src/modules/inventory/interface/actions.ts': [
    'createIngredientAction',
    'setMinimumAction',
    'entryAction',
    'exitAction',
    'lossAction',
    'countAction',
  ],
  'src/modules/catalog/interface/actions.ts': [
    'createCategoryAction',
    'createProductAction',
    'createModifierGroupAction',
    'createModifierAction',
    'setAvailabilityAction',
  ],
  'src/modules/organizations/interface/actions.ts': [
    'createTerminalAction',
    'updateTerminalAction',
    'setTerminalActiveAction',
    'bindTerminalAction',
    'unbindTerminalAction',
  ],
};

describe('formulários da loja ativa conferem a loja da tela (STORE_CHANGED)', () => {
  for (const [file, names] of Object.entries(GUARDED)) {
    it.each(names)(`${file}: %s chama requireSameStore`, (name) => {
      expect(actionBody(file, name)).toContain('requireSameStore(ctx, input.expectedStoreId)');
    });
  }
});
