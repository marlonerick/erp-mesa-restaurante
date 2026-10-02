import type { PosWorld } from './pos-world';

type Step = (text: string, run: () => Promise<void>) => void;

/**
 * Contexto comum de conta e pagamento: gerente com PIN, caixa no terminal CX01, garçom, cardápio,
 * mesa 10 com 2 X-Burger e 1 Refrigerante lata enviados (R$ 71,00 + 10% = R$ 78,10).
 */
export function posBackground(w: PosWorld, Given: Step, And: Step) {
  Given('que "carla" é gerente na loja "Centro" com o PIN "246810"', () =>
    w.first('carla', 'GERENTE', '246810'),
  );
  And('"bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"', () =>
    w.withTerminal('bia', 'CAIXA', 'CX01'),
  );
  And('"joão" é garçom na loja "Centro"', () => w.person('joão', 'GARCOM'));
  And('a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"', () =>
    w.sells('X-Burger', '32,00', { modifier: ['Bacon', '5,00'] }),
  );
  And('a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo', () =>
    w.sells('Refrigerante lata', '7,00', { noPrep: true }),
  );
  And('existe a mesa "10" no "Centro"', () => w.createTable('10'));
  And('"joão" enviou 2 "X-Burger" e 1 "Refrigerante lata" para a mesa "10"', () =>
    w.sendTo('joão', '10', [
      { quantity: 2, product: 'X-Burger' },
      { quantity: 1, product: 'Refrigerante lata' },
    ]),
  );
}
