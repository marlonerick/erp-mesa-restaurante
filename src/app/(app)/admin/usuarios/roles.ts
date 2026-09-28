import type { SystemRole } from '@/shared/kernel';

/** Nomes dos perfis como a equipe fala. */
export const ROLE_LABELS: Readonly<Record<SystemRole, string>> = {
  ADMIN: 'Administrador',
  GERENTE: 'Gerente',
  CAIXA: 'Caixa',
  GARCOM: 'Garçom',
  COZINHA: 'Cozinha',
};

export function roleLabel(code: string): string {
  return (ROLE_LABELS as Record<string, string>)[code] ?? code;
}

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [SystemRole, string][];
