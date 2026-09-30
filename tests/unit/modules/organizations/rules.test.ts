import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BRAZIL_TIMEZONES,
  formatPercent,
  normalizeCnpj,
  normalizeName,
  normalizeStoreCode,
  normalizeTerminalCode,
  parsePercentText,
  validateKdsAlerts,
  validateMaxOpenCashSessions,
  validateStoreSettings,
  validateTimezone,
} from '@/modules/organizations/domain/rules';
import { operationalDate, parseLocalTime } from '@/shared/kernel';

const errorCode = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'SEM_CODIGO';
  }
};

describe('CNPJ (RN-ORG-02, E3-3)', () => {
  it('aceita com ou sem pontuação e grava só os dígitos', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizeCnpj('11222333000181')).toBe('11222333000181');
  });

  it('vazio é permitido (CNPJ opcional)', () => {
    expect(normalizeCnpj(null)).toBeNull();
    expect(normalizeCnpj('   ')).toBeNull();
  });

  it.each([
    ['dígito verificador errado', '11.222.333/0001-82'],
    ['13 dígitos', '1122233300018'],
    ['letras', '11.222.333/0001-8A'],
    ['todos iguais (passa na conta, mas é inválido)', '00000000000000'],
  ])('recusa %s', (_label, cnpj) => {
    expect(errorCode(() => normalizeCnpj(cnpj))).toBe('INVALID_CNPJ');
  });
});

describe('códigos e nomes (RN-ORG-03, RN-ORG-08)', () => {
  it('código da loja vira maiúsculas', () => {
    expect(normalizeStoreCode(' centro-2 ')).toBe('CENTRO-2');
  });

  it.each(['C', 'LOJA CENTRO', 'ç', 'A'.repeat(21)])('recusa código de loja "%s"', (code) => {
    expect(errorCode(() => normalizeStoreCode(code))).toBe('INVALID_STORE_CODE');
  });

  it('código de terminal aceita 1 caractere', () => {
    expect(normalizeTerminalCode('1')).toBe('1');
    expect(errorCode(() => normalizeTerminalCode(''))).toBe('INVALID_TERMINAL_CODE');
  });

  it('nome tira espaços sobrando e respeita o tamanho', () => {
    expect(normalizeName('  Loja   do  Centro ', 2, 120)).toBe('Loja do Centro');
    expect(errorCode(() => normalizeName('A', 2, 120))).toBe('INVALID_NAME');
  });
});

describe('configurações da loja (RN-ORG-04)', () => {
  it('taxa de serviço: texto da tela → pontos-base, sem ponto flutuante', () => {
    expect(parsePercentText('10')).toBe(1000);
    expect(parsePercentText('12,5')).toBe(1250);
    expect(parsePercentText('0.75')).toBe(75);
    expect(parsePercentText('100')).toBe(10_000);
    expect(parsePercentText('7,25%')).toBe(725);
  });

  it.each(['100,01', '-1', '12,345', 'dez', ''])('recusa a taxa "%s"', (text) => {
    expect(errorCode(() => parsePercentText(text))).toBe('INVALID_SERVICE_FEE');
  });

  it('formatar e ler de volta dá o mesmo valor (qualquer taxa válida)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (bp) => {
        expect(parsePercentText(formatPercent(bp))).toBe(bp);
      }),
    );
  });

  it('caixas abertos: de 1 a 20', () => {
    expect(validateMaxOpenCashSessions(1)).toBe(1);
    expect(validateMaxOpenCashSessions(20)).toBe(20);
    expect(errorCode(() => validateMaxOpenCashSessions(0))).toBe('INVALID_MAX_OPEN_CASH');
    expect(errorCode(() => validateMaxOpenCashSessions(21))).toBe('INVALID_MAX_OPEN_CASH');
    expect(errorCode(() => validateMaxOpenCashSessions(1.5))).toBe('INVALID_MAX_OPEN_CASH');
  });

  it('fuso só da lista do Brasil', () => {
    expect(validateTimezone('America/Manaus')).toBe('America/Manaus');
    expect(errorCode(() => validateTimezone('Europe/Lisbon'))).toBe('INVALID_TIMEZONE');
  });

  it('todos os fusos da lista existem no Node (nomes IANA válidos)', () => {
    for (const zone of BRAZIL_TIMEZONES) {
      expect(() => new Intl.DateTimeFormat('pt-BR', { timeZone: zone.id })).not.toThrow();
    }
  });

  it('valida o conjunto', () => {
    expect(
      errorCode(() =>
        validateStoreSettings({
          timezone: 'America/Sao_Paulo',
          operationalDayCutoff: '25:00',
          serviceFeeBp: 1000,
          negativeStockPolicy: 'BLOQUEAR',
          maxOpenCashSessions: 1,
          kdsWarningMinutes: 10,
          kdsLateMinutes: 20,
        }),
      ),
    ).toBe('INVALID_CUTOFF');
  });
});

describe('tempos de alerta da cozinha (Q-14, E7-1)', () => {
  it('aceita amarelo antes do vermelho, de 1 a 240 minutos', () => {
    expect(validateKdsAlerts({ warningMinutes: 10, lateMinutes: 20 })).toEqual({
      warningMinutes: 10,
      lateMinutes: 20,
    });
    expect(validateKdsAlerts({ warningMinutes: 1, lateMinutes: 240 })).toEqual({
      warningMinutes: 1,
      lateMinutes: 240,
    });
  });

  it.each([
    [0, 20],
    [20, 20],
    [25, 20],
    [10, 241],
    [7.5, 20],
    [Number.NaN, 20],
  ])('recusa amarelo %s e vermelho %s', (warningMinutes, lateMinutes) => {
    expect(errorCode(() => validateKdsAlerts({ warningMinutes, lateMinutes }))).toBe(
      'INVALID_KDS_ALERTS',
    );
  });
});

describe('dia operacional (RN-ORG-13, ADR-0013)', () => {
  it.each(['5:00', '24:00', '05:60', '0500', ''])('recusa a virada "%s"', (cutoff) => {
    expect(errorCode(() => parseLocalTime(cutoff))).toBe('INVALID_CUTOFF');
  });

  it('virada à meia-noite: o dia operacional é o dia do calendário', () => {
    expect(
      operationalDate(new Date('2026-03-15T03:00:00.000Z'), 'America/Sao_Paulo', '00:00'),
    ).toBe('2026-03-15');
    expect(
      operationalDate(new Date('2026-03-15T02:59:00.000Z'), 'America/Sao_Paulo', '00:00'),
    ).toBe('2026-03-14');
  });

  it('ano bissexto: 01:00 de 01/03/2028 pertence a 29/02', () => {
    expect(
      operationalDate(new Date('2028-03-01T04:00:00.000Z'), 'America/Sao_Paulo', '05:00'),
    ).toBe('2028-02-29');
  });

  it('o dia operacional nunca fica à frente da data local nem mais de 1 dia atrás', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2035-12-31'), noInvalidDate: true }),
        fc.integer({ min: 0, max: 23 }),
        (instant, hour) => {
          const cutoff = `${String(hour).padStart(2, '0')}:00`;
          const local = operationalDate(instant, 'America/Sao_Paulo', '00:00');
          const day = operationalDate(instant, 'America/Sao_Paulo', cutoff);
          const diff = (Date.parse(local) - Date.parse(day)) / 86_400_000;
          expect([0, 1]).toContain(diff);
        },
      ),
    );
  });
});
