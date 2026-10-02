'use client';

import { useActionState, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { payAction } from '@/modules/pos/interface/actions';
import type { BillView } from '@/modules/pos/web';
import { formatMoneyText } from '@/shared/kernel';
import { ActionForm } from '@/ui/action-form';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { formatBRL } from '@/ui/money';
import { SubmitButton } from '@/ui/submit-button';

const METHODS = [
  ['DINHEIRO', 'Dinheiro'],
  ['PIX', 'PIX'],
  ['CARTAO_CREDITO', 'Crédito'],
  ['CARTAO_DEBITO', 'Débito'],
  ['OUTRO', 'Outro'],
] as const;
type Method = (typeof METHODS)[number][0];

/** N partes iguais; os centavos que sobram vão para as primeiras (RN-POS-13, como no servidor). */
function splitEvenly(total: number, people: number): number[] {
  const base = Math.floor(total / people);
  const remainder = total % people;
  return Array.from({ length: people }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Receber (RN-POS-08 a RN-POS-13): forma de pagamento, valor (no dinheiro, o RECEBIDO — o troco é
 * calculado), referência e confirmação manual de PIX/cartão, divisão por pessoas e por itens. A
 * chave de idempotência é a mesma enquanto a pessoa reenvia; muda depois que deu certo.
 */
export function PaymentPanel({
  bill,
  storeId,
}: {
  readonly bill: BillView;
  readonly storeId: string;
}) {
  const [state, action] = useActionState(payAction, null);
  const [method, setMethod] = useState<Method>('PIX');
  const [amount, setAmount] = useState(() => formatMoneyText(bill.totals.balanceCents));
  const [people, setPeople] = useState(2);
  const [byItems, setByItems] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const submittedAt = state?.submittedAt ?? 0;
  const [intent, setIntent] = useState(() => ({ key: uuidv7(), at: submittedAt }));
  if (intent.at !== submittedAt) {
    // Deu certo: nova intenção, novo valor sugerido e itens desmarcados
    setIntent({ key: uuidv7(), at: submittedAt });
    setAmount(formatMoneyText(bill.totals.balanceCents));
    setByItems([]);
    setConfirmed(false);
  }
  const cash = method === 'DINHEIRO';
  const payable = bill.items.filter((item) => item.status !== 'CANCELADO' && !item.paid);

  // Conta fechada pelo último pagamento: fica só o resultado (troco) na tela
  if (bill.status !== 'ABERTO') {
    return state?.success ? (
      <section
        aria-label="Último pagamento"
        className="rounded-lg border-2 border-confirma bg-white p-4 text-xl"
      >
        <FormMessage state={state} />
      </section>
    ) : null;
  }

  return (
    <section
      aria-labelledby="receber"
      className="flex flex-col gap-4 rounded-lg border-2 border-azulejo bg-white p-4"
    >
      <h2 id="receber" className="text-2xl font-bold">
        Receber
      </h2>
      <ActionForm action={action} state={state}>
        <input type="hidden" name="expectedStoreId" value={storeId} />
        <input type="hidden" name="orderId" value={bill.orderId} />
        <input type="hidden" name="idempotencyKey" value={intent.key} />
        <input type="hidden" name="method" value={method} />

        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 font-semibold">Forma de pagamento</legend>
          {METHODS.map(([value, label]) => (
            <label
              key={value}
              className={cn(
                'flex min-h-14 cursor-pointer items-center gap-2 rounded-md border-2 px-4 text-lg font-semibold',
                // Foco do teclado visível no rótulo (o rádio é escondido — sugestão S-6)
                'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-azulejo',
                method === value
                  ? 'border-azulejo bg-azulejo-claro text-azulejo'
                  : 'border-borda bg-white',
              )}
            >
              <input
                type="radio"
                name="methodChoice"
                checked={method === value}
                onChange={() => {
                  setMethod(value);
                  setConfirmed(false);
                }}
                className="sr-only"
              />
              {/* A escolha não fica só na cor: marca ✓ (sugestão S-6) */}
              {method === value ? <span aria-hidden="true">✓</span> : null}
              {label}
            </label>
          ))}
        </fieldset>

        {byItems.length > 0 && !cash ? (
          <p className="rounded-md bg-azulejo-claro px-3 py-2 text-azulejo">
            O valor é a parte dos itens marcados (com a taxa), calculado ao receber.
          </p>
        ) : (
          <TextField
            label={cash ? 'Valor recebido (R$)' : 'Valor (R$)'}
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
            hint={
              cash
                ? byItems.length > 0
                  ? 'Quanto o cliente entregou; o troco é calculado sobre a parte dos itens.'
                  : `Falta ${formatBRL(bill.totals.balanceCents)}. Se entregar mais, o troco é calculado.`
                : `Falta ${formatBRL(bill.totals.balanceCents)}.`
            }
          />
        )}

        {cash ? null : (
          <>
            <TextField
              label="Referência (opcional)"
              name="reference"
              maxLength={60}
              hint="Código da maquininha (NSU) ou do PIX."
            />
            <label className="flex min-h-12 cursor-pointer items-center gap-3 font-semibold">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => {
                  setConfirmed(event.target.checked);
                }}
                className="size-6 accent-azulejo"
              />
              Confirmei que o pagamento foi aprovado (maquininha ou app do banco)
            </label>
          </>
        )}

        {byItems.map((id) => (
          <input key={id} type="hidden" name="itemId" value={id} />
        ))}

        <FormMessage state={state} />
        <SubmitButton
          pendingText="Recebendo…"
          className="min-h-14 text-lg"
          disabled={!cash && !confirmed}
        >
          Receber
        </SubmitButton>
      </ActionForm>

      <details className="rounded-md border border-borda p-3">
        <summary className="cursor-pointer font-semibold">Dividir por pessoas</summary>
        <div className="mt-3 flex flex-col gap-3">
          <TextField
            label="Quantas pessoas"
            name="people"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={people}
            onChange={(event) => {
              setPeople(Math.min(50, Math.max(1, Number(event.target.value) || 1)));
            }}
          />
          <ul className="flex flex-wrap gap-2" aria-label="Partes">
            {splitEvenly(bill.totals.balanceCents, people).map((part, index) => (
              <li key={index}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setByItems([]);
                    setAmount(formatMoneyText(part));
                  }}
                  aria-label={`Usar a parte ${String(index + 1)}: ${formatBRL(part)}`}
                >
                  {formatBRL(part)}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <details className="rounded-md border border-borda p-3">
        <summary className="cursor-pointer font-semibold">Pagar por itens</summary>
        {payable.length === 0 ? (
          <p className="mt-3 text-tinta-suave">Todos os itens já foram pagos na divisão.</p>
        ) : (
          <fieldset className="mt-3 flex flex-col gap-2">
            <legend className="sr-only">Itens deste pagamento</legend>
            {payable.map((item) => (
              <label key={item.id} className="flex min-h-12 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={byItems.includes(item.id)}
                  onChange={(event) => {
                    setByItems((current) =>
                      event.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    );
                  }}
                  className="size-6 accent-azulejo"
                />
                {item.quantity} × {item.productName} ·{' '}
                {formatBRL(item.lineCents - item.discountCents)}
              </label>
            ))}
          </fieldset>
        )}
      </details>
    </section>
  );
}
