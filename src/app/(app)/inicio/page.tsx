import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';

export const metadata: Metadata = { title: 'Início' };

export default async function HomePage() {
  const session = await requireSession();
  const firstName = session.userName.split(' ')[0] ?? session.userName;
  const canManageUsers = session.context.permissions.has('users.read');

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Olá, {firstName}.</h1>
        <p className="text-lg text-tinta-suave">Você está na loja {session.storeName}.</p>
      </div>

      <ul className="flex flex-col divide-y divide-borda border-y border-borda">
        {canManageUsers ? (
          <HomeLink href="/admin/usuarios" title="Usuários">
            Cadastre a equipe, defina perfis e redefina senhas.
          </HomeLink>
        ) : null}
        <HomeLink href="/meu-pin" title="Meu PIN">
          Cadastre o PIN de 6 dígitos para trocar de usuário no tablet e autorizar ações.
        </HomeLink>
      </ul>

      <p className="text-tinta-suave">
        As telas de mesas, cozinha e caixa chegam nas próximas etapas.
      </p>
    </div>
  );
}

function HomeLink({
  href,
  title,
  children,
}: {
  readonly href: string;
  readonly title: string;
  readonly children: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex flex-col gap-1 py-4 hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
      >
        <span className="text-xl font-bold text-azulejo">{title}</span>
        <span className="text-tinta-suave">{children}</span>
      </Link>
    </li>
  );
}
