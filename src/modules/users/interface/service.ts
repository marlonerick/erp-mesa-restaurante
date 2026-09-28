import { auth } from '@/modules/auth/web';
import { type UserAdministration, userAdministration } from '../index';

let service: UserAdministration | undefined;

/**
 * Administração de usuários com as dependências reais. Aqui (e não no módulo) o encerramento de
 * sessões do Auth é injetado — assim Users não depende de Auth diretamente.
 */
export function usersAdmin(): UserAdministration {
  service ??= userAdministration({ revokeUserSessions: auth().revokeUserSessions });
  return service;
}
