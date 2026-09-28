// Limpeza periódica (LGPD, decisão Q-13b). Rode diariamente (agendador do servidor/cron).
// Apaga: sessões encerradas/expiradas há 90+ dias, vínculos de aparelho sem uso há 90+ dias,
// contadores de tentativas e autorizações do gerente com 1+ dia, chaves de idempotência com 7+ dias.
// NÃO apaga a auditoria nem dados de negócio (guardados para sempre — Q-13).
// Uso: npm run maintenance:purge
import { authService } from '@/modules/auth';
import { getDatabase } from '@/shared/db/client';
import { purgeIdempotencyRecords } from '@/shared/idempotency/maintenance';

const { db, close } = getDatabase();
try {
  const removed = await authService({ db }).purgeExpiredData();
  const idempotency = await purgeIdempotencyRecords(db, new Date());
  console.info('Limpeza concluída. Registros removidos:');
  console.table({ ...removed, chavesDeIdempotencia: idempotency });
} finally {
  await close();
}
