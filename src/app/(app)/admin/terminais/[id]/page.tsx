import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { orgAdmin } from '@/modules/organizations/web';
import { hasPermission, isDomainError, isId } from '@/shared/kernel';
import { NoPermission } from '../../no-permission';
import { DeviceBinding, TerminalForm, TerminalStatus } from '../terminal-forms';

export const metadata: Metadata = { title: 'Editar terminal' };

export default async function EditTerminalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context } = await requireSession();
  if (!hasPermission(context, 'terminals.manage')) {
    return <NoPermission />;
  }
  if (!isId(id)) notFound();

  let terminal;
  try {
    terminal = await orgAdmin().getTerminal(context, id);
  } catch (error) {
    // Terminal de outra loja: mesma resposta de inexistente (isolamento)
    if (isDomainError(error) && error.code === 'TERMINAL_NOT_FOUND') notFound();
    throw error;
  }

  return (
    <div className="flex max-w-lg flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/terminais"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Voltar para terminais
        </Link>
        <h1 className="text-3xl font-bold">{terminal.name}</h1>
        <p className="text-tinta-suave">
          Código {terminal.code} · {terminal.active ? 'Ativo' : 'Desativado'}
        </p>
      </div>

      <DeviceBinding terminal={terminal} storeId={context.storeId} />
      <section className="flex flex-col gap-4 border-t-2 border-borda pt-6">
        <h2 className="text-2xl font-bold">Dados</h2>
        <TerminalForm
          values={{ code: terminal.code, name: terminal.name, kind: terminal.kind }}
          terminal={{ id: terminal.id, version: terminal.version }}
          storeId={context.storeId}
        />
      </section>
      <TerminalStatus terminal={terminal} storeId={context.storeId} />
    </div>
  );
}
