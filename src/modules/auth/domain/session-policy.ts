// Regras de duração da sessão (RN-AUTH-06, decisões Q-12 e E2-3).

export const IDLE_TIMEOUT_SECONDS = 12 * 60 * 60;
export const SHARED_DEVICE_IDLE_TIMEOUT_SECONDS = 3 * 60;
export const ABSOLUTE_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const MAX_TOUCH_INTERVAL_SECONDS = 5 * 60;

export type SessionStatus = 'ATIVA' | 'EXPIRADA_INATIVIDADE' | 'EXPIRADA_LIMITE' | 'ENCERRADA';

export interface SessionTimes {
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly idleTimeoutSeconds: number;
  readonly revokedAt: Date | null;
}

export function idleTimeoutFor(sharedDevice: boolean): number {
  return sharedDevice ? SHARED_DEVICE_IDLE_TIMEOUT_SECONDS : IDLE_TIMEOUT_SECONDS;
}

export function sessionExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ABSOLUTE_LIFETIME_SECONDS * 1000);
}

export function sessionStatus(session: SessionTimes, now: Date): SessionStatus {
  if (session.revokedAt !== null) {
    return 'ENCERRADA';
  }
  if (now.getTime() >= session.expiresAt.getTime()) {
    return 'EXPIRADA_LIMITE';
  }
  if (now.getTime() - session.lastSeenAt.getTime() > session.idleTimeoutSeconds * 1000) {
    return 'EXPIRADA_INATIVIDADE';
  }
  return 'ATIVA';
}

/**
 * Evita gravar o "último uso" a cada requisição: renova no máximo a cada 5 min — ou a cada 1/3 do
 * tempo de inatividade, para que a sessão de 3 min do aparelho compartilhado funcione.
 */
export function shouldTouchSession(session: SessionTimes, now: Date): boolean {
  const interval = Math.min(MAX_TOUCH_INTERVAL_SECONDS, Math.floor(session.idleTimeoutSeconds / 3));
  return now.getTime() - session.lastSeenAt.getTime() >= interval * 1000;
}
