export const REQUEST_ID_HEADER = 'x-request-id';

// Apenas caracteres seguros: impede injeção de quebras de linha ou lixo nos logs
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Reaproveita o id vindo do balanceador se for seguro; caso contrário gera um novo. */
export function resolveRequestId(incoming: string | null): string {
  return incoming !== null && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
}
