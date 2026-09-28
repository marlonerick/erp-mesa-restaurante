import { cookies } from 'next/headers';
import { getEnv } from '@/shared/config/env';
import { ABSOLUTE_LIFETIME_SECONDS } from '../domain/session-policy';

// Cookies HttpOnly (o JavaScript da página não lê), SameSite=Lax e, em HTTPS, Secure + prefixo
// __Host- (o navegador garante que só este site, na raiz, grava o cookie) — RN-AUTH-05.
const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60; // máximo aceito pelos navegadores

function names() {
  const secure = getEnv().APP_ORIGIN.startsWith('https://');
  const prefix = secure ? '__Host-' : '';
  return { secure, session: `${prefix}erp_session`, device: `${prefix}erp_device` };
}

function options(maxAge: number, secure: boolean) {
  return { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge };
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(names().session)?.value ?? null;
}

export async function writeSessionToken(token: string): Promise<void> {
  const { session, secure } = names();
  (await cookies()).set(session, token, options(ABSOLUTE_LIFETIME_SECONDS, secure));
}

export async function clearSessionToken(): Promise<void> {
  (await cookies()).delete(names().session);
}

export async function readDeviceToken(): Promise<string | null> {
  return (await cookies()).get(names().device)?.value ?? null;
}

export async function writeDeviceToken(token: string): Promise<void> {
  const { device, secure } = names();
  (await cookies()).set(device, token, options(DEVICE_COOKIE_MAX_AGE, secure));
}
