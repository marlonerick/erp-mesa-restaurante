import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/modules/auth/web';
import { usersAdmin } from '@/modules/users/web';
import { hasPermission, isDomainError, isId } from '@/shared/kernel';
import { NoPermission } from '../../no-permission';
import { roleLabel } from '../roles';
import { EditUserForms } from './edit-user-forms';

export const metadata: Metadata = { title: 'Editar usuário' };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context } = await requireSession();
  if (!hasPermission(context, 'users.read')) {
    return <NoPermission />;
  }
  if (!isId(id) || id === context.userId) {
    notFound();
  }

  let user;
  try {
    user = await usersAdmin().get(context, id);
  } catch (error) {
    // Usuário inexistente ou de outra loja: mesma resposta (não revela que existe)
    if (isDomainError(error) && error.code === 'USER_NOT_FOUND') notFound();
    throw error;
  }

  const inherited = user.roles.filter((role) => !user.storeRoles.includes(role));

  return (
    <div className="flex max-w-lg flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/usuarios"
          className="font-semibold text-azulejo underline-offset-4 hover:underline"
        >
          Voltar para usuários
        </Link>
        <h1 className="text-3xl font-bold">{user.name}</h1>
        <p className="text-tinta-suave">
          Usuário {user.username} · {user.status === 'ATIVO' ? 'Ativo' : 'Desativado'}
        </p>
        {inherited.length > 0 ? (
          <p className="text-tinta-suave">
            Também tem, em toda a organização: {inherited.map(roleLabel).join(', ')}.
          </p>
        ) : null}
      </div>
      <EditUserForms
        user={{ id: user.id, name: user.name, status: user.status, storeRoles: user.storeRoles }}
        can={{
          update: hasPermission(context, 'users.update'),
          disable: hasPermission(context, 'users.disable'),
        }}
      />
    </div>
  );
}
