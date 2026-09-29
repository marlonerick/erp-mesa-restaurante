import { recordAuditFromContext } from '@/modules/audit';
import { MYSQL_ERRNO, mysqlErrno } from '@/shared/db/mysql-errors';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import {
  DomainError,
  type Id,
  newId,
  type RequestContext,
  requirePermission,
} from '@/shared/kernel';
import {
  DEFAULT_STORE_SETTINGS,
  normalizeCnpj,
  normalizeName,
  normalizeStoreCode,
  normalizeTerminalCode,
  type StoreSettings,
  type TerminalKind,
  validateStoreSettings,
} from '../domain/rules';
import type {
  CompanyData,
  CompanyRecord,
  OrganizationsDependencies,
  RecordStatus,
  StoreData,
  StoreRecord,
  TerminalData,
  TerminalRecord,
} from './ports';

// ---- Erros (docs/modules/organizations.md §5) ----

const errors = {
  forbidden: () =>
    new DomainError('FORBIDDEN', 'Você não tem permissão para esta ação.', 'FORBIDDEN', {
      permission: 'stores.manage',
    }),
  companyNotFound: () =>
    new DomainError('COMPANY_NOT_FOUND', 'Empresa não encontrada.', 'NOT_FOUND'),
  storeNotFound: () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND'),
  terminalNotFound: () =>
    new DomainError('TERMINAL_NOT_FOUND', 'Terminal não encontrado.', 'NOT_FOUND'),
  concurrent: () =>
    new DomainError(
      'CONCURRENT_MODIFICATION',
      'Outra pessoa alterou estes dados. Recarregue a página e tente de novo.',
      'CONFLICT',
    ),
  cnpjTaken: () => new DomainError('CNPJ_TAKEN', 'Este CNPJ já está cadastrado.', 'CONFLICT'),
  storeCodeTaken: () =>
    new DomainError(
      'STORE_CODE_TAKEN',
      'Já existe uma loja com este código nesta empresa.',
      'CONFLICT',
    ),
  terminalCodeTaken: () =>
    new DomainError(
      'TERMINAL_CODE_TAKEN',
      'Já existe um terminal com este código nesta loja.',
      'CONFLICT',
    ),
  cannotDisableActiveStore: () =>
    new DomainError(
      'CANNOT_DISABLE_ACTIVE_STORE',
      'Troque para outra loja antes de desativar esta.',
      'BUSINESS_RULE',
    ),
  lastActiveStore: () =>
    new DomainError(
      'LAST_ACTIVE_STORE',
      'A organização precisa de pelo menos uma loja ativa.',
      'BUSINESS_RULE',
    ),
  deviceRequired: () =>
    new DomainError(
      'DEVICE_REQUIRED',
      'Não foi possível identificar este aparelho. Saia e entre de novo.',
      'BUSINESS_RULE',
    ),
  terminalInactive: () =>
    new DomainError('TERMINAL_INACTIVE', 'Este terminal está desativado.', 'BUSINESS_RULE'),
};

/** Índice único violado → erro de negócio claro (duas pessoas salvando o mesmo código). */
async function mapDuplicate<T>(work: Promise<T>, error: () => DomainError): Promise<T> {
  try {
    return await work;
  } catch (caught) {
    if (mysqlErrno(caught) === MYSQL_ERRNO.DUPLICATE_ENTRY) throw error();
    throw caught;
  }
}

/** Só os campos que mudaram — para a auditoria mostrar exatamente o que foi alterado. */
function changedFields<T extends object>(before: T, after: T) {
  const keys = (Object.keys(after) as (keyof T)[]).filter((key) => before[key] !== after[key]);
  return {
    before: Object.fromEntries(keys.map((key) => [key, before[key]])),
    after: Object.fromEntries(keys.map((key) => [key, after[key]])),
    changed: keys.length > 0,
  };
}

// ---- Empresa (RN-ORG-02) ----

export interface CompanyInput {
  readonly legalName: string;
  readonly tradeName: string;
  readonly cnpj: string | null;
}

function validateCompany(input: CompanyInput): CompanyData {
  return {
    legalName: normalizeName(input.legalName, 2, 150),
    tradeName: normalizeName(input.tradeName, 2, 120),
    cnpj: normalizeCnpj(input.cnpj),
  };
}

/** Empresa da organização da sessão que a pessoa administra (perfil de organização ou da empresa). */
async function findManageableCompany(
  deps: OrganizationsDependencies,
  tx: Transaction,
  ctx: RequestContext,
  companyId: Id,
): Promise<CompanyRecord> {
  const found = await deps.repo.findCompany(tx, companyId);
  if (found?.organizationId !== ctx.organizationId) throw errors.companyNotFound();
  const allowed = await deps.access.hasCompanyWidePermission(
    tx,
    ctx.userId,
    { organizationId: ctx.organizationId, companyId },
    'stores.manage',
  );
  if (!allowed) throw errors.forbidden();
  return found;
}

export async function listCompanies(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
): Promise<CompanyRecord[]> {
  requirePermission(ctx, 'stores.manage');
  return runInTransaction(deps.db, async (tx) => {
    const companies = await deps.repo.listCompanies(tx, ctx.organizationId);
    const visible: CompanyRecord[] = [];
    for (const item of companies) {
      const allowed = await deps.access.hasCompanyWidePermission(
        tx,
        ctx.userId,
        { organizationId: ctx.organizationId, companyId: item.id },
        'stores.manage',
      );
      if (allowed) visible.push(item);
    }
    return visible;
  });
}

export async function getCompany(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  companyId: Id,
): Promise<CompanyRecord> {
  requirePermission(ctx, 'stores.manage');
  return runInTransaction(deps.db, (tx) => findManageableCompany(deps, tx, ctx, companyId));
}

export async function createCompany(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: CompanyInput,
): Promise<{ id: Id }> {
  requirePermission(ctx, 'stores.manage');
  const data = validateCompany(input);
  const id = newId();
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      // Empresa nova: só quem administra a organização inteira
      const allowed = await deps.access.hasCompanyWidePermission(
        tx,
        ctx.userId,
        { organizationId: ctx.organizationId, companyId: null },
        'stores.manage',
      );
      if (!allowed) throw errors.forbidden();
      await deps.repo.insertCompany(tx, { id, organizationId: ctx.organizationId, ...data });
      await recordAuditFromContext(tx, ctx, 'COMPANY_CREATED', {
        entityType: 'company',
        entityId: id,
        after: { ...data },
      });
    }),
    errors.cnpjTaken,
  );
  return { id };
}

export async function updateCompany(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: CompanyInput & { companyId: Id; version: number },
): Promise<void> {
  requirePermission(ctx, 'stores.manage');
  const data = validateCompany(input);
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const current = await findManageableCompany(deps, tx, ctx, input.companyId);
      if (current.version !== input.version) throw errors.concurrent();
      const diff = changedFields<CompanyData>(
        { legalName: current.legalName, tradeName: current.tradeName, cnpj: current.cnpj },
        data,
      );
      if (!diff.changed) return;
      if (!(await deps.repo.updateCompany(tx, current.id, input.version, data))) {
        throw errors.concurrent();
      }
      await recordAuditFromContext(tx, ctx, 'COMPANY_UPDATED', {
        entityType: 'company',
        entityId: current.id,
        before: diff.before,
        after: diff.after,
      });
    }),
    errors.cnpjTaken,
  );
}

// ---- Loja (RN-ORG-03 a RN-ORG-07) ----

export interface StoreInput extends StoreSettings {
  readonly name: string;
  readonly code: string;
}

function validateStore(input: StoreInput): StoreData {
  return {
    name: normalizeName(input.name, 2, 120),
    code: normalizeStoreCode(input.code),
    ...validateStoreSettings(input),
  };
}

const storeData = (record: StoreRecord): StoreData => ({
  name: record.name,
  code: record.code,
  timezone: record.timezone,
  operationalDayCutoff: record.operationalDayCutoff,
  serviceFeeBp: record.serviceFeeBp,
  negativeStockPolicy: record.negativeStockPolicy,
  maxOpenCashSessions: record.maxOpenCashSessions,
});

/**
 * Loja da organização em que `stores.manage` vale (inclusive desativada). De outra organização:
 * "não encontrada"; da organização mas sem a permissão: "sem permissão".
 */
async function findManageableStore(
  deps: OrganizationsDependencies,
  tx: Transaction,
  ctx: RequestContext,
  storeId: Id,
): Promise<StoreRecord> {
  const found = await deps.repo.findStoreRecord(tx, storeId);
  if (found?.organizationId !== ctx.organizationId) throw errors.storeNotFound();
  const allowed = await deps.access.storesWithPermission(tx, ctx.userId, [found], 'stores.manage');
  if (!allowed.has(found.id)) throw errors.forbidden();
  return found;
}

export async function listManageableStores(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
): Promise<StoreRecord[]> {
  requirePermission(ctx, 'stores.manage');
  return runInTransaction(deps.db, async (tx) => {
    const stores = await deps.repo.listStoresAnyStatus(tx, ctx.organizationId);
    const allowed = await deps.access.storesWithPermission(tx, ctx.userId, stores, 'stores.manage');
    return stores.filter((item) => allowed.has(item.id));
  });
}

export async function getManageableStore(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  storeId: Id,
): Promise<StoreRecord> {
  requirePermission(ctx, 'stores.manage');
  return runInTransaction(deps.db, (tx) => findManageableStore(deps, tx, ctx, storeId));
}

/** Loja nova + estação de cozinha padrão (RN-ORG-03, RN-ORG-10). Usado também na instalação. */
export async function insertStoreWithStation(
  deps: Pick<OrganizationsDependencies, 'repo'>,
  tx: Transaction,
  input: StoreData & { organizationId: Id; companyId: Id },
): Promise<Id> {
  const id = newId();
  await deps.repo.insertStore(tx, { id, ...input });
  await deps.repo.insertDefaultStation(tx, id);
  return id;
}

export async function createStore(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: Partial<StoreSettings> & { companyId: Id; name: string; code: string },
): Promise<{ id: Id }> {
  requirePermission(ctx, 'stores.manage');
  const data = validateStore({ ...DEFAULT_STORE_SETTINGS, ...input });
  const id = await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const owner = await findManageableCompany(deps, tx, ctx, input.companyId);
      const storeId = await insertStoreWithStation(deps, tx, {
        ...data,
        organizationId: ctx.organizationId,
        companyId: owner.id,
      });
      await recordAuditFromContext(tx, ctx, 'STORE_CREATED', {
        entityType: 'store',
        entityId: storeId,
        after: { companyId: owner.id, ...data },
      });
      return storeId;
    }),
    errors.storeCodeTaken,
  );
  return { id };
}

export async function updateStore(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: StoreInput & { storeId: Id; version: number },
): Promise<void> {
  requirePermission(ctx, 'stores.manage');
  const data = validateStore(input);
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const current = await findManageableStore(deps, tx, ctx, input.storeId);
      if (current.version !== input.version) throw errors.concurrent();
      const diff = changedFields(storeData(current), data);
      if (!diff.changed) return;
      if (!(await deps.repo.updateStore(tx, current.id, input.version, data))) {
        throw errors.concurrent();
      }
      await recordAuditFromContext(tx, ctx, 'STORE_UPDATED', {
        entityType: 'store',
        entityId: current.id,
        before: diff.before,
        after: diff.after,
      });
    }),
    errors.storeCodeTaken,
  );
}

export async function setStoreStatus(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: { storeId: Id; version: number; status: RecordStatus },
): Promise<void> {
  requirePermission(ctx, 'stores.manage');
  await runInTransaction(deps.db, async (tx) => {
    const current = await findManageableStore(deps, tx, ctx, input.storeId);
    if (current.version !== input.version) throw errors.concurrent();
    if (current.status === input.status) return;
    if (input.status === 'INATIVO') {
      // RN-ORG-06: nem a loja em uso, nem a última loja ativa
      if (current.id === ctx.storeId) throw errors.cannotDisableActiveStore();
      if ((await deps.repo.countActiveStores(tx, ctx.organizationId)) <= 1) {
        throw errors.lastActiveStore();
      }
    }
    if (!(await deps.repo.setStoreStatus(tx, current.id, input.version, input.status))) {
      throw errors.concurrent();
    }
    await recordAuditFromContext(
      tx,
      ctx,
      input.status === 'INATIVO' ? 'STORE_DISABLED' : 'STORE_ENABLED',
      {
        entityType: 'store',
        entityId: current.id,
        before: { status: current.status },
        after: { status: input.status },
      },
    );
  });
}

// ---- Terminal (RN-ORG-08, RN-ORG-09) ----

export interface TerminalInput {
  readonly code: string;
  readonly name: string;
  readonly kind: TerminalKind;
}

export interface TerminalView extends TerminalRecord {
  /** O terminal está vinculado a ESTE aparelho (o da sessão)? */
  readonly isThisDevice: boolean;
  /** Vinculado a algum aparelho? (o id do aparelho não sai do servidor) */
  readonly hasDevice: boolean;
}

function validateTerminal(input: TerminalInput): TerminalData {
  return {
    code: normalizeTerminalCode(input.code),
    name: normalizeName(input.name, 2, 60),
    kind: input.kind,
  };
}

const toView = (ctx: RequestContext, record: TerminalRecord): TerminalView => ({
  ...record,
  deviceId: null,
  isThisDevice: record.deviceId !== null && record.deviceId === ctx.deviceId,
  hasDevice: record.deviceId !== null,
});

/** Terminal da LOJA ATIVA (isolamento): de outra loja é "não encontrado". */
async function findStoreTerminal(
  deps: OrganizationsDependencies,
  tx: Transaction,
  ctx: RequestContext,
  terminalId: Id,
): Promise<TerminalRecord> {
  const found = await deps.repo.findTerminal(tx, terminalId);
  if (found?.storeId !== ctx.storeId) throw errors.terminalNotFound();
  return found;
}

export async function listTerminals(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
): Promise<TerminalView[]> {
  requirePermission(ctx, 'terminals.manage');
  return runInTransaction(deps.db, async (tx) =>
    (await deps.repo.listTerminals(tx, ctx.storeId)).map((record) => toView(ctx, record)),
  );
}

export async function getTerminal(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  terminalId: Id,
): Promise<TerminalView> {
  requirePermission(ctx, 'terminals.manage');
  return runInTransaction(deps.db, async (tx) =>
    toView(ctx, await findStoreTerminal(deps, tx, ctx, terminalId)),
  );
}

export async function createTerminal(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: TerminalInput,
): Promise<{ id: Id }> {
  requirePermission(ctx, 'terminals.manage');
  const data = validateTerminal(input);
  const id = newId();
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      await deps.repo.insertTerminal(tx, { id, storeId: ctx.storeId, ...data });
      await recordAuditFromContext(tx, ctx, 'TERMINAL_CREATED', {
        entityType: 'terminal',
        entityId: id,
        after: { ...data },
      });
    }),
    errors.terminalCodeTaken,
  );
  return { id };
}

export async function updateTerminal(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: TerminalInput & { terminalId: Id; version: number },
): Promise<void> {
  requirePermission(ctx, 'terminals.manage');
  const data = validateTerminal(input);
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const current = await findStoreTerminal(deps, tx, ctx, input.terminalId);
      if (current.version !== input.version) throw errors.concurrent();
      const diff = changedFields<TerminalData>(
        { code: current.code, name: current.name, kind: current.kind },
        data,
      );
      if (!diff.changed) return;
      if (!(await deps.repo.updateTerminal(tx, current.id, input.version, data))) {
        throw errors.concurrent();
      }
      await recordAuditFromContext(tx, ctx, 'TERMINAL_UPDATED', {
        entityType: 'terminal',
        entityId: current.id,
        before: diff.before,
        after: diff.after,
      });
    }),
    errors.terminalCodeTaken,
  );
}

export async function setTerminalActive(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: { terminalId: Id; version: number; active: boolean },
): Promise<void> {
  requirePermission(ctx, 'terminals.manage');
  await runInTransaction(deps.db, async (tx) => {
    const current = await findStoreTerminal(deps, tx, ctx, input.terminalId);
    if (current.version !== input.version) throw errors.concurrent();
    if (current.active === input.active) return;
    if (!(await deps.repo.setTerminalActive(tx, current.id, input.version, input.active))) {
      throw errors.concurrent();
    }
    await recordAuditFromContext(tx, ctx, input.active ? 'TERMINAL_ENABLED' : 'TERMINAL_DISABLED', {
      entityType: 'terminal',
      entityId: current.id,
      before: { active: current.active, hasDevice: current.deviceId !== null },
      after: { active: input.active, hasDevice: input.active && current.deviceId !== null },
    });
  });
}

/**
 * "Usar este aparelho como o terminal X" (RN-ORG-09). O aparelho é o da SESSÃO — nunca vem do
 * formulário. Se o aparelho já era outro terminal (mesmo de outra loja), aquele vínculo é desfeito.
 */
export async function bindThisDevice(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: { terminalId: Id },
): Promise<void> {
  requirePermission(ctx, 'terminals.manage');
  const deviceId = ctx.deviceId;
  if (deviceId === null) throw errors.deviceRequired();
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const target = await findStoreTerminal(deps, tx, ctx, input.terminalId);
      if (!target.active) throw errors.terminalInactive();
      if (target.deviceId === deviceId) return;
      const previous = await deps.repo.findTerminalByDevice(tx, deviceId);
      if (previous) {
        await deps.repo.setTerminalDevice(tx, previous.id, null);
        await recordAuditFromContext(tx, ctx, 'TERMINAL_UNBOUND', {
          entityType: 'terminal',
          entityId: previous.id,
          after: { reason: 'APARELHO_VINCULADO_A_OUTRO_TERMINAL', newTerminalId: target.id },
        });
      }
      await deps.repo.setTerminalDevice(tx, target.id, deviceId);
      await recordAuditFromContext(tx, ctx, 'TERMINAL_BOUND', {
        entityType: 'terminal',
        entityId: target.id,
        after: { code: target.code, replacedDevice: target.deviceId !== null },
      });
    }),
    // Dois vínculos simultâneos do mesmo aparelho: o índice único decide, o outro recarrega
    errors.concurrent,
  );
}

export async function unbindTerminal(
  deps: OrganizationsDependencies,
  ctx: RequestContext,
  input: { terminalId: Id },
): Promise<void> {
  requirePermission(ctx, 'terminals.manage');
  await runInTransaction(deps.db, async (tx) => {
    const target = await findStoreTerminal(deps, tx, ctx, input.terminalId);
    if (target.deviceId === null) return;
    await deps.repo.setTerminalDevice(tx, target.id, null);
    await recordAuditFromContext(tx, ctx, 'TERMINAL_UNBOUND', {
      entityType: 'terminal',
      entityId: target.id,
      after: { reason: 'MANUAL' },
    });
  });
}
