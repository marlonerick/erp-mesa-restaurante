'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { closeFreeAction, preBillAction } from '@/modules/pos/interface/actions';
import type { BillView } from '@/modules/pos/web';
import { cn } from '@/ui/cn';
import { FormMessage } from '@/ui/form-message';
import { formatBRL } from '@/ui/money';
import { SubmitButton } from '@/ui/submit-button';
import { CancelPaymentDialog, DiscountDialog, ServiceFeeDialog } from './dialogs';
import { PaymentPanel } from './payment-panel';
import { PrebillPrint } from './prebill-print';

interface Props {
  readonly bill: BillView;
  readonly storeId: string;
  readonly storeName: string;
  /** Há caixa aberto neste terminal (RN-POS-08). */
  readonly cashOpen: boolean;
  readonly discountLimitBp: number;
  /** Fuso da loja: a página é desenhada no servidor (UTC) e no navegador (sugestão S-7). */
  readonly timeZone: string;
  readonly can: {
    readonly receive: boolean;
    readonly aboveLimit: boolean;
    readonly cancelPayment: boolean;
  };
}

const timeIn = (timeZone: string) => (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(iso),
  );
const percent = (bp: number) => `${String(bp / 100).replace('.', ',')}%`;

/** A conta no PDV (docs/modules/pos.md). */
export function BillScreen({
  bill,
  storeId,
  storeName,
  cashOpen,
  discountLimitBp,
  timeZone,
  can,
}: Props) {
  const { totals } = bill;
  const time = timeIn(timeZone);
  const open = bill.status === 'ABERTO';
  const started = totals.paidCents > 0;
  // Desconto e taxa só antes do primeiro pagamento (RN-POS-07)
  const editable = open && !started && can.receive;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{bill.title}</h1>
        <p className="text-tinta-suave">
          Conta {bill.number} · aberta às{' '}
          <time dateTime={bill.openedAt} suppressHydrationWarning>
            {time(bill.openedAt)}
          </time>
          {bill.prebillAt ? ' · pré-conta emitida' : ''}
        </p>
      </header>

      {bill.status === 'FECHADO' ? (
        <p
          role="status"
          className="rounded-md border-l-4 border-confirma bg-confirma-claro px-4 py-3 font-semibold text-confirma"
        >
          Conta paga e fechada. {bill.type === 'MESA' ? 'A mesa foi para limpeza.' : ''}{' '}
          <Link href="/pdv" className="underline">
            Voltar para o PDV
          </Link>
        </p>
      ) : null}
      {bill.status === 'CANCELADO' ? (
        <p role="status" className="rounded-md bg-alerta-claro px-4 py-3 font-semibold text-alerta">
          Esta conta foi cancelada ou juntada a outra.
        </p>
      ) : null}
      {open && bill.pendingCount > 0 ? (
        <p
          role="note"
          className="rounded-md border-l-4 border-atencao bg-atencao-claro px-4 py-3 font-semibold text-atencao"
        >
          {bill.pendingCount} item(ns) ainda não enviado(s): o garçom precisa enviar ou remover
          antes da pré-conta e do pagamento.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="itens" className="flex flex-col gap-2">
            <h2 id="itens" className="text-2xl font-bold">
              Itens
            </h2>
            <ul className="flex flex-col border-t border-borda" aria-label="Itens da conta">
              {bill.items.map((item) => {
                const cancelled = item.status === 'CANCELADO';
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-3 border-b border-borda py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className={cn('text-lg font-bold', cancelled && 'line-through')}>
                        {item.quantity} × {item.productName}
                      </span>
                      {item.modifiers.length > 0 ? (
                        <span className="text-tinta-suave">{item.modifiers.join(', ')}</span>
                      ) : null}
                      {item.discountCents > 0 ? (
                        <span className="text-sm font-semibold text-confirma">
                          Desconto −{formatBRL(item.discountCents)}
                          {item.discountReason ? ` · ${item.discountReason}` : ''}
                        </span>
                      ) : null}
                      <span className="text-sm text-tinta-suave">
                        {item.statusLabel}
                        {item.paid ? ' · pago na divisão' : ''}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold">{formatBRL(item.lineCents)}</span>
                      {editable && !cancelled ? (
                        <DiscountDialog
                          label={`Desconto em ${item.productName}`}
                          title={`Desconto em ${String(item.quantity)} × ${item.productName}`}
                          baseCents={item.lineCents}
                          currentCents={item.discountCents}
                          orderId={bill.orderId}
                          itemId={item.id}
                          storeId={storeId}
                          limitBp={discountLimitBp}
                          canAboveLimit={can.aboveLimit}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="pagamentos" className="flex flex-col gap-2">
            <h2 id="pagamentos" className="text-2xl font-bold">
              Pagamentos
            </h2>
            {bill.payments.length === 0 ? (
              <p className="text-tinta-suave">Nenhum pagamento ainda.</p>
            ) : (
              <ul className="flex flex-col border-t border-borda" aria-label="Pagamentos">
                {bill.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-borda py-2"
                  >
                    <span className={cn(payment.cancelled && 'line-through')}>
                      <strong>{payment.methodLabel}</strong> {formatBRL(payment.amountCents)}
                      {payment.changeCents ? ` · troco ${formatBRL(payment.changeCents)}` : ''}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                      {payment.createdByName ? ` · ${payment.createdByName}` : ''}
                    </span>
                    {payment.cancelled ? (
                      <span className="text-sm font-semibold text-alerta">
                        Cancelado: {payment.cancelReason}
                      </span>
                    ) : open && can.receive ? (
                      <CancelPaymentDialog
                        orderId={bill.orderId}
                        payment={payment}
                        storeId={storeId}
                        canCancel={can.cancelPayment}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section
            aria-labelledby="valores"
            className="flex flex-col gap-2 rounded-lg bg-white p-4 shadow-sm"
          >
            <h2 id="valores" className="sr-only">
              Valores
            </h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-lg">
              <dt>Itens</dt>
              <dd className="text-right">{formatBRL(totals.itemsCents)}</dd>
              {totals.itemDiscountsCents > 0 ? (
                <>
                  <dt>Descontos nos itens</dt>
                  <dd className="text-right">−{formatBRL(totals.itemDiscountsCents)}</dd>
                </>
              ) : null}
              <dt className="flex items-center gap-2">
                Desconto na conta
                {editable ? (
                  <DiscountDialog
                    label="Desconto na conta"
                    title="Desconto na conta"
                    baseCents={totals.subtotalCents}
                    currentCents={totals.orderDiscountCents}
                    orderId={bill.orderId}
                    storeId={storeId}
                    limitBp={discountLimitBp}
                    canAboveLimit={can.aboveLimit}
                  />
                ) : null}
              </dt>
              <dd className="self-center text-right">−{formatBRL(totals.orderDiscountCents)}</dd>
              {bill.type === 'MESA' ? (
                <>
                  <dt className="flex items-center gap-2">
                    Taxa de serviço (
                    {bill.serviceFeeWaived ? 'retirada' : percent(totals.serviceFeeBp)})
                    {editable ? (
                      <ServiceFeeDialog
                        orderId={bill.orderId}
                        storeId={storeId}
                        waived={bill.serviceFeeWaived}
                        canAboveLimit={can.aboveLimit}
                      />
                    ) : null}
                  </dt>
                  <dd className="self-center text-right">{formatBRL(totals.serviceFeeCents)}</dd>
                </>
              ) : null}
              <dt className="mt-2 border-t-2 border-borda pt-2 text-2xl font-bold">Total</dt>
              <dd className="mt-2 border-t-2 border-borda pt-2 text-right text-2xl font-bold">
                {formatBRL(totals.totalCents)}
              </dd>
              <dt>Pago</dt>
              <dd className="text-right">{formatBRL(totals.paidCents)}</dd>
              <dt className="text-2xl font-bold">Falta pagar</dt>
              <dd className="text-right text-2xl font-bold" aria-live="polite">
                {formatBRL(totals.balanceCents)}
              </dd>
            </dl>
            {open && can.receive ? (
              <PreBillButton bill={bill} storeId={storeId} storeName={storeName} />
            ) : null}
            {open &&
            can.receive &&
            totals.totalCents === 0 &&
            totals.paidCents === 0 &&
            bill.pendingCount === 0 ? (
              <CloseFreeButton orderId={bill.orderId} storeId={storeId} />
            ) : null}
          </section>

          {/* O painel continua no MESMO lugar quando a conta fecha: o resultado do último
              pagamento (troco!) não pode sumir junto com o formulário */}
          {can.receive && (bill.status === 'FECHADO' || (open && totals.balanceCents > 0)) ? (
            cashOpen || !open ? (
              <PaymentPanel bill={bill} storeId={storeId} />
            ) : (
              <p
                role="note"
                className="rounded-md border-l-4 border-atencao bg-atencao-claro px-4 py-3 font-semibold text-atencao"
              >
                Para receber, abra o caixa deste terminal.{' '}
                <Link href="/caixa" className="underline">
                  Ir para o caixa
                </Link>
              </p>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Emite a pré-conta (mesa → EM_PAGAMENTO) e abre a impressão de 80 mm (RN-POS-04). */
function PreBillButton({
  bill,
  storeId,
  storeName,
}: {
  readonly bill: BillView;
  readonly storeId: string;
  readonly storeName: string;
}) {
  const [state, action] = useActionState(preBillAction, null);
  // Só existe depois de um envio NO NAVEGADOR: o portal nunca roda no servidor
  const printed = state?.submittedAt ?? 0;
  useEffect(() => {
    if (printed > 0) window.print();
  }, [printed]);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="orderId" value={bill.orderId} />
      <SubmitButton pendingText="Emitindo…" variant="secondary">
        Emitir pré-conta
      </SubmitButton>
      <FormMessage state={state} />
      {/* A via fica montada (invisível) — no tablet a impressão não espera (achado I-1 da Etapa 7) */}
      {printed > 0
        ? createPortal(<PrebillPrint bill={bill} storeName={storeName} />, document.body)
        : null}
    </form>
  );
}

/** Conta com total zero (cortesia): fecha sem pagamento (RN-POS-12a). */
function CloseFreeButton({
  orderId,
  storeId,
}: {
  readonly orderId: string;
  readonly storeId: string;
}) {
  const [state, action] = useActionState(closeFreeAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton pendingText="Fechando…">Fechar conta sem valor (cortesia)</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
