'use client';

import type { BillView } from '@/modules/pos/web';
import { formatBRL } from '@/ui/money';

const time = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

/**
 * Pré-conta em 80 mm (RN-POS-04, ADR-0010): só aparece na impressão (`.area-impressao`, como a via
 * da cozinha). Traz o aviso obrigatório de que não é documento fiscal.
 */
export function PrebillPrint({
  bill,
  storeName,
}: {
  readonly bill: BillView;
  readonly storeName: string;
}) {
  const { totals } = bill;
  return (
    <div className="area-impressao" data-testid="pre-conta">
      <p className="via-centro">{storeName.toUpperCase()}</p>
      <p className="via-centro">PRÉ-CONTA</p>
      <p className="via-titulo">{bill.title}</p>
      <p>
        Conta {bill.number} · {time(new Date())}
      </p>
      <hr />
      {bill.items
        .filter((item) => item.status !== 'CANCELADO')
        .map((item) => (
          <div key={item.id} className="via-item">
            <p>
              {item.quantity} × {item.productName} — {formatBRL(item.lineCents)}
            </p>
            {item.modifiers.length > 0 ? <p>+ {item.modifiers.join(', ')}</p> : null}
            {item.discountCents > 0 ? <p>Desconto −{formatBRL(item.discountCents)}</p> : null}
          </div>
        ))}
      <hr />
      <p>Itens: {formatBRL(totals.itemsCents)}</p>
      {totals.itemDiscountsCents + totals.orderDiscountCents > 0 ? (
        <p>Descontos: −{formatBRL(totals.itemDiscountsCents + totals.orderDiscountCents)}</p>
      ) : null}
      {totals.serviceFeeCents > 0 ? (
        <p>
          Taxa de serviço ({String(totals.serviceFeeBp / 100).replace('.', ',')}%):{' '}
          {formatBRL(totals.serviceFeeCents)}
        </p>
      ) : null}
      <p className="via-produto">TOTAL: {formatBRL(totals.totalCents)}</p>
      {totals.paidCents > 0 ? (
        <>
          <p>Pago: {formatBRL(totals.paidCents)}</p>
          <p className="via-produto">FALTA: {formatBRL(totals.balanceCents)}</p>
        </>
      ) : null}
      <hr />
      <p className="via-centro via-obs">NÃO É DOCUMENTO FISCAL</p>
    </div>
  );
}
