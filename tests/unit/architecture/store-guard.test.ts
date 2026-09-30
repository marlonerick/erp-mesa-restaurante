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
  'src/modules/tables/interface/actions.ts': [
    'createTableAction',
    'updateTableAction',
    'releaseTableAction',
  ],
};

/** Comanda (Etapa 6): TODA ação passa por `run`, que confere a loja da tela antes de executar. */
const ORDERS_FILE = 'src/modules/orders/interface/actions.ts';
const ORDER_ACTIONS = [
  'openTableAction',
  'openCounterAction',
  'addItemAction',
  'removeItemAction',
  'sendRoundAction',
  'deliverItemAction',
  'cancelItemAction',
  'requestBillAction',
  'transferAction',
  'joinAction',
  'detachAction',
  'cancelOrderAction',
];

describe('formulários da loja ativa conferem a loja da tela (STORE_CHANGED)', () => {
  for (const [file, names] of Object.entries(GUARDED)) {
    it.each(names)(`${file}: %s chama requireSameStore`, (name) => {
      expect(actionBody(file, name)).toContain('requireSameStore(ctx, input.expectedStoreId)');
    });
  }
});

describe('comanda: todas as ações conferem a loja da tela (RN-ORD-23)', () => {
  const source = readFileSync(ORDERS_FILE, 'utf8');

  it('run confere a loja antes de executar a ação', () => {
    const run = source.slice(source.indexOf('async function run('), source.indexOf('const ids ='));
    expect(run).toContain('requireSameStore(context, expectedStoreId)');
    expect(run.indexOf('requireSameStore')).toBeLessThan(run.indexOf('await action('));
  });

  it('não há ação da comanda fora da lista', () => {
    const exported = [...source.matchAll(/export async function (\w+)\(/g)].map(
      (match) => match[1],
    );
    expect(exported.sort()).toEqual([...ORDER_ACTIONS].sort());
  });

  it.each(ORDER_ACTIONS)('%s passa por run', (name) => {
    expect(actionBody(ORDERS_FILE, name)).toMatch(/(await|return) run\(formData,/);
  });
});
