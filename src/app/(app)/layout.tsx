import Link from 'next/link';
import type { ReactNode } from 'react';
import { lockScreenAction, logoutAction } from '@/modules/auth/interface/actions';
import { requireSession, SHARED_DEVICE_IDLE_TIMEOUT_SECONDS } from '@/modules/auth/web';
import { Button } from '@/ui/button';
import { InactivityLock } from './inactivity-lock';

/** Área logada: quem está usando, em qual loja, e como sair ou trocar de pessoa. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const canSeeUsers = session.context.permissions.has('users.read');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-4 border-azulejo bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-lg font-bold">{session.storeName}</p>
            <p className="text-tinta-suave">{session.userName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {session.sharedDevice ? (
              <form action={lockScreenAction}>
                <Button type="submit" variant="secondary">
                  Trocar usuário
                </Button>
              </form>
            ) : null}
            <form action={logoutAction}>
              <Button type="submit" variant="secondary">
                Sair
              </Button>
            </form>
          </div>
        </div>
        <nav aria-label="Principal" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2">
          <NavLink href="/inicio">Início</NavLink>
          {canSeeUsers ? <NavLink href="/admin/usuarios">Usuários</NavLink> : null}
          <NavLink href="/meu-pin">Meu PIN</NavLink>
          <NavLink href="/trocar-senha">Trocar senha</NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      {session.sharedDevice ? (
        <InactivityLock timeoutSeconds={SHARED_DEVICE_IDLE_TIMEOUT_SECONDS} />
      ) : null}
    </div>
  );
}

function NavLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 shrink-0 items-center px-3 font-semibold text-azulejo underline-offset-8 hover:underline"
    >
      {children}
    </Link>
  );
}
