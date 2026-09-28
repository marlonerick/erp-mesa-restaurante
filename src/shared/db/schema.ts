// Agregador do schema Drizzle. Cada módulo exporta suas tabelas a partir de infrastructure/
// e elas são registradas aqui para o drizzle-kit gerar as migrations.
// Usa caminhos relativos porque o drizzle-kit não resolve o atalho "@/".
export { idempotencyRecord } from '../idempotency/schema';
