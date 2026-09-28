// Limite de tentativas de login (RN-AUTH-04).

export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const LOGIN_FAILURES_PER_USER = 5;
export const LOGIN_FAILURES_PER_IP = 30;

/** Início da janela fixa que contém `now` (ex.: janelas de 15 min: 21:00, 21:15, 21:30…). */
export function rateLimitWindowStart(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}
