import { storeAccess } from '@/modules/authorization';
import { getDatabase } from '@/shared/db/client';
import { runInTransaction } from '@/shared/db/transaction';
import type { RequestContext } from '@/shared/kernel';
import {
  getStoreSettings,
  type OrganizationAdministration,
  organizationAdministration,
  type StoreSettings,
} from '../index';

/** Configurações da loja ativa, para as telas (ex.: dia de trabalho no início). */
export function loadStoreSettings(ctx: RequestContext): Promise<StoreSettings | null> {
  return runInTransaction(getDatabase().db, (tx) =>
    getStoreSettings(tx, { organizationId: ctx.organizationId, storeId: ctx.storeId }),
  );
}

let service: OrganizationAdministration | undefined;

/**
 * Administração de empresa, lojas e terminais com as dependências reais. Aqui (e não no núcleo do
 * módulo) a consulta de permissões do Authorization é injetada — Authorization já depende de
 * Organizations, e a injeção evita a dependência circular (ADR-0014).
 */
export function orgAdmin(): OrganizationAdministration {
  service ??= organizationAdministration({ access: storeAccess });
  return service;
}
