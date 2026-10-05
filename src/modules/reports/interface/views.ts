import type { Dashboard } from '../application/reports';

// Painel pronto para a tela e para a leitura automática (JSON: datas como texto).

export interface DashboardView extends Omit<Dashboard, 'openCash'> {
  readonly openCash: {
    readonly terminalCode: string;
    readonly terminalName: string;
    readonly openedByName: string | null;
    readonly openedAt: string;
  }[];
}

export const toDashboardView = (dashboard: Dashboard): DashboardView => ({
  ...dashboard,
  openCash: dashboard.openCash.map((cash) => ({
    terminalCode: cash.terminalCode,
    terminalName: cash.terminalName,
    openedByName: cash.openedByName,
    openedAt: cash.openedAt.toISOString(),
  })),
});
