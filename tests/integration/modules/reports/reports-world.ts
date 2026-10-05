import { expect } from 'vitest';
import type { FinanceType } from '@/modules/finance';
import type { Database } from '@/shared/db/client';
import { type Id, newId, type SystemRole } from '@/shared/kernel';
import { TEST_START } from '../../../support/identity';
import { TODAY } from '../inventory/stock-world';
import type { PaymentMethod } from '@/modules/cashier';
import { cents, money, posWorld } from '../pos/pos-world';

/** Mês do cenário: os lançamentos são procurados nele. */
const MONTH = { from: '2026-03-01', to: '2026-03-31' };

/**
 * Cenários do financeiro, do painel e dos relatórios: o PDV e o caixa (posWorld) + lançamentos,
 * fluxo de caixa, painel e relatórios. O relógio volta ao início a cada cenário.
 */
export function reportsWorld(db: Database) {
  const base = posWorld(db);
  const finance = () => base.services.finance;
  const reports = () => base.services.reports;

  async function categoryId(name: string, type: FinanceType): Promise<Id> {
    const found = (await finance().categories(base.ctx('sistema'))).find(
      (category) => category.name === name && category.type === type,
    );
    if (!found) throw new Error(`a categoria "${name}" não existe`);
    return found.id;
  }

  async function entryOf(description: string) {
    const { rows } = await finance().entries(base.ctx('sistema'), MONTH);
    const found = rows.find((row) => row.description === description);
    if (!found) throw new Error(`o lançamento "${description}" não existe`);
    return found;
  }

  const r = {
    MONTH,
    async first(name: string, role: SystemRole, pin?: string) {
      base.services.clock.set(TEST_START);
      await base.first(name, role, pin);
    },

    /** "2026-03-15" às "06:00" no horário de São Paulo (UTC−3). */
    setClock(date: string, time: string) {
      base.services.clock.set(new Date(`${date}T${time}:00.000-03:00`));
    },

    /** Paga o saldo inteiro da conta numa forma de pagamento. */
    async payAll(
      by: string,
      target: { table: string } | { counter: string },
      method: PaymentMethod,
    ) {
      const { totals } = await base.bill(target);
      await base.pay(by, target, method, money(totals.balanceCents));
    },

    // ---- Financeiro ----

    async entry(
      by: string,
      input: {
        type: FinanceType;
        description: string;
        amount: string;
        category: string;
        status: 'PAGO' | 'PREVISTO';
        date: string;
      },
    ) {
      await finance().createEntry(base.ctx(by), {
        type: input.type,
        categoryId: await categoryId(input.category, input.type),
        description: input.description,
        amountCents: cents(input.amount),
        competenceDate: input.date,
        status: input.status,
        date: input.date,
        idempotencyKey: newId(),
      });
    },

    async payEntry(by: string, description: string, date: string) {
      const entry = await entryOf(description);
      await finance().payEntry(base.ctx(by), {
        entryId: entry.id,
        version: entry.version,
        paidDate: date,
      });
    },

    async cancelEntry(by: string, description: string, reason: string) {
      const entry = await entryOf(description);
      await finance().cancelEntry(base.ctx(by), {
        entryId: entry.id,
        version: entry.version,
        reason,
      });
    },

    async cashFlow(from: string, to = from) {
      return finance().cashFlow(base.ctx('sistema'), { from, to });
    },

    /** Entradas e saídas de um dia do fluxo (dia sem movimento = zeros). */
    async flowOf(date: string) {
      const flow = await r.cashFlow(date);
      return (
        flow.days.find((day) => day.date === date) ?? {
          date,
          inflowCents: 0,
          outflowCents: 0,
          netCents: 0,
          cumulativeCents: 0,
        }
      );
    },

    async salesEntries() {
      const { rows } = await finance().entries(base.ctx('sistema'), {
        ...MONTH,
        type: 'RECEITA',
      });
      return rows.filter((row) => row.source === 'CAIXA');
    },

    async categoryId(name: string, type: FinanceType) {
      return categoryId(name, type);
    },

    // ---- Painel e relatórios ----

    dashboard: (by: string) => reports().dashboard(base.ctx(by)),
    sales: (by: string, from = TODAY, to = from) => reports().sales(base.ctx(by), { from, to }),

    async setMinimum(ingredient: string, minimum: string) {
      const list = await base.services.inventory.listIngredients(base.ctx('sistema'));
      const found = list.find((item) => item.name === ingredient);
      if (!found) throw new Error(`o insumo "${ingredient}" não existe`);
      await base.services.inventory.setMinimum(base.ctx('sistema'), {
        ingredientId: found.id,
        minimum,
      });
    },

    /** Confere centavos com o texto do cenário ("1.000,00", "-180,00"). */
    expectCents(actual: number, expected: string) {
      const negative = expected.startsWith('-');
      expect(actual).toBe((negative ? -1 : 1) * cents(negative ? expected.slice(1) : expected));
    },
  };

  return Object.create(base, Object.getOwnPropertyDescriptors(r)) as typeof base & typeof r;
}

export type ReportsWorld = ReturnType<typeof reportsWorld>;
