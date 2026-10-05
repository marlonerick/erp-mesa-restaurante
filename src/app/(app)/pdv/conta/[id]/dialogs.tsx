'use client';

import { useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import {
  cancelPaymentAction,
  discountItemAction,
  discountOrderAction,
  serviceFeeAction,
} from '@/modules/pos/interface/actions';
import type { PaymentView } from '@/modules/pos/web';
import { parseMoneyText } from '@/shared/kernel';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/ui/dialog';
import { TextAreaField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { formatBRL } from '@/ui/money';
import { ManagerFields, useElevatedForm } from './elevated';

/** "12,5" → 1250 pontos-base (só para a tela decidir se pede o PIN; o servidor confere). */
function percentBp(text: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim().replace('%', '').trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** Desconto em R$ ou % a partir do texto digitado (estimativa da tela). */
function discountCents(mode: 'VALOR' | 'PERCENTUAL', text: string, baseCents: number) {
  if (mode === 'VALOR') return parseMoneyText(text);
  const bp = percentBp(text);
  return bp === null ? null : Math.round((baseCents * bp) / 10_000);
}

function Done({ message, close }: { readonly message: string; readonly close: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <FormMessage state={{ success: message }} />
      <Button onClick={close}>Fechar</Button>
    </div>
  );
}

/**
 * Desconto na conta ou no item (RN-POS-05): valor ou percentual, motivo; acima do limite do perfil,
 * a janela já pede o PIN do gerente.
 */
export function DiscountDialog({
  label,
  title,
  baseCents,
  currentCents,
  orderId,
  itemId,
  storeId,
  limitBp,
  billDiscountsCents,
  itemsCents,
  canAboveLimit,
}: {
  readonly label: string;
  readonly title: string;
  readonly baseCents: number;
  readonly currentCents: number;
  readonly orderId: string;
  readonly itemId?: string;
  readonly storeId: string;
  readonly limitBp: number;
  /** Soma dos descontos da conta hoje e valor dos itens: o limite vale na soma (decisão S-2). */
  readonly billDiscountsCents: number;
  readonly itemsCents: number;
  readonly canAboveLimit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'VALOR' | 'PERCENTUAL'>('PERCENTUAL');
  const [value, setValue] = useState('');
  const form = useElevatedForm(
    itemId ? discountItemAction : discountOrderAction,
    'discounts.apply_above_limit',
  );
  const cents = discountCents(mode, value, baseCents) ?? 0;
  // Sem arredondar: a SOMA dos descontos da conta acima do limite do perfil (Q-07, decisão S-2)
  const afterCents = billDiscountsCents - currentCents + cents;
  const needsManager =
    !canAboveLimit && afterCents > billDiscountsCents && afterCents * 10_000 > limitBp * itemsCents;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setValue('');
      }}
    >
      <DialogTrigger asChild>
        <Button variant="quiet" className="min-h-12 px-2" aria-label={label}>
          {currentCents > 0 ? 'Mudar desconto' : 'Desconto'}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={title}
        description={`Sobre ${formatBRL(baseCents)}. Seu limite: ${String(limitBp / 100).replace('.', ',')}% do valor dos itens, somando todos os descontos da conta. Zero retira o desconto.`}
      >
        {form.state?.success ? (
          <Done
            message={form.state.success}
            close={() => {
              setOpen(false);
            }}
          />
        ) : (
          <form
            onSubmit={(event) => {
              form.submit(event, needsManager);
            }}
            noValidate
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="expectedStoreId" value={storeId} />
            <input type="hidden" name="orderId" value={orderId} />
            {itemId ? <input type="hidden" name="itemId" value={itemId} /> : null}
            <input type="hidden" name="mode" value={mode} />
            <fieldset className="flex gap-3">
              <legend className="mb-1 font-semibold">Tipo de desconto</legend>
              {(
                [
                  ['PERCENTUAL', 'Em %'],
                  ['VALOR', 'Em R$'],
                ] as const
              ).map(([option, text]) => (
                <label
                  key={option}
                  className="flex min-h-12 cursor-pointer items-center gap-2 rounded-md border-2 border-borda bg-white px-3 has-checked:border-azulejo has-checked:bg-azulejo-claro"
                >
                  <input
                    type="radio"
                    name="modeChoice"
                    checked={mode === option}
                    onChange={() => {
                      setMode(option);
                    }}
                    className="size-5 accent-azulejo"
                  />
                  {text}
                </label>
              ))}
            </fieldset>
            <TextField
              label={mode === 'PERCENTUAL' ? 'Percentual (%)' : 'Valor (R$)'}
              name="value"
              inputMode="decimal"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              hint={cents > 0 ? `Desconto de ${formatBRL(cents)}` : undefined}
              required
            />
            <TextAreaField label="Motivo" name="reason" rows={2} maxLength={200} required />
            {needsManager ? (
              <ManagerFields reason="O desconto passa do seu limite: o gerente autoriza neste aparelho." />
            ) : null}
            {form.authError ? <FormMessage state={{ error: form.authError }} /> : null}
            <FormMessage state={form.state?.error ? form.state : null} />
            <Button type="submit" disabled={form.pending} aria-busy={form.pending}>
              {form.pending ? 'Aplicando…' : 'Aplicar desconto'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Retirar ou devolver a taxa de serviço (RN-POS-06): motivo e gerente (ou PIN do gerente). */
export function ServiceFeeDialog({
  orderId,
  storeId,
  waived,
  canAboveLimit,
}: {
  readonly orderId: string;
  readonly storeId: string;
  readonly waived: boolean;
  readonly canAboveLimit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const form = useElevatedForm(serviceFeeAction, 'discounts.apply_above_limit');
  const action = waived ? 'Devolver a taxa de serviço' : 'Retirar a taxa de serviço';
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="quiet" className="min-h-12 px-2">
          {waived ? 'Devolver taxa' : 'Retirar taxa'}
        </Button>
      </DialogTrigger>
      <DialogContent title={action} description="Fica registrado na auditoria, com o motivo.">
        {form.state?.success ? (
          <Done
            message={form.state.success}
            close={() => {
              setOpen(false);
            }}
          />
        ) : (
          <form
            onSubmit={(event) => {
              form.submit(event, !canAboveLimit);
            }}
            noValidate
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="expectedStoreId" value={storeId} />
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="waived" value={waived ? 'false' : 'true'} />
            <TextAreaField label="Motivo" name="reason" rows={2} maxLength={200} required />
            {canAboveLimit ? null : (
              <ManagerFields reason="Mexer na taxa de serviço precisa do gerente." />
            )}
            {form.authError ? <FormMessage state={{ error: form.authError }} /> : null}
            <FormMessage state={form.state?.error ? form.state : null} />
            <Button type="submit" disabled={form.pending} aria-busy={form.pending}>
              {form.pending ? 'Salvando…' : action}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Cancelar pagamento lançado errado (RN-POS-14, E8-3): motivo e gerente (ou PIN). */
export function CancelPaymentDialog({
  orderId,
  payment,
  storeId,
  canCancel,
}: {
  readonly orderId: string;
  readonly payment: PaymentView;
  readonly storeId: string;
  readonly canCancel: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [key] = useState(() => uuidv7());
  const form = useElevatedForm(cancelPaymentAction, 'payments.cancel');
  const what = `${payment.methodLabel} ${formatBRL(payment.amountCents)}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="quiet" className="min-h-12 px-2" aria-label={`Cancelar pagamento ${what}`}>
          Cancelar
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Cancelar pagamento ${what}`}
        description="O valor volta a faltar na conta e sai do caixa como estorno."
      >
        {form.state?.success ? (
          <Done
            message={form.state.success}
            close={() => {
              setOpen(false);
            }}
          />
        ) : (
          <form
            onSubmit={(event) => {
              form.submit(event, !canCancel);
            }}
            noValidate
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="expectedStoreId" value={storeId} />
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="paymentId" value={payment.id} />
            <input type="hidden" name="idempotencyKey" value={key} />
            <TextAreaField label="Motivo" name="reason" rows={2} maxLength={200} required />
            {canCancel ? null : <ManagerFields reason="Cancelar pagamento precisa do gerente." />}
            {form.authError ? <FormMessage state={{ error: form.authError }} /> : null}
            <FormMessage state={form.state?.error ? form.state : null} />
            <Button type="submit" variant="danger" disabled={form.pending} aria-busy={form.pending}>
              {form.pending ? 'Cancelando…' : 'Cancelar pagamento'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
