/** Relógio injetável: casos de uso nunca chamam `new Date()` diretamente (README B.5). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
