import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { TODAY } from '../inventory/stock-world';
import { reportsWorld } from './reports-world';

// Regras de borda dos relatórios: isolamento (ADR-0009), fechamento cego (RN-CASH-06),
// auditoria (RN-REP-08), períodos e permissões (E9-4).

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

beforeEach(async () => {
  await w.first('carla', 'GERENTE');
  await w.withTerminal('bia', 'CAIXA', 'CX01');
  await w.person('joão', 'GARCOM');
  await w.sells('X-Burger', '32,00');
  await w.createTable('10');
  await w.openCash('bia', '0,00');
});

/** Mesa 10 com 1 X-Burger, paga no PIX (R$ 35,20). */
async function oneSale() {
  await w.sendTo('joão', '10', [{ quantity: 1, product: 'X-Burger' }]);
  await w.payAll('bia', { table: '10' }, 'PIX');
}

describe('isolamento entre lojas (ADR-0009)', () => {
  it('o gerente da Praia não vê vendas, caixas nem auditoria do Centro', async () => {
    await oneSale();
    await w.personAt('paulo', 'GERENTE', 'Praia');
    const praia = w.ctx('paulo');

    expect((await w.services.reports.dashboard(praia)).salesCents).toBe(0);
    expect((await w.services.reports.sales(praia, {})).days).toEqual([]);
    expect((await w.services.reports.salesByProduct(praia, {})).rows).toEqual([]);
    expect((await w.services.reports.cash(praia, {})).sessions).toEqual([]);
    expect((await w.services.reports.operations(praia, {})).openedOrders).toBe(0);
    const events = (await w.services.reports.audit(praia, {})).rows.map((row) => row.event);
    expect(events).not.toContain('CASH_OPENED');
    expect(events).not.toContain('PAYMENT_CREATED');

    // E o Centro vê as próprias
    expect((await w.services.reports.dashboard(w.ctx('carla'))).salesCents).toBe(3520);
  });

  it('cada consulta do painel, do estoque e das formas de pagamento fica na própria loja (I-5)', async () => {
    // Centro: insumo abaixo do mínimo, venda com baixa (CMV), item na cozinha, mesa ocupada,
    // caixa aberto e pagamento no PIX
    await w.recipe('PRODUCT', 'X-Burger', '150', 'Carne moída');
    await w.stockOf('Carne moída', '1');
    await w.setMinimum('Carne moída', '900');
    await oneSale();
    await w.createTable('11');
    await w.sendTo('joão', '11', [{ quantity: 1, product: 'X-Burger' }]);
    const centro = w.ctx('carla');
    const mine = await w.services.reports.dashboard(centro);
    expect(mine).toMatchObject({ occupiedTables: 1, kitchenItems: 2, openOrders: 1 });
    expect(mine.openCash).toHaveLength(1);
    expect(mine.lowStock.map((item) => item.name)).toEqual(['Carne moída']);
    expect((await w.services.reports.sales(centro, {})).methods).toHaveLength(1);
    expect((await w.services.reports.stock(centro, {})).cogsCents).toBeGreaterThan(0);

    await w.personAt('paulo', 'GERENTE', 'Praia');
    const praia = w.ctx('paulo');
    const panel = await w.services.reports.dashboard(praia);
    expect(panel).toMatchObject({
      salesCents: 0,
      closedOrders: 0,
      openOrders: 0,
      occupiedTables: 0,
      kitchenItems: 0,
      lateItems: 0,
      openCash: [],
      topProducts: [],
      lowStock: [],
    });
    expect((await w.services.reports.sales(praia, {})).methods).toEqual([]);
    expect((await w.services.reports.sales(praia, {})).categories).toEqual([]);
    const stock = await w.services.reports.stock(praia, {});
    expect(stock).toMatchObject({ cogsCents: 0, lossesCents: 0, movements: [] });
    // O insumo é da empresa, mas o saldo da Praia não tem o do Centro
    expect(stock.balances.every((row) => Number(row.quantity) === 0)).toBe(true);
  });
});

describe('caixa aberto no relatório (fechamento cego — RN-CASH-06)', () => {
  it('o caixa aberto aparece sem esperado nem diferença', async () => {
    await oneSale();
    const { sessions } = await w.services.reports.cash(w.ctx('carla'), {});
    expect(sessions).toEqual([
      expect.objectContaining({ status: 'ABERTA', counts: null, alerts: 0 }),
    ]);
  });
});

describe('vendas', () => {
  it('conta cancelada ou ainda aberta não conta como venda', async () => {
    await w.sendTo('joão', '10', [{ quantity: 1, product: 'X-Burger' }]);
    const report = await w.sales('carla');
    expect(report.totals).toMatchObject({ orders: 0, totalCents: 0, averageTicketCents: 0 });
    expect((await w.dashboard('carla')).openOrders).toBe(1);
  });

  it('período inválido ou longo demais é recusado', async () => {
    expect(await failure(w.sales('carla', '2026-03-15', '2026-03-14'))).toBe('INVALID_PERIOD');
    expect(await failure(w.sales('carla', '2025-01-01', '2026-03-14'))).toBe('INVALID_PERIOD');
    expect(await failure(w.sales('carla', '14/03/2026'))).toBe('INVALID_DATE');
  });

  it('sem período, o relatório é do dia operacional de hoje', async () => {
    await oneSale();
    const report = await w.services.reports.sales(w.ctx('carla'), {});
    expect(report).toMatchObject({ from: TODAY, to: TODAY });
    expect(report.totals.totalCents).toBe(3520);
  });
});

describe('auditoria (RN-REP-08)', () => {
  it('filtra por evento e por pessoa no dia operacional, com o nome de quem fez', async () => {
    await oneSale();
    const ctx = w.ctx('carla');
    const opened = await w.services.reports.audit(ctx, { event: 'CASH_OPENED' });
    expect(opened.rows).toEqual([
      expect.objectContaining({ event: 'CASH_OPENED', actorUserId: w.userId('bia') }),
    ]);
    expect(opened.rows[0]?.actorName).toBeTruthy();
    const byBia = await w.services.reports.audit(ctx, { userId: w.userId('bia') });
    expect(byBia.rows.every((row) => row.actorUserId === w.userId('bia'))).toBe(true);
    // Fora do período: nada
    const yesterday = await w.services.reports.audit(ctx, {
      from: '2026-03-13',
      to: '2026-03-13',
    });
    expect(yesterday.total).toBe(0);
  });
});

describe('permissões (E9-4)', () => {
  it('o caixa vê o painel, mas não os relatórios nem a auditoria', async () => {
    const bia = w.ctx('bia');
    expect(await failure(w.services.reports.dashboard(bia))).toBeNull();
    for (const work of [
      w.services.reports.sales(bia, {}),
      w.services.reports.salesByProduct(bia, {}),
      w.services.reports.cash(bia, {}),
      w.services.reports.stock(bia, {}),
      w.services.reports.operations(bia, {}),
      w.services.reports.audit(bia, {}),
    ]) {
      expect(await failure(work)).toBe('FORBIDDEN');
    }
  });
});
