// Segunda porta pública do módulo Auth: adaptadores para a camada web (Next.js — cookies,
// cabeçalhos, redirecionamento). O index.ts continua livre de Next para scripts e testes.
export {
  auth,
  currentDeviceUsers,
  currentSession,
  requestMeta,
  requireSession,
} from './interface/current-session';
export { SHARED_DEVICE_IDLE_TIMEOUT_SECONDS } from './domain/session-policy';
