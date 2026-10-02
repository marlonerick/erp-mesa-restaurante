import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { cashier, toCashierView } from '@/modules/cashier/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../admin/no-permission';
import { CashierScreen } from './cashier-screen';

export const metadata: Metadata = { title: 'Caixa' };

/** Caixa deste terminal (docs/modules/cashier.md): abrir, sangria, suprimento e fechamento cego. */
export default async function CashierPage() {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'cashier.read')) {
    return <NoPermission />;
  }
  const view = toCashierView(await cashier().current(context));

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Caixa</h1>
        <p className="text-tinta-suave">
          Loja {storeName}
          {view.terminal ? ` · terminal ${view.terminal.code} (${view.terminal.name})` : ''}
        </p>
      </div>

      {view.terminal ? (
        <CashierScreen
          view={view}
          storeId={context.storeId}
          can={{
            open: hasPermission(context, 'cashier.open'),
            movement: hasPermission(context, 'cashier.movement'),
            close: hasPermission(context, 'cashier.close'),
          }}
        />
      ) : (
        <section className="flex flex-col gap-3 rounded-md border-l-4 border-atencao bg-atencao-claro px-4 py-4 text-atencao">
          <h2 className="text-xl font-bold">Este aparelho não é um terminal de caixa</h2>
          <p>
            O caixa só abre no computador ou tablet cadastrado como terminal de caixa da loja. Peça
            ao gerente para vincular este aparelho em Administração → Terminais.
          </p>
          {hasPermission(context, 'terminals.manage') ? (
            <Link href="/admin/terminais" className="font-semibold underline">
              Ir para Terminais
            </Link>
          ) : null}
        </section>
      )}
    </div>
  );
}
