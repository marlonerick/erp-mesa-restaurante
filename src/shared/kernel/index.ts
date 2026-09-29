// Kernel compartilhado: tipos de valor puros, sem dependência de framework, banco ou logger.
export { type Clock, systemClock } from './clock';
export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './credentials';
export { DomainError, type DomainErrorKind, isDomainError } from './errors';
export { type Id, isId, newId, parseId } from './id';
export { Money } from './money';
export { Percentage } from './percentage';
export {
  isPermission,
  type Permission,
  PERMISSIONS,
  SYSTEM_ROLES,
  type SystemRole,
} from './permissions';
export { hasPermission, type RequestContext, requirePermission } from './request-context';
export { type BaseUnit, Quantity } from './quantity';
export { type CostLine, totalCost, UnitCost } from './unit-cost';
export { type MeasureUnit, toBaseQuantity } from './units';
