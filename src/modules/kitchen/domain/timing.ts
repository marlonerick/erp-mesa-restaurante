// Tempo e alertas da cozinha (RN-KDS-09). Sem dependências: também roda no tablet.

export type AlertLevel = 'NORMAL' | 'ATENCAO' | 'ATRASADO';

/** A cor sempre vem com o texto (acessibilidade). */
export const ALERT_LABEL: Readonly<Record<AlertLevel, string>> = {
  NORMAL: 'No prazo',
  ATENCAO: 'Atenção',
  ATRASADO: 'Atrasado',
};

export interface AlertThresholds {
  readonly warningMinutes: number;
  readonly lateMinutes: number;
}

const MINUTE_MS = 60_000;

/** "Atenção" a partir do amarelo, "Atrasado" a partir do vermelho (os limites já contam). */
export function alertLevel(elapsedMs: number, thresholds: AlertThresholds): AlertLevel {
  if (elapsedMs >= thresholds.lateMinutes * MINUTE_MS) return 'ATRASADO';
  if (elapsedMs >= thresholds.warningMinutes * MINUTE_MS) return 'ATENCAO';
  return 'NORMAL';
}

/** Cronômetro: "0:45", "12:05", "1:02:03". Tempo negativo (relógio adiantado) vira zero. */
export function formatElapsed(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${String(minutes)}:${seconds}`;
}
