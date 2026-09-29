// Agregador do schema Drizzle: todas as tabelas, para o drizzle-kit gerar as migrations e para o
// cliente do banco. Cada módulo acessa apenas as SUAS tabelas, pelos próprios repositórios.
// Usa caminhos relativos porque o drizzle-kit não resolve o atalho "@/".
export { idempotencyRecord } from '../idempotency/schema';
export * from './tables/audit';
export * from './tables/auth';
export * from './tables/authorization';
export * from './tables/organizations';
export * from './tables/terminals';
export * from './tables/users';
