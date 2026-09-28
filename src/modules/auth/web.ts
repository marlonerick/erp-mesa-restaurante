// Segunda porta pública do módulo Auth: adaptadores para a camada web (Next.js — cookies,
// cabeçalhos, redirecionamento). O index.ts continua livre de Next para scripts e testes.
export { auth, currentSession, requestMeta, requireSession } from './interface/current-session';
