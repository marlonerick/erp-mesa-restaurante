import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { cashierOps, type PaymentMethod } from '@/modules/cashier';
import type { DiscountMode, PayResult } from '@/modules/pos';
import type { Database } from '@/shared/db/client';
import { terminal } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import type { Jsonified } from '@/shared/idempotency/idempotency';
import { type Id, newId, parseMoneyText, type Permission, type SystemRole } from '@/shared/kernel';
import { kitchenWorld } from '../kitchen/kitchen-world';

/** "150,00" → 15000 centavos. */
export function cents(text: string): number {
  const value = parseMoneyText(text);
  if (value === null) throw new Error(`valor inválido: ${text}`);
  return value;
}

/** 7810 → "78,10" (como nos cenários). */
export const money = (value: number) =>
  `${value < 0 ? '-' : ''}${String(Math.trunc(Math.abs(value) / 100))},${String(Math.abs(value) % 100).padStart(2, '0')}`;

export const METHOD: Readonly<Record<string, PaymentMethod>> = {
  'em dinheiro': 'DINHEIRO',
  'no PIX': 'PIX',
  'no cartão de crédito': 'CARTAO_CREDITO',
  'no cartão de débito': 'CARTAO_DEBITO',
};

type Target = { table: string } | { counter: string };

/**
 * Cenários do caixa e do PDV: o salão e a cozinha (kitchenWorld) + terminais de caixa, caixas
 * abertos, contas e pagamentos.
 */
export function posWorld(db: Database) {
  const base = kitchenWorld(db);
  const sessions = new Map<string, Id>();
  const keys = new Map<string, string>();
  const grants = new Map<string, string>();
  let lastPay: Jsonified<PayResult> | null = null;
  let lastCounts: {
    method: PaymentMethod;
    expectedCents: number;
    declaredCents: number | null;
    differenceCents: number | null;
  }[] = [];
  let parts: number[] = [];

  /** Última conta de cada mesa: paga, a conta sai da mesa (LIMPEZA) mas o cenário ainda a confere. */
  const lastOrders = new Map<string, Id>();
  const orderId = async (target: Target): Promise<Id> => {
    if (!('table' in target)) return base.counter(target.counter);
    try {
      const id = await base.orderOfTable(target.table);
      lastOrders.set(target.table, id);
      return id;
    } catch (error) {
      const last = lastOrders.get(target.table);
      if (last) return last;
      throw error;
    }
  };
  const keyFor = (name?: string) => {
    if (!name) return newId();
    const existing = keys.get(name);
    if (existing) return existing;
    const key = newId();
    keys.set(name, key);
    return key;
  };
  const session = (name: string) => {
    const id = sessions.get(name);
    if (!id) throw new Error(`"${name}" não abriu caixa no cenário`);
    return id;
  };

  const p = {
    get lastPay() {
      if (!lastPay) throw new Error('nenhum pagamento no cenário');
      return lastPay;
    },
    get lastCounts() {
      return lastCounts;
    },
    get parts() {
      return parts;
    },
    orderId,

    /** Primeiro passo do cenário: organização nova e nada guardado do cenário anterior. */
    async first(name: string, role: SystemRole, pin?: string) {
      for (const map of [sessions, keys, grants, lastOrders]) map.clear();
      lastPay = null;
      lastCounts = [];
      parts = [];
      await base.first(name, role, pin);
    },

    /** Pessoa com perfil na loja Centro, usando (ou não) um terminal de caixa deste aparelho. */
    async withTerminal(name: string, role: SystemRole, code: string | null, pin?: string) {
      await base.person(name, role, pin);
      if (!code) return;
      const { id } = await base.services.organizations.createTerminal(base.ctx('sistema'), {
        code,
        name: `Caixa ${code}`,
        kind: 'CAIXA',
      });
      // Vínculo direto com o aparelho da sessão (a tela de terminais é testada na Etapa 3)
      await db
        .update(terminal)
        .set({ deviceId: base.ctx(name).deviceId })
        .where(eq(terminal.id, id));
    },

    async openCash(name: string, amount: string) {
      const { sessionId } = await base.services.cashier.open(base.ctx(name), {
        openingCents: cents(amount),
        idempotencyKey: newId(),
      });
      sessions.set(name, sessionId);
    },

    async movement(name: string, type: 'SANGRIA' | 'SUPRIMENTO', amount: string, reason: string) {
      await base.services.cashier.movement(base.ctx(name), {
        type,
        amountCents: cents(amount),
        reason,
        idempotencyKey: newId(),
      });
    },

    async expectedCash(name: string) {
      return runInTransaction(
        db,
        async (tx) => (await cashierOps.expected(tx, base.ctx(name), session(name))).DINHEIRO,
      );
    },

    async closeCash(name: string, declared: Partial<Record<PaymentMethod, string>>) {
      const current = await base.services.cashier.summary(base.ctx(name), session(name));
      const result = await base.services.cashier.close(base.ctx(name), {
        sessionId: current.id,
        version: current.version,
        declared: Object.fromEntries(
          Object.entries(declared).map(([method, value]) => [method, cents(value)]),
        ),
        idempotencyKey: newId(),
      });
      lastCounts = result.counts;
    },

    async bill(target: Target) {
      return base.services.pos.bill(base.ctx('sistema'), await orderId(target));
    },

    async pay(
      name: string,
      target: Target,
      method: PaymentMethod,
      amount: string | null,
      options: { key?: string; itemIds?: Id[] } = {},
    ) {
      lastPay = await base.services.pos.pay(base.ctx(name), {
        orderId: await orderId(target),
        method,
        amountCents: amount === null ? null : cents(amount),
        ...(options.itemIds ? { itemIds: options.itemIds } : {}),
        idempotencyKey: keyFor(options.key),
      });
    },

    /** Conta de balcão com um item sem preparo de `total`, já enviada. */
    async counterWith(by: string, label: string, total: string) {
      await base.sells(`Combo ${label}`, total, { noPrep: true });
      await base.sendToCounter(by, label, 1, `Combo ${label}`);
    },

    async discountOrder(
      name: string,
      target: Target,
      mode: DiscountMode,
      value: number,
      reason: string,
    ) {
      await base.services.pos.discountOrder(base.ctx(name), {
        orderId: await orderId(target),
        mode,
        value,
        reason,
        grantToken: grants.get(name) ?? null,
      });
    },

    async discountItem(
      name: string,
      table: string,
      position: number,
      value: string,
      reason: string,
    ) {
      const item = await base.sentItem(table, position);
      await base.services.pos.discountItem(base.ctx(name), {
        orderId: await orderId({ table }),
        itemId: item.id,
        mode: 'VALOR',
        value: cents(value),
        reason,
        grantToken: grants.get(name) ?? null,
      });
    },

    async serviceFee(name: string, table: string, waived: boolean, reason: string) {
      await base.services.pos.serviceFee(base.ctx(name), {
        orderId: await orderId({ table }),
        waived,
        reason,
        grantToken: grants.get(name) ?? null,
      });
    },

    async preBill(name: string, table: string) {
      await base.services.pos.preBill(base.ctx(name), { orderId: await orderId({ table }) });
    },

    /** Autorização do gerente no aparelho de outra pessoa, para uma permissão. */
    async authorizeFor(manager: string, device: string, permission: Permission, pin: string) {
      const { grantToken } = await base.services.auth.requestElevation(base.ctx(device), {
        authorizerUsername: base.username(manager),
        pin,
        permission,
      });
      grants.set(device, grantToken);
    },

    async cancelPayment(name: string, table: string, position: number, reason: string) {
      const detail = await p.bill({ table });
      const target = detail.payments[position];
      if (!target) throw new Error(`a mesa ${table} não tem o pagamento ${String(position + 1)}`);
      await base.services.pos.cancelPayment(base.ctx(name), {
        orderId: detail.order.id,
        paymentId: target.id,
        reason,
        grantToken: grants.get(name) ?? null,
        idempotencyKey: newId(),
      });
    },

    splitEvenly(balance: number, people: number, split: (b: number, n: number) => number[]) {
      parts = split(balance, people);
    },

    async tableStatus(table: string) {
      return base.floorStatus(table);
    },

    async itemIdByName(table: string, name: string): Promise<Id> {
      const item = (await base.sentItems(table)).find(
        (candidate) => candidate.productName === name,
      );
      if (!item) throw new Error(`a mesa ${table} não tem "${name}"`);
      return item.id;
    },

    async terminalOf(code: string) {
      const [row] = await db
        .select({ id: terminal.id })
        .from(terminal)
        .where(and(eq(terminal.storeId, base.org.centro), eq(terminal.code, code)));
      return row?.id ?? null;
    },

    expectMoney(actual: number, expected: string) {
      expect(money(actual)).toBe(expected);
    },
  };

  return Object.create(base, Object.getOwnPropertyDescriptors(p)) as typeof base & typeof p;
}

export type PosWorld = ReturnType<typeof posWorld>;
