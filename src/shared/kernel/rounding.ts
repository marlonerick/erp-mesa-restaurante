/**
 * Divide `numerator` por `denominator` (> 0) arredondando o meio para longe de zero
 * ("half-up" na magnitude), como definido no ADR-0003. Só usa inteiros — nunca float.
 */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError('denominador deve ser positivo');
  }
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator * sign;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return rounded * sign;
}
