'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  lockScreenAction,
  logoutAction,
  switchStoreAction,
} from '@/modules/auth/interface/actions';
import { cn } from '@/ui/cn';
import { ICONS, type IconName } from '@/ui/icons';

export type SidebarMode = 'auto' | 'collapsed' | 'expanded';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

interface Props {
  readonly userName: string;
  readonly storeName: string;
  readonly terminalName: string | null;
  readonly stores: readonly { readonly id: string; readonly name: string }[];
  readonly currentStoreId: string;
  readonly groups: readonly NavGroup[];
  readonly sharedDevice: boolean;
  readonly initialMode: SidebarMode;
}

const MODE_COOKIE = 'erp_sidebar';
const WIDE_SCREEN = '(min-width: 80rem)'; // mesmo ponto do "xl" do Tailwind

// Tela larga agora? (o modo "auto" recolhe em telas menores — tablet)
const isWideScreen = () => window.matchMedia(WIDE_SCREEN).matches;
function subscribeWideScreen(onChange: () => void) {
  const query = window.matchMedia(WIDE_SCREEN);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

/**
 * Menu lateral (E3-4). Computador: fixo, recolhível (só ícones). Tablet: começa recolhido.
 * Celular: gaveta aberta pelo botão ☰ (elemento <dialog>: prende o foco e fecha com Esc).
 * Os itens chegam já filtrados pelas permissões da loja ativa; o servidor bloqueia de novo.
 */
export function Sidebar(props: Props) {
  const [mode, setMode] = useState<SidebarMode>(props.initialMode);
  const drawer = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  // Navegou pela gaveta do celular: fecha
  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);

  const wideScreen = useSyncExternalStore(subscribeWideScreen, isWideScreen, () => true);
  const collapsed = mode === 'collapsed' || (mode === 'auto' && !wideScreen);

  function toggle() {
    const next: SidebarMode = collapsed ? 'expanded' : 'collapsed';
    setMode(next);
    // Lembrado por 1 ano; lido pelo servidor para a tela já abrir do jeito certo (sem "piscar")
    document.cookie = `${MODE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <>
      {/* Celular: barra do topo com o botão do menu */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b-4 border-azulejo bg-white px-2 py-1 md:hidden">
        <button
          type="button"
          onClick={() => drawer.current?.showModal()}
          aria-label="Abrir menu"
          className="flex size-12 items-center justify-center rounded-md text-azulejo hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
        >
          {ICONS.menu}
        </button>
        <div className="min-w-0">
          <p className="truncate font-bold">{props.storeName}</p>
          <p className="truncate text-sm text-tinta-suave">
            {props.userName}
            {props.terminalName ? ` · ${props.terminalName}` : ''}
          </p>
        </div>
      </div>

      <dialog
        ref={drawer}
        aria-label="Menu"
        onClick={(event) => {
          // Toque fora do painel (no fundo escurecido) fecha a gaveta
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-0 h-dvh max-h-dvh w-80 max-w-[85vw] bg-transparent p-0 backdrop:bg-tinta/50"
      >
        <div className="relative flex h-full flex-col bg-azulejo-escuro text-white">
          <button
            type="button"
            onClick={() => drawer.current?.close()}
            aria-label="Fechar menu"
            className="absolute top-2 right-2 z-10 flex size-12 items-center justify-center rounded-md text-white hover:bg-white/15 focus-visible:outline-3 focus-visible:outline-white"
          >
            {ICONS.fechar}
          </button>
          <SidebarContent {...props} mode="expanded" pathname={pathname} insetEnd />
        </div>
      </dialog>

      {/* Computador e tablet */}
      <aside
        id="menu-lateral"
        data-mode={mode}
        aria-label="Menu lateral"
        className={cn(
          'group sticky top-0 hidden h-dvh shrink-0 flex-col bg-azulejo-escuro text-white md:flex',
          mode === 'auto' && 'w-20 xl:w-72',
          mode === 'collapsed' && 'w-20',
          mode === 'expanded' && 'w-72',
        )}
      >
        <SidebarContent {...props} mode={mode} pathname={pathname} />
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="menu-lateral"
          className="flex min-h-12 items-center gap-3 border-t border-white/15 px-7 text-sm font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-white"
        >
          <span className="group-data-[mode=collapsed]:hidden group-data-[mode=auto]:max-xl:hidden">
            {ICONS.recolher}
          </span>
          <span className="hidden group-data-[mode=collapsed]:inline group-data-[mode=auto]:max-xl:inline">
            {ICONS.expandir}
          </span>
          <Label>{collapsed ? 'Expandir menu' : 'Recolher menu'}</Label>
        </button>
      </aside>
    </>
  );
}

/**
 * Seletor de loja (<details> nativo) que fecha com Esc — devolvendo o foco — e com toque fora.
 */
function StoreSwitcher({ children }: { readonly children: React.ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(returnFocus: boolean) {
      const element = details.current;
      if (!element?.open) return;
      element.open = false;
      if (returnFocus) element.querySelector('summary')?.focus();
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    const onPointer = (event: PointerEvent) => {
      if (!details.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);
  return <details ref={details}>{children}</details>;
}

/** Texto do item: some visualmente no menu recolhido, mas continua para o leitor de tela. */
function Label({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="truncate group-data-[mode=collapsed]:sr-only group-data-[mode=auto]:max-xl:sr-only">
      {children}
    </span>
  );
}

function SidebarContent({
  mode,
  pathname,
  insetEnd = false,
  ...props
}: Props & {
  readonly mode: SidebarMode;
  readonly pathname: string;
  /** Gaveta do celular: reserva o canto direito para o botão de fechar. */
  readonly insetEnd?: boolean;
}) {
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const otherStores = props.stores.filter((store) => store.id !== props.currentStoreId);

  return (
    <div data-mode={mode} className="group flex min-h-0 flex-1 flex-col">
      {/* Faixa de azulejo + loja ativa (troca de loja em 1 clique — RN-ORG-12) */}
      <div className="azulejo-pattern h-3 shrink-0" />
      <div className={cn('relative border-b border-white/15 px-3 py-3', insetEnd && 'pr-14')}>
        {otherStores.length > 0 ? (
          <StoreSwitcher>
            <summary
              title={props.storeName}
              className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-md px-3 hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-white [&::-webkit-details-marker]:hidden"
            >
              {ICONS.lojas}
              <StoreText {...props} />
              <span className="ml-auto group-data-[mode=collapsed]:hidden group-data-[mode=auto]:max-xl:hidden">
                {ICONS.trocarLoja}
              </span>
            </summary>
            <div className="absolute top-full left-3 z-20 mt-1 w-64 rounded-md bg-white p-2 text-tinta shadow-lg ring-1 ring-borda">
              <p className="px-3 py-2 text-sm font-semibold text-tinta-suave">Trocar de loja</p>
              <ul>
                {otherStores.map((store) => (
                  <li key={store.id}>
                    <form action={switchStoreAction}>
                      <input type="hidden" name="storeId" value={store.id} />
                      <button
                        type="submit"
                        className="flex min-h-12 w-full items-center rounded-md px-3 text-left font-semibold text-azulejo hover:bg-azulejo-claro focus-visible:outline-3 focus-visible:outline-azulejo"
                      >
                        {store.name}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          </StoreSwitcher>
        ) : (
          <div className="flex min-h-12 items-center gap-3 px-3" title={props.storeName}>
            {ICONS.lojas}
            <StoreText {...props} />
          </div>
        )}
      </div>

      <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 py-4">
        {props.groups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-1 px-3 text-xs font-bold tracking-wider text-white/60 uppercase group-data-[mode=collapsed]:sr-only group-data-[mode=auto]:max-xl:sr-only">
              {group.label}
            </p>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} current={isCurrent(item.href)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/15 px-3 py-3">
        <p
          className="truncate px-3 pb-2 text-sm text-white/70 group-data-[mode=collapsed]:sr-only group-data-[mode=auto]:max-xl:sr-only"
          title={props.userName}
        >
          {props.userName}
        </p>
        <ul className="flex flex-col gap-1">
          <li>
            <NavLink
              item={{ href: '/meu-pin', label: 'Meu PIN', icon: 'pin' }}
              current={isCurrent('/meu-pin')}
            />
          </li>
          <li>
            <NavLink
              item={{ href: '/trocar-senha', label: 'Trocar senha', icon: 'senha' }}
              current={isCurrent('/trocar-senha')}
            />
          </li>
          {props.sharedDevice ? (
            <li>
              <form action={lockScreenAction}>
                <MenuButton icon="trocarUsuario">Trocar usuário</MenuButton>
              </form>
            </li>
          ) : null}
          <li>
            <form action={logoutAction}>
              <MenuButton icon="sair">Sair</MenuButton>
            </form>
          </li>
        </ul>
      </div>
    </div>
  );
}

function StoreText(props: Pick<Props, 'storeName' | 'terminalName'>) {
  return (
    <span className="flex min-w-0 flex-col group-data-[mode=collapsed]:sr-only group-data-[mode=auto]:max-xl:sr-only">
      <span className="truncate font-bold">{props.storeName}</span>
      <span className="truncate text-sm text-white/70">
        {props.terminalName ?? 'Aparelho sem terminal'}
      </span>
    </span>
  );
}

const itemClass =
  'flex min-h-12 w-full items-center gap-3 rounded-md px-3 font-semibold focus-visible:outline-3 focus-visible:outline-white';

function NavLink({ item, current }: { readonly item: NavItem; readonly current: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={current ? 'page' : undefined}
      className={cn(
        itemClass,
        // Página atual: "azulejo" branco com a moldura — o destaque da identidade visual
        current ? 'azulejo-tile bg-white text-azulejo' : 'text-white hover:bg-white/10',
      )}
    >
      {ICONS[item.icon]}
      <Label>{item.label}</Label>
    </Link>
  );
}

function MenuButton({ icon, children }: { readonly icon: IconName; readonly children: string }) {
  return (
    <button
      type="submit"
      title={children}
      className={cn(itemClass, 'text-white hover:bg-white/10')}
    >
      {ICONS[icon]}
      <Label>{children}</Label>
    </button>
  );
}
