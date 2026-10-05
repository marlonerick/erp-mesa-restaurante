import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { financeEntry } from '@/shared/db/schema';
import { newId } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  uniqueUsername,
} from '../../../support/identity';
import { reportsWorld } from '../reports/reports-world';

// Regras de borda do financeiro: isolamento (RN-FIN-08), idempotência, categoria do sistema,
// concorrência e permissões (E9-3).

const { db } = useTestDatabase();
const w = reportsWorld(db);

async function failure(work: Promise<unknown>) {
  try {
    await work;
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'SEM_CODIGO';
  }
}

const gas = {
  type: 'DESPESA' as const,
  description: 'Gás',
  amount: '180,00',
  category: 'Contas de consumo',
  status: 'PREVISTO' as const,
  date: '2026-03-20',
};

beforeEach(async () => {
  await w.first('carla', 'GERENTE');
  await w.withTerminal('bia', 'CAIXA', 'CX01');
});

describe('isolamento entre lojas (RN-FIN-08)', () => {
  it('o gerente da Praia não vê nem altera lançamentos do Centro; as categorias são da empresa', async () => {
    await w.personAt('paulo', 'GERENTE', 'Praia');
    await w.entry('carla', gas);
    const [entry] = (await w.services.finance.entries(w.ctx('carla'), w.MONTH)).rows;
    if (!entry) throw new Error('lançamento não criado');

    expect((await w.services.finance.entries(w.ctx('paulo'), w.MONTH)).total).toBe(0);
    expect((await w.services.finance.cashFlow(w.ctx('paulo'), w.MONTH)).upcoming).toEqual([]);
    expect(
      await failure(
        w.services.finance.payEntry(w.ctx('paulo'), {
          entryId: entry.id,
          version: entry.version,
          paidDate: '2026-03-14',
        }),
      ),
    ).toBe('FINANCE_ENTRY_NOT_FOUND');
    expect(
      await failure(
        w.services.finance.cancelEntry(w.ctx('paulo'), {
          entryId: entry.id,
          version: entry.version,
          reason: 'não é meu',
        }),
      ),
    ).toBe('FINANCE_ENTRY_NOT_FOUND');
    // Mesmas categorias (plano de contas da empresa), sem duplicar as iniciais
    const centro = await w.services.finance.categories(w.ctx('carla'));
    const praia = await w.services.finance.categories(w.ctx('paulo'));
    expect(praia.map((category) => category.id).sort()).toEqual(
      centro.map((category) => category.id).sort(),
    );
    expect(centro).toHaveLength(9);
  });
});

describe('isolamento entre empresas (RN-FIN-01, RN-FIN-08)', () => {
  it('o gerente de OUTRA empresa não vê categorias nem lançamentos desta', async () => {
    await w.entry('carla', gas);
    const other = await createTestOrganization(db);
    const username = uniqueUsername('outro');
    await createTestUser(db, {
      organizationId: other.organizationId,
      username,
      password: 'Senha@2026',
      storeRoles: [{ role: 'GERENTE', storeId: other.centro }],
    });
    const { ctx } = await loginAs(w.services, username, 'Senha@2026');

    const mine = await w.services.finance.categories(w.ctx('carla'));
    const theirs = await w.services.finance.categories(ctx);
    // Cada empresa tem as próprias categorias iniciais (mesmos nomes, ids diferentes)
    expect(theirs).toHaveLength(9);
    expect(theirs.some((category) => mine.some((item) => item.id === category.id))).toBe(false);
    expect((await w.services.finance.entries(ctx, w.MONTH)).total).toBe(0);
    // Categoria da outra empresa não serve para lançar
    expect(
      await failure(
        w.services.finance.createEntry(ctx, {
          type: 'DESPESA',
          categoryId: await w.categoryId('Aluguel', 'DESPESA'),
          description: 'Aluguel de outra empresa',
          amountCents: 1000,
          competenceDate: '2026-03-14',
          status: 'PREVISTO',
          date: '2026-03-20',
          idempotencyKey: newId(),
        }),
      ),
    ).toBe('FINANCE_CATEGORY_INVALID');
  });
});

describe('lançamentos', () => {
  it('pagar de novo (reenvio) o que já está pago não dá erro nem muda nada (S-1)', async () => {
    await w.entry('carla', gas);
    const [entry] = (await w.services.finance.entries(w.ctx('carla'), w.MONTH)).rows;
    if (!entry) throw new Error('lançamento não criado');
    const input = { entryId: entry.id, version: entry.version, paidDate: '2026-03-14' };
    await w.services.finance.payEntry(w.ctx('carla'), input);
    await w.services.finance.payEntry(w.ctx('carla'), { ...input, paidDate: '2026-03-13' });
    const [paid] = (await w.services.finance.entries(w.ctx('carla'), w.MONTH)).rows;
    expect(paid).toMatchObject({ status: 'PAGO', paidDate: '2026-03-14' });
  });

  it('data de pagamento no futuro é recusada; vencimento no futuro pode (S-1)', async () => {
    expect(await failure(w.entry('carla', { ...gas, status: 'PAGO', date: '2026-03-15' }))).toBe(
      'INVALID_FINANCE_DATE',
    );
    await w.entry('carla', gas);
    const [entry] = (await w.services.finance.entries(w.ctx('carla'), w.MONTH)).rows;
    if (!entry) throw new Error('lançamento não criado');
    expect(
      await failure(
        w.services.finance.payEntry(w.ctx('carla'), {
          entryId: entry.id,
          version: entry.version,
          paidDate: '2026-03-15',
        }),
      ),
    ).toBe('INVALID_FINANCE_DATE');
  });

  it('reenviar o mesmo formulário (mesma chave) cria um lançamento só', async () => {
    const input = {
      type: 'DESPESA' as const,
      categoryId: await w.categoryId('Aluguel', 'DESPESA'),
      description: 'Aluguel de março',
      amountCents: 450_000,
      competenceDate: '2026-03-01',
      status: 'PREVISTO' as const,
      date: '2026-03-10',
      idempotencyKey: newId(),
    };
    const [first, second] = await Promise.all([
      w.services.finance.createEntry(w.ctx('carla'), input),
      w.services.finance.createEntry(w.ctx('carla'), input),
    ]);
    expect(second.id).toBe(first.id);
    expect((await w.services.finance.entries(w.ctx('carla'), w.MONTH)).total).toBe(1);
  });

  it('a categoria Vendas não aceita lançamento manual nem pode ser desativada', async () => {
    const sales = (await w.services.finance.categories(w.ctx('carla'))).find(
      (category) => category.systemCode === 'VENDAS',
    );
    if (!sales) throw new Error('sem a categoria Vendas');
    expect(
      await failure(
        w.services.finance.createEntry(w.ctx('carla'), {
          type: 'RECEITA',
          categoryId: sales.id,
          description: 'Venda avulsa',
          amountCents: 1000,
          competenceDate: '2026-03-14',
          status: 'PAGO',
          date: '2026-03-14',
          idempotencyKey: newId(),
        }),
      ),
    ).toBe('FINANCE_CATEGORY_INVALID');
    expect(
      await failure(
        w.services.finance.setCategoryActive(w.ctx('carla'), {
          categoryId: sales.id,
          version: sales.version,
          active: false,
        }),
      ),
    ).toBe('FINANCE_CATEGORY_SYSTEM');
  });

  it('categoria desativada ou de outro tipo não é aceita', async () => {
    const rent = (await w.services.finance.categories(w.ctx('carla'))).find(
      (category) => category.name === 'Aluguel',
    );
    if (!rent) throw new Error('sem a categoria Aluguel');
    await w.services.finance.setCategoryActive(w.ctx('carla'), {
      categoryId: rent.id,
      version: rent.version,
      active: false,
    });
    expect(await failure(w.entry('carla', { ...gas, category: 'Aluguel' }))).toBe(
      'FINANCE_CATEGORY_INVALID',
    );
    expect(
      await failure(
        w.services.finance.createEntry(w.ctx('carla'), {
          type: 'RECEITA',
          categoryId: await w.categoryId('Contas de consumo', 'DESPESA'),
          description: 'Receita na categoria de despesa',
          amountCents: 1000,
          competenceDate: '2026-03-14',
          status: 'PAGO',
          date: '2026-03-14',
          idempotencyKey: newId(),
        }),
      ),
    ).toBe('FINANCE_CATEGORY_INVALID');
  });

  it('pagar com a versão antiga avisa que outra pessoa alterou', async () => {
    await w.entry('carla', gas);
    const [entry] = (await w.services.finance.entries(w.ctx('carla'), w.MONTH)).rows;
    if (!entry) throw new Error('lançamento não criado');
    await w.payEntry('carla', 'Gás', '2026-03-14');
    expect(
      await failure(
        w.services.finance.cancelEntry(w.ctx('carla'), {
          entryId: entry.id,
          version: entry.version,
          reason: 'versão antiga',
        }),
      ),
    ).toBe('CONCURRENT_MODIFICATION');
  });

  it('lançamento cancelado não é pago nem cancelado de novo', async () => {
    await w.entry('carla', gas);
    await w.cancelEntry('carla', 'Gás', 'lançado errado');
    expect(await failure(w.payEntry('carla', 'Gás', '2026-03-14'))).toBe('FINANCE_ENTRY_CANCELLED');
  });

  it('período do fluxo de até 366 dias', async () => {
    expect(
      await failure(
        w.services.finance.cashFlow(w.ctx('carla'), { from: '2025-01-01', to: '2026-03-14' }),
      ),
    ).toBe('INVALID_PERIOD');
  });
});

describe('receitas do fechamento do caixa (RN-FIN-03)', () => {
  it('forma de pagamento com venda estornada por inteiro não gera receita', async () => {
    await w.openCash('bia', '0,00');
    await w.counterWith('bia', 'Rafa', '50,00');
    await w.pay('bia', { counter: 'Rafa' }, 'PIX', '20,00');
    // O gerente estorna o PIX; o cliente paga tudo em dinheiro
    const orderId = await w.orderId({ counter: 'Rafa' });
    const [pix] = (await w.services.pos.bill(w.ctx('carla'), orderId)).payments;
    await w.services.pos.cancelPayment(w.ctx('carla'), {
      orderId,
      paymentId: pix?.id ?? newId(),
      reason: 'PIX não caiu',
      grantToken: null,
      idempotencyKey: newId(),
    });
    await w.pay('bia', { counter: 'Rafa' }, 'DINHEIRO', '50,00');
    await w.closeCash('bia', { DINHEIRO: '50,00' });
    const rows = await db
      .select({ method: financeEntry.paymentMethod, amount: financeEntry.amountCents })
      .from(financeEntry)
      .where(
        and(
          eq(financeEntry.storeId, w.org.centro),
          eq(financeEntry.cashSessionId, w.lastSessionId),
        ),
      );
    expect(rows).toEqual([{ method: 'DINHEIRO', amount: 5000 }]);
  });

  it('caixa sem vendas fecha sem receita', async () => {
    await w.openCash('bia', '100,00');
    await w.closeCash('bia', { DINHEIRO: '100,00' });
    expect(await w.salesEntries()).toEqual([]);
  });
});

describe('permissões (E9-3)', () => {
  it('caixa e garçom não leem nem lançam; o administrador sim', async () => {
    await w.person('joão', 'GARCOM');
    for (const name of ['bia', 'joão']) {
      expect(await failure(w.services.finance.cashFlow(w.ctx(name), w.MONTH))).toBe('FORBIDDEN');
      expect(await failure(w.entry(name, gas))).toBe('FORBIDDEN');
    }
    await w.entry('sistema', gas);
    expect((await w.services.finance.entries(w.ctx('sistema'), w.MONTH)).total).toBe(1);
  });
});
