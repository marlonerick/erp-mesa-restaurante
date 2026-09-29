import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { operationalDate } from '@/shared/kernel';

const feature = await loadFeature('tests/features/organizations/dia-operacional.feature', {
  language: 'pt',
});

/** Instante de uma hora LOCAL em um fuso de deslocamento fixo (Brasil não tem horário de verão). */
function localInstant(date: string, time: string, offsetHours: number): Date {
  return new Date(Date.parse(`${date}T${time}:00.000Z`) - offsetHours * 3_600_000);
}

describeFeature(feature, ({ ScenarioOutline, Scenario }) => {
  let timezone = '';
  let cutoff = '';
  let instant = new Date(0);

  ScenarioOutline(
    'Dia operacional com virada às 05:00 em São Paulo',
    ({ Given, When, Then }, variables) => {
      Given('uma loja no fuso "America/Sao_Paulo" com virada do dia às "05:00"', () => {
        timezone = 'America/Sao_Paulo';
        cutoff = '05:00';
      });
      When('uma venda acontece às "<hora_local>" do dia "<data_local>" no horário da loja', () => {
        instant = localInstant(String(variables.data_local), String(variables.hora_local), -3);
      });
      Then('a venda pertence ao dia operacional "<dia_operacional>"', () => {
        expect(operationalDate(instant, timezone, cutoff)).toBe(variables.dia_operacional);
      });
    },
  );

  Scenario('O fuso da loja muda o dia operacional', ({ Given, When, Then }) => {
    Given('uma loja no fuso "America/Manaus" com virada do dia às "05:00"', () => {
      timezone = 'America/Manaus';
      cutoff = '05:00';
    });
    When('uma venda acontece às "08:30" UTC do dia "2026-03-15"', () => {
      instant = new Date('2026-03-15T08:30:00.000Z');
    });
    Then('a venda pertence ao dia operacional "2026-03-14"', () => {
      expect(operationalDate(instant, timezone, cutoff)).toBe('2026-03-14');
    });
  });
});
