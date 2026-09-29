import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { auth, requireSession, SHARED_DEVICE_IDLE_TIMEOUT_SECONDS } from '@/modules/auth/web';
import { hasPermission } from '@/shared/kernel';
import { InactivityLock } from './inactivity-lock';
import { type NavGroup, Sidebar, type SidebarMode } from './sidebar';

const MODES: readonly SidebarMode[] = ['auto', 'collapsed', 'expanded'];

/** Área logada: menu lateral (E3-4) com a loja ativa, o terminal e o que a pessoa pode usar. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const { context } = session;
  const stores = await auth().listSessionStores(context);
  const savedMode = (await cookies()).get('erp_sidebar')?.value;
  const initialMode = MODES.find((mode) => mode === savedMode) ?? 'auto';

  // Só aparece o que a pessoa pode usar NESTA loja (o servidor confere de novo em cada tela)
  const admin = [
    hasPermission(context, 'users.read') && {
      href: '/admin/usuarios',
      label: 'Usuários',
      icon: 'usuarios' as const,
    },
    hasPermission(context, 'stores.manage') && {
      href: '/admin/empresa',
      label: 'Empresa',
      icon: 'empresa' as const,
    },
    hasPermission(context, 'stores.manage') && {
      href: '/admin/lojas',
      label: 'Lojas',
      icon: 'lojas' as const,
    },
    hasPermission(context, 'terminals.manage') && {
      href: '/admin/terminais',
      label: 'Terminais',
      icon: 'terminais' as const,
    },
  ].filter((item) => item !== false);

  const operation = [
    { href: '/inicio', label: 'Início', icon: 'inicio' as const },
    hasPermission(context, 'products.availability') && {
      href: '/disponibilidade',
      label: 'Disponibilidade',
      icon: 'disponibilidade' as const,
    },
  ].filter((item) => item !== false);

  // Cadastro do cardápio (Etapa 4): quem pode alterar produtos
  const menu = hasPermission(context, 'products.update')
    ? [
        { href: '/catalogo/produtos', label: 'Produtos', icon: 'produtos' as const },
        { href: '/catalogo/categorias', label: 'Categorias', icon: 'categorias' as const },
        { href: '/catalogo/adicionais', label: 'Adicionais', icon: 'adicionais' as const },
      ]
    : [];

  // Estoque e fichas técnicas (Etapa 5): a cozinha consulta, o gerente lança
  const stock = [
    hasPermission(context, 'inventory.read') && {
      href: '/estoque',
      label: 'Estoque',
      icon: 'estoque' as const,
    },
    hasPermission(context, 'recipes.read') && {
      href: '/fichas-tecnicas',
      label: 'Fichas técnicas',
      icon: 'fichas' as const,
    },
  ].filter((item) => item !== false);

  const groups: NavGroup[] = [
    { label: 'Operação', items: operation },
    ...(menu.length > 0 ? [{ label: 'Cardápio', items: menu }] : []),
    ...(stock.length > 0 ? [{ label: 'Estoque', items: stock }] : []),
    ...(admin.length > 0 ? [{ label: 'Administração', items: admin }] : []),
  ];

  return (
    <div className="min-h-dvh md:flex">
      <Sidebar
        userName={session.userName}
        storeName={session.storeName}
        terminalName={session.terminalName}
        stores={stores}
        currentStoreId={context.storeId}
        groups={groups}
        sharedDevice={session.sharedDevice}
        initialMode={initialMode}
      />
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-8 md:px-8">{children}</main>
      {session.sharedDevice ? (
        <InactivityLock timeoutSeconds={SHARED_DEVICE_IDLE_TIMEOUT_SECONDS} />
      ) : null}
    </div>
  );
}
