// Kernel compartilhado: tipos de valor puros, sem dependência de framework, banco ou logger.
export { type Clock, systemClock } from './clock';
export { DomainError, type DomainErrorKind, isDomainError } from './errors';
export { type Id, isId, newId, parseId } from './id';
export { Money } from './money';
export { Percentage } from './percentage';
export { type BaseUnit, Quantity } from './quantity';
export { type CostLine, totalCost, UnitCost } from './unit-cost';
export { type MeasureUnit, toBaseQuantity } from './units';
