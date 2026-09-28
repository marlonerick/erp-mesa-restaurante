import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/modules/auth/web';
import { usersAdmin } from '@/modules/users/web';
import { hasPermission } from '@/shared/kernel';
import { CreateUserForm } from './create-user-form';
import { roleLabel } from './roles';

export const metadata: Metadata = { title: 'Usuários' };

export default async function UsersPage() {
  const { context, storeName } = await requireSession();
  if (!hasPermission(context, 'users.read')) {
    return <NoPermission />;
  }
  const users = await usersAdmin().list(context);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Usuários</h1>
        <p className="text-tinta-suave">Equipe com acesso à loja {storeName}.</p>
      </div>

      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Usuários da loja</caption>
        <thead className="hidden border-b-2 border-tinta sm:table-header-group">
          <tr>
            <th scope="col" className="py-2 pr-4">
              Nome
            </th>
            <th scope="col" className="py-2 pr-4">
              Usuário
            </th>
            <th scope="col" className="py-2 pr-4">
              Perfis
            </th>
            <th scope="col" className="py-2 pr-4">
              Situação
            </th>
            <th scope="col" className="py-2">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="flex flex-col border-b border-borda py-3 sm:table-row sm:py-0"
            >
              <td className="font-semibold sm:py-3 sm:pr-4">{user.name}</td>
              <td className="text-tinta-suave sm:py-3 sm:pr-4">{user.username}</td>
              <td className="sm:py-3 sm:pr-4">{user.roles.map(roleLabel).join(', ')}</td>
              <td className="sm:py-3 sm:pr-4">
                {user.status === 'ATIVO' ? (
                  'Ativo'
                ) : (
                  <span className="font-semibold text-alerta">Desativado</span>
                )}
              </td>
              <td className="sm:py-3">
                {user.id === context.userId ? (
                  <span className="inline-flex min-h-12 items-center text-tinta-suave">Você</span>
                ) : (
                  <Link
                    href={`/admin/usuarios/${user.id}`}
                    className="inline-flex min-h-12 items-center font-semibold text-azulejo underline-offset-4 hover:underline"
                    aria-label={`Editar ${user.name}`}
                  >
                    Editar
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasPermission(context, 'users.create') ? (
        <section aria-labelledby="novo-usuario" className="flex max-w-lg flex-col gap-5">
          <h2 id="novo-usuario" className="text-2xl font-bold">
            Cadastrar usuário
          </h2>
          <p className="text-tinta-suave">
            A pessoa troca a senha provisória no primeiro acesso. Os perfis valem para a loja{' '}
            {storeName}.
          </p>
          <CreateUserForm />
        </section>
      ) : null}
    </div>
  );
}

export function NoPermission() {
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <h1 className="text-3xl font-bold">Sem permissão</h1>
      <p className="text-lg">
        Seu perfil não tem acesso a esta tela. Fale com o gerente se precisar.
      </p>
    </div>
  );
}
