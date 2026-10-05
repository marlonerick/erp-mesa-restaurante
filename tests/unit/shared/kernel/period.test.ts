import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  operationalDate,
  operationalDayStart,
  parseLocalDate,
  validatePeriod,
} from '@/shared/kernel';

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'SEM_CODIGO';
  }
};

describe('datas locais e períodos de relatório', () => {
  it('aceita só datas que existem no calendário', () => {
    expect(parseLocalDate(' 2024-02-29 ')).toBe('2024-02-29');
    expect(code(() => parseLocalDate('2026-02-29'))).toBe('INVALID_DATE');
    expect(code(() => parseLocalDate('2026-13-01'))).toBe('INVALID_DATE');
    expect(code(() => parseLocalDate('14/03/2026'))).toBe('INVALID_DATE');
  });

  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-03-14', '2026-03-20')).toBe(6);
  });

  it('addDays e daysBetween são inversos (qualquer data e deslocamento)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31'), noInvalidDate: true }),
        fc.integer({ min: -800, max: 800 }),
        (date, days) => {
          const start = date.toISOString().slice(0, 10);
          expect(daysBetween(start, addDays(start, days))).toBe(days);
        },
      ),
    );
  });

  it('período de 1 a 366 dias, com o início antes do fim', () => {
    expect(validatePeriod('2026-03-14', '2026-03-14')).toEqual({
      from: '2026-03-14',
      to: '2026-03-14',
    });
    expect(validatePeriod('2026-01-01', '2027-01-01')).toEqual({
      from: '2026-01-01',
      to: '2027-01-01',
    });
    expect(code(() => validatePeriod('2026-01-01', '2027-01-02'))).toBe('INVALID_PERIOD');
    expect(code(() => validatePeriod('2026-03-15', '2026-03-14'))).toBe('INVALID_PERIOD');
    expect(code(() => validatePeriod('2026-03-15', 'ontem'))).toBe('INVALID_DATE');
  });
});

describe('início do dia operacional (limites da auditoria)', () => {
  it('dia de 14/03 com virada às 05:00 em São Paulo começa às 08:00 UTC', () => {
    expect(operationalDayStart('2026-03-14', 'America/Sao_Paulo', '05:00').toISOString()).toBe(
      '2026-03-14T08:00:00.000Z',
    );
  });

  it('o instante de início pertence ao próprio dia; um segundo antes, ao dia anterior', () => {
    const zones = ['America/Sao_Paulo', 'America/Manaus', 'Europe/Lisbon', 'America/New_York'];
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
        fc.constantFrom(...zones),
        fc.constantFrom('00:00', '04:00', '05:00', '06:30'),
        (date, zone, cutoff) => {
          const day = date.toISOString().slice(0, 10);
          const start = operationalDayStart(day, zone, cutoff);
          expect(operationalDate(start, zone, cutoff)).toBe(day);
          expect(operationalDate(new Date(start.getTime() - 1000), zone, cutoff)).toBe(
            addDays(day, -1),
          );
        },
      ),
    );
  });
});
