import { formatMoneyText } from '@/shared/kernel';

/** Centavos → "R$ 1.234,50" para mostrar na tela (a regra de leitura/escrita fica no kernel). */
export const formatBRL = (cents: number) => `R$ ${formatMoneyText(cents)}`;
