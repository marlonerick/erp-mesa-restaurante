import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getEnv } from '@/shared/config/env';
import { REQUEST_ID_HEADER } from '@/shared/http/request-id';
import {
  type AuthenticatedSession,
  type AuthService,
  authService,
  type RequestMeta,
} from '../index';
import { readSessionToken } from './cookies';

let service: AuthService | undefined;

/** Serviço de autenticação do processo (dependências reais). */
export function auth(): AuthService {
  service ??= authService();
  return service;
}

/** IP, navegador e requestId da requisição atual — para sessão e auditoria. */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = getEnv().TRUST_PROXY
    ? (h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null)
    : null;
  return {
    ip: forwarded !== null && forwarded.length > 0 ? forwarded.slice(0, 45) : null,
    userAgent: h.get('user-agent'),
    requestId: h.get(REQUEST_ID_HEADER) ?? crypto.randomUUID(),
  };
}

/** Sessão atual ou null. `touch: false` para consultas automáticas (RN-AUTH-15). */
export async function currentSession(
  options: { touch: boolean } = { touch: true },
): Promise<AuthenticatedSession | null> {
  return auth().authenticate(await readSessionToken(), await requestMeta(), options);
}

/**
 * Exige usuário logado. Sem sessão: vai para o login. Senha provisória: só a tela de troca de
 * senha é permitida (RN-AUTH-09).
 */
export async function requireSession(
  options: { allowPasswordChange?: boolean } = {},
): Promise<AuthenticatedSession> {
  const session = await currentSession();
  if (!session) {
    redirect('/login');
  }
  if (session.mustChangePassword && !options.allowPasswordChange) {
    redirect('/trocar-senha');
  }
  return session;
}
