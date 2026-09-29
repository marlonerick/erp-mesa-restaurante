import type { ReactNode, SVGProps } from 'react';

// Ícones de traço (24×24), desenhados aqui para não depender de biblioteca. Sempre decorativos
// (aria-hidden): o texto ao lado ou o aria-label do botão é o que o leitor de tela lê.

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { readonly children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6 shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ICONS = {
  inicio: (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </Icon>
  ),
  usuarios: (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </Icon>
  ),
  empresa: (
    <Icon>
      <path d="M4 21V5l8-2v18" />
      <path d="M12 8h8v13" />
      <path d="M2 21h20" />
      <path d="M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01" />
    </Icon>
  ),
  lojas: (
    <Icon>
      <path d="M3 9h18l-1.5-5h-15z" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 11v10h14V11" />
      <path d="M10 21v-5h4v5" />
    </Icon>
  ),
  terminais: (
    <Icon>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Icon>
  ),
  pin: (
    <Icon>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </Icon>
  ),
  senha: (
    <Icon>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Icon>
  ),
  trocarUsuario: (
    <Icon>
      <path d="M16 3h5v5" />
      <path d="M21 3l-6 6" />
      <path d="M8 21H3v-5" />
      <path d="M3 21l6-6" />
      <circle cx="12" cy="12" r="2.5" />
    </Icon>
  ),
  sair: (
    <Icon>
      <path d="M14 4h5v16h-5" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h10" />
    </Icon>
  ),
  menu: (
    <Icon>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  ),
  fechar: (
    <Icon>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  ),
  recolher: (
    <Icon>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  ),
  expandir: (
    <Icon>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  ),
  trocarLoja: (
    <Icon>
      <path d="M7 10l5-5 5 5" />
      <path d="M7 14l5 5 5-5" />
    </Icon>
  ),
  // Cardápio (Etapa 4)
  produtos: (
    <Icon>
      <path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
      <path d="M18 7h2v13" />
      <path d="M8 9h6M8 13h6" />
    </Icon>
  ),
  categorias: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  adicionais: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </Icon>
  ),
  // Estoque (Etapa 5)
  estoque: (
    <Icon>
      <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </Icon>
  ),
  fichas: (
    <Icon>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M9 10h6M9 14h6M9 18h3" />
    </Icon>
  ),
  disponibilidade: (
    <Icon>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <circle cx="16" cy="12" r="3" />
    </Icon>
  ),
} as const;

export type IconName = keyof typeof ICONS;
