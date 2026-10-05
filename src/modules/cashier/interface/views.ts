import type { CashierScreen, ClosedSummary } from '../application/cashier';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '../domain/rules';

// Dados prontos para a tela do caixa. Antes do fechamento, NADA de vendas nem esperado (RN-CASH-06).

export interface CashMovementView {
  readonly id: string;
  readonly type: 'SANGRIA' | 'SUPRIMENTO' | 'AJUSTE' | 'VENDA' | 'ESTORNO';
  readonly amountCents: number;
  readonly reason: string | null;
  readonly userName: string | null;
  readonly occurredAt: string;
}

export interface CashierView {
  readonly terminal: { readonly code: string; readonly name: string } | null;
  readonly session: {
    readonly id: string;
    readonly version: number;
    readonly openedAt: string;
    readonly openedByName: string | null;
    readonly openingAmountCents: number;
    readonly operationalDate: string;
    readonly movements: CashMovementView[];
  } | null;
}

export interface CountView {
  readonly method: PaymentMethod;
  readonly methodLabel: string;
  readonly expectedCents: number;
  readonly declaredCents: number | null;
  readonly differenceCents: number | null;
}

export interface CashSummaryView {
  readonly id: string;
  readonly status: 'ABERTA' | 'FECHADA';
  readonly operationalDate: string;
  readonly openedAt: string;
  readonly openedByName: string | null;
  readonly closedAt: string | null;
  readonly closedByName: string | null;
  readonly openingAmountCents: number;
  readonly counts: CountView[] | null;
  /** Sangrias acima do esperado (decisão I-3); só depois do fechamento. */
  readonly alerts:
    | {
        readonly id: string;
        readonly amountCents: number;
        readonly reason: string | null;
        readonly userName: string | null;
        readonly occurredAt: string;
      }[]
    | null;
}

export function toCashierView(screen: CashierScreen): CashierView {
  return {
    terminal: screen.terminal ? { code: screen.terminal.code, name: screen.terminal.name } : null,
    session: screen.session
      ? {
          id: screen.session.id,
          version: screen.session.version,
          openedAt: screen.session.openedAt.toISOString(),
          openedByName: screen.session.openedByName,
          openingAmountCents: screen.session.openingAmountCents,
          operationalDate: screen.session.operationalDate,
          movements: screen.session.movements.map((movement) => ({
            id: movement.id,
            type: movement.type,
            amountCents: movement.amountCents,
            reason: movement.reason,
            userName: movement.userName,
            occurredAt: movement.occurredAt.toISOString(),
          })),
        }
      : null,
  };
}

export function toCashSummaryView(summary: ClosedSummary): CashSummaryView {
  return {
    id: summary.id,
    status: summary.status,
    operationalDate: summary.operationalDate,
    openedAt: summary.openedAt.toISOString(),
    openedByName: summary.openedByName,
    closedAt: summary.closedAt?.toISOString() ?? null,
    closedByName: summary.closedByName,
    openingAmountCents: summary.openingAmountCents,
    counts:
      summary.counts?.map((line) => ({
        ...line,
        methodLabel: PAYMENT_METHOD_LABEL[line.method],
      })) ?? null,
    alerts:
      summary.alerts?.map((alert) => ({
        id: alert.id,
        amountCents: Math.abs(alert.amountCents),
        reason: alert.reason,
        userName: alert.userName,
        occurredAt: alert.occurredAt.toISOString(),
      })) ?? null,
  };
}
