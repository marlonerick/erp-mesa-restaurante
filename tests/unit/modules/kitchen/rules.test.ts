import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  alertLevel,
  formatElapsed,
  type KitchenCommand,
  kitchenTransition,
} from '@/modules/kitchen/domain/rules';
import type { OrderItemStatus } from '@/modules/orders';

const errorCode = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'SEM_CODIGO';
  }
};

const item = (status: OrderItemStatus, extra: { prep?: boolean; ticket?: string | null } = {}) => ({
  status,
  requiresPreparation: extra.prep ?? true,
  kitchenTicketId: extra.ticket === undefined ? 'ticket' : extra.ticket,
});

const MIN = 60_000;
const thresholds = { warningMinutes: 10, lateMinutes: 20 };

describe('transições da cozinha (RN-KDS-03, 04, 07, 08)', () => {
  it.each<[KitchenCommand, OrderItemStatus, 'MUDA' | 'NADA']>([
    ['INICIAR', 'ENVIADO', 'MUDA'],
    ['INICIAR', 'EM_PREPARO', 'NADA'],
    ['INICIAR', 'PRONTO', 'NADA'],
    ['INICIAR', 'ENTREGUE', 'NADA'],
    ['PRONTO', 'ENVIADO', 'MUDA'],
    ['PRONTO', 'EM_PREPARO', 'MUDA'],
    ['PRONTO', 'PRONTO', 'NADA'],
    ['PRONTO', 'ENTREGUE', 'NADA'],
    ['DESFAZER', 'PRONTO', 'MUDA'],
    ['DESFAZER', 'EM_PREPARO', 'NADA'],
    ['DESFAZER', 'ENVIADO', 'NADA'],
  ])('%s com o item %s → %s', (command, status, expected) => {
    expect(kitchenTransition(command, item(status))).toBe(expected);
  });

  it.each<KitchenCommand>(['INICIAR', 'PRONTO', 'DESFAZER'])(
    '%s em item cancelado é recusado',
    (command) => {
      expect(errorCode(() => kitchenTransition(command, item('CANCELADO')))).toBe('ITEM_CANCELLED');
    },
  );

  it('desfazer item entregue é recusado', () => {
    expect(errorCode(() => kitchenTransition('DESFAZER', item('ENTREGUE')))).toBe(
      'ITEM_ALREADY_DELIVERED',
    );
  });

  it('item sem preparo, sem ticket ou não enviado não está na cozinha', () => {
    expect(errorCode(() => kitchenTransition('PRONTO', item('PRONTO', { prep: false })))).toBe(
      'ITEM_NOT_IN_KITCHEN',
    );
    expect(errorCode(() => kitchenTransition('PRONTO', item('ENVIADO', { ticket: null })))).toBe(
      'ITEM_NOT_IN_KITCHEN',
    );
    expect(errorCode(() => kitchenTransition('INICIAR', item('PENDENTE')))).toBe(
      'ITEM_NOT_IN_KITCHEN',
    );
  });
});

describe('alertas por tempo (RN-KDS-09, Q-14)', () => {
  it.each([
    [0, 'NORMAL'],
    [10 * MIN - 1, 'NORMAL'],
    [10 * MIN, 'ATENCAO'],
    [20 * MIN - 1, 'ATENCAO'],
    [20 * MIN, 'ATRASADO'],
    [3 * 60 * MIN, 'ATRASADO'],
  ])('%s ms → %s', (elapsed, level) => {
    expect(alertLevel(elapsed, thresholds)).toBe(level);
  });

  it('usa os tempos da loja', () => {
    expect(alertLevel(8 * MIN, { warningMinutes: 8, lateMinutes: 15 })).toBe('ATENCAO');
    expect(alertLevel(15 * MIN, { warningMinutes: 8, lateMinutes: 15 })).toBe('ATRASADO');
  });

  it('o alerta nunca volta atrás com o passar do tempo', () => {
    const order = { NORMAL: 0, ATENCAO: 1, ATRASADO: 2 } as const;
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 239 }),
        fc.integer({ min: 1, max: 240 }),
        fc.nat({ max: 5 * 60 * MIN }),
        fc.nat({ max: 60 * MIN }),
        (warning, extra, elapsed, more) => {
          const limits = { warningMinutes: warning, lateMinutes: Math.min(240, warning + extra) };
          if (limits.lateMinutes <= limits.warningMinutes) return;
          expect(order[alertLevel(elapsed + more, limits)]).toBeGreaterThanOrEqual(
            order[alertLevel(elapsed, limits)],
          );
        },
      ),
    );
  });
});

describe('cronômetro', () => {
  it.each([
    [0, '0:00'],
    [45_000, '0:45'],
    [59_999, '0:59'],
    [12 * MIN + 5_000, '12:05'],
    [62 * MIN + 3_000, '1:02:03'],
    [-5_000, '0:00'],
  ])('%s ms → %s', (elapsed, text) => {
    expect(formatElapsed(elapsed)).toBe(text);
  });
});
