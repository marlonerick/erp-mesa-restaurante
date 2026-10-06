'use client';

import { useId, useState } from 'react';
import { DENOMINATIONS, sumDenominations } from '@/modules/cashier/interface/counting';
import { Button } from '@/ui/button';
import { formatBRL } from '@/ui/money';

/**
 * Contador de cédulas e moedas (E10-6, opção A): a pessoa digita QUANTAS notas de cada valor há
 * na gaveta e o sistema soma. Não mostra o esperado — o fechamento continua cego para o dinheiro.
 * Os campos não têm `name`: só o total vai para o formulário (pelo botão "Usar este total").
 */
export function CashCounter({ onUse }: { readonly onUse: (cents: number) => void }) {
  const id = useId();
  const [counts, setCounts] = useState<Record<number, number>>({});
  const total = sumDenominations(counts);
  return (
    <details className="rounded-md border-2 border-borda bg-white p-3">
      <summary className="flex min-h-12 cursor-pointer items-center font-semibold text-azulejo">
        Contar cédulas e moedas
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <p className="text-tinta-suave">
          Digite quantas notas e moedas de cada valor há na gaveta.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DENOMINATIONS.map((denomination) => (
            <div key={denomination.cents} className="flex flex-col gap-1">
              <label htmlFor={`${id}-${String(denomination.cents)}`} className="font-semibold">
                {denomination.kind === 'cédula' ? 'Notas' : 'Moedas'} de {denomination.label}
              </label>
              <input
                id={`${id}-${String(denomination.cents)}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={counts[denomination.cents] ?? ''}
                onChange={(event) => {
                  const quantity = Number.parseInt(event.target.value, 10);
                  setCounts((current) => ({
                    ...current,
                    [denomination.cents]: Number.isNaN(quantity) ? 0 : quantity,
                  }));
                }}
                className="min-h-12 rounded-md border-2 border-borda bg-white px-3 text-lg text-tinta focus:border-azulejo focus:outline-3 focus:outline-azulejo-claro"
              />
            </div>
          ))}
        </div>
        <p className="text-lg" aria-live="polite">
          Total contado: <strong>{formatBRL(total)}</strong>
        </p>
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => {
            onUse(total);
          }}
        >
          Usar este total
        </Button>
      </div>
    </details>
  );
}
