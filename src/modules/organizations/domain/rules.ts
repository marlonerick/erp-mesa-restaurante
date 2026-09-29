import { DomainError, parseLocalTime } from '@/shared/kernel';

// Regras puras de empresa, loja e terminal (docs/modules/organizations.md §3).

/** Nome sem espaços sobrando, dentro do tamanho (RN-ORG-02, 03, 08). */
export function normalizeName(input: string, min: number, max: number): string {
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < min || name.length > max) {
    throw new DomainError(
      'INVALID_NAME',
      `Informe um nome entre ${String(min)} e ${String(max)} caracteres.`,
      'VALIDATION',
    );
  }
  return name;
}

const STORE_CODE = /^[A-Z0-9-]{2,20}$/;
const TERMINAL_CODE = /^[A-Z0-9-]{1,20}$/;

/** Código da loja em maiúsculas: 2 a 20 letras, números ou hífen (RN-ORG-03). */
export function normalizeStoreCode(input: string): string {
  const code = input.trim().toUpperCase();
  if (!STORE_CODE.test(code)) {
    throw new DomainError(
      'INVALID_STORE_CODE',
      'Use de 2 a 20 letras, números ou hífen. Ex.: CENTRO',
      'VALIDATION',
    );
  }
  return code;
}

/** Código do terminal em maiúsculas: 1 a 20 letras, números ou hífen (RN-ORG-08). */
export function normalizeTerminalCode(input: string): string {
  const code = input.trim().toUpperCase();
  if (!TERMINAL_CODE.test(code)) {
    throw new DomainError(
      'INVALID_TERMINAL_CODE',
      'Use de 1 a 20 letras, números ou hífen. Ex.: CX1',
      'VALIDATION',
    );
  }
  return code;
}

/**
 * CNPJ opcional (E3-3): vazio → null; senão 14 dígitos com os dois dígitos verificadores
 * corretos. Aceita pontuação ("11.222.333/0001-81") e grava só os números.
 */
export function normalizeCnpj(input: string | null): string | null {
  if (input === null || input.trim() === '') return null;
  const digits = input.replace(/[.\-/\s]/g, '');
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits) || !hasValidCheckDigits(digits)) {
    throw new DomainError('INVALID_CNPJ', 'CNPJ inválido. Confira os 14 dígitos.', 'VALIDATION');
  }
  return digits;
}

function checkDigit(digits: string, weights: readonly number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function hasValidCheckDigits(cnpj: string): boolean {
  const first = checkDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${String(first)}${String(second)}`);
}

/** Fusos do Brasil (lista fechada, RN-ORG-04). Rótulo é o que a tela mostra. */
export const BRAZIL_TIMEZONES = [
  { id: 'America/Sao_Paulo', label: 'Horário de Brasília (SP, RJ, MG, Sul, GO, DF) — UTC−3' },
  { id: 'America/Bahia', label: 'Bahia — UTC−3' },
  { id: 'America/Fortaleza', label: 'Nordeste (CE, RN, PB, PI, MA) — UTC−3' },
  { id: 'America/Recife', label: 'Pernambuco — UTC−3' },
  { id: 'America/Maceio', label: 'Alagoas e Sergipe — UTC−3' },
  { id: 'America/Belem', label: 'Pará (leste) e Amapá — UTC−3' },
  { id: 'America/Santarem', label: 'Pará (oeste) — UTC−3' },
  { id: 'America/Araguaina', label: 'Tocantins — UTC−3' },
  { id: 'America/Noronha', label: 'Fernando de Noronha — UTC−2' },
  { id: 'America/Cuiaba', label: 'Mato Grosso — UTC−4' },
  { id: 'America/Campo_Grande', label: 'Mato Grosso do Sul — UTC−4' },
  { id: 'America/Manaus', label: 'Amazonas — UTC−4' },
  { id: 'America/Porto_Velho', label: 'Rondônia — UTC−4' },
  { id: 'America/Boa_Vista', label: 'Roraima — UTC−4' },
  { id: 'America/Rio_Branco', label: 'Acre — UTC−5' },
  { id: 'America/Eirunepe', label: 'Amazonas (oeste) — UTC−5' },
] as const;

const TIMEZONE_IDS: ReadonlySet<string> = new Set(BRAZIL_TIMEZONES.map((zone) => zone.id));

export function validateTimezone(timezone: string): string {
  if (!TIMEZONE_IDS.has(timezone)) {
    throw new DomainError('INVALID_TIMEZONE', 'Escolha um fuso horário da lista.', 'VALIDATION');
  }
  return timezone;
}

/** Virada do dia "HH:MM" (RN-ORG-04); devolve o texto normalizado. */
export function validateCutoff(cutoff: string): string {
  parseLocalTime(cutoff);
  return cutoff;
}

export const NEGATIVE_STOCK_POLICIES = ['PERMITIR_COM_ALERTA', 'BLOQUEAR'] as const;
export type NegativeStockPolicy = (typeof NEGATIVE_STOCK_POLICIES)[number];

export const TERMINAL_KINDS = ['CAIXA', 'KDS', 'MOVEL'] as const;
export type TerminalKind = (typeof TERMINAL_KINDS)[number];

const invalidServiceFee = () =>
  new DomainError(
    'INVALID_SERVICE_FEE',
    'A taxa de serviço deve ficar entre 0% e 100%, com até 2 casas decimais.',
    'VALIDATION',
  );

/** Taxa de serviço em pontos-base (0 a 10 000 = 0% a 100%). */
export function validateServiceFeeBp(basisPoints: number): number {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw invalidServiceFee();
  }
  return basisPoints;
}

/**
 * Texto da tela ("12,5", "10", "0.75") → pontos-base, sem ponto flutuante: "12,5" vira 1250.
 * Mais de 2 casas decimais é recusado (não arredonda escondido).
 */
export function parsePercentText(text: string): number {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim().replace('%', '').trim());
  if (!match) throw invalidServiceFee();
  const decimals = (match[2] ?? '').padEnd(2, '0');
  return validateServiceFeeBp(Number(match[1]) * 100 + Number(decimals));
}

/** Pontos-base → texto da tela: 1250 → "12,5"; 1000 → "10". */
export function formatPercent(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const decimals = String(basisPoints % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return decimals ? `${String(whole)},${decimals}` : String(whole);
}

export const MAX_OPEN_CASH_LIMIT = 20;

export function validateMaxOpenCashSessions(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_OPEN_CASH_LIMIT) {
    throw new DomainError(
      'INVALID_MAX_OPEN_CASH',
      `Informe de 1 a ${String(MAX_OPEN_CASH_LIMIT)} caixas abertos ao mesmo tempo.`,
      'VALIDATION',
    );
  }
  return value;
}

/** Configurações da loja (RN-ORG-04). */
export interface StoreSettings {
  readonly timezone: string;
  /** "HH:MM", horário local. */
  readonly operationalDayCutoff: string;
  readonly serviceFeeBp: number;
  readonly negativeStockPolicy: NegativeStockPolicy;
  readonly maxOpenCashSessions: number;
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  timezone: 'America/Sao_Paulo',
  operationalDayCutoff: '05:00',
  serviceFeeBp: 1000,
  negativeStockPolicy: 'PERMITIR_COM_ALERTA',
  maxOpenCashSessions: 1,
};

export function validateStoreSettings(settings: StoreSettings): StoreSettings {
  return {
    timezone: validateTimezone(settings.timezone),
    operationalDayCutoff: validateCutoff(settings.operationalDayCutoff),
    serviceFeeBp: validateServiceFeeBp(settings.serviceFeeBp),
    negativeStockPolicy: settings.negativeStockPolicy,
    maxOpenCashSessions: validateMaxOpenCashSessions(settings.maxOpenCashSessions),
  };
}
