import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { orgAdmin } from '@/modules/organizations/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../no-permission';
import { KIND_LABELS, TerminalForm } from './terminal-forms';

export const metadata: Metadata = { title: 'Terminais' };

export default async function TerminalsPage() {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'terminals.manage')) {
    return <NoPermission />;
  }
  const terminals = await orgAdmin().listTerminals(context);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-bold">Terminais</h1>
        <p className="text-tinta-suave">
          Aparelhos da loja {storeName}. Para registrar um aparelho, abra esta tela nele e escolha
          “Usar este aparelho”.
        </p>
      </div>

      {terminals.length === 0 ? (
        <p className="text-lg">Nenhum terminal cadastrado ainda.</p>
      ) : (
        <ul className="flex flex-col border-t border-borda" aria-label="Terminais da loja">
          {terminals.map((terminal) => (
            <li key={terminal.id} className="border-b border-borda">
              <Link
                href={`/admin/terminais/${terminal.id}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4 hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
              >
                <span className="flex flex-col">
                  <span className="text-lg font-bold text-azulejo">
                    {terminal.name} <span className="text-tinta-suave">({terminal.code})</span>
                  </span>
                  <span className="text-tinta-suave">{KIND_LABELS[terminal.kind]}</span>
                </span>
                <span className="font-semibold">
                  {!terminal.active ? (
                    <span className="text-alerta">Desativado</span>
                  ) : terminal.isThisDevice ? (
                    <span className="rounded-md bg-azulejo px-2 py-1 text-white">
                      Este aparelho
                    </span>
                  ) : terminal.hasDevice ? (
                    'Com aparelho'
                  ) : (
                    <span className="text-tinta-suave">Sem aparelho</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="novo-terminal" className="flex max-w-lg flex-col gap-5">
        <h2 id="novo-terminal" className="text-2xl font-bold">
          Cadastrar terminal
        </h2>
        <TerminalForm values={{ code: '', name: '', kind: 'CAIXA' }} storeId={context.storeId} />
      </section>
    </div>
  );
}
