import { and, asc, eq, sql } from 'drizzle-orm';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import { company, kitchenStation, store, terminal } from '@/shared/db/schema';
import { newId } from '@/shared/kernel';
import type {
  OrganizationsRepository,
  StoreData,
  StoreRecord,
  TerminalRecord,
} from '../application/ports';

// O MySQL devolve TIME como "05:00:00"; o domínio usa "05:00"
const toLocalTime = (value: string) => value.slice(0, 5);
const toSqlTime = (value: string) => `${value}:00`;

const companyColumns = {
  id: company.id,
  organizationId: company.organizationId,
  legalName: company.legalName,
  tradeName: company.tradeName,
  cnpj: company.cnpj,
  status: company.status,
  version: company.version,
};

const storeColumns = {
  id: store.id,
  organizationId: store.organizationId,
  companyId: store.companyId,
  name: store.name,
  code: store.code,
  timezone: store.timezone,
  operationalDayCutoff: store.operationalDayCutoff,
  serviceFeeBp: store.serviceFeeBp,
  negativeStockPolicy: store.negativeStockPolicy,
  maxOpenCashSessions: store.maxOpenCashSessions,
  status: store.status,
  version: store.version,
};

type StoreRow = Omit<StoreRecord, 'operationalDayCutoff'> & { operationalDayCutoff: string };

const toStoreRecord = (row: StoreRow): StoreRecord => ({
  ...row,
  operationalDayCutoff: toLocalTime(row.operationalDayCutoff),
});

const storeValues = (data: StoreData) => ({
  ...data,
  operationalDayCutoff: toSqlTime(data.operationalDayCutoff),
});

const terminalColumns = {
  id: terminal.id,
  storeId: terminal.storeId,
  code: terminal.code,
  name: terminal.name,
  kind: terminal.kind,
  deviceId: terminal.deviceId,
  active: terminal.active,
  version: terminal.version,
};

/** Bloqueio otimista (ADR-0008): o UPDATE só casa com a versão lida e a incrementa. */
const bumpVersion = (column: AnyMySqlColumn) => sql`${column} + 1`;

export const organizationsRepository: OrganizationsRepository = {
  listCompanies(tx, organizationId) {
    return tx
      .select(companyColumns)
      .from(company)
      .where(eq(company.organizationId, organizationId))
      .orderBy(asc(company.tradeName));
  },

  async findCompany(tx, companyId) {
    const [row] = await tx.select(companyColumns).from(company).where(eq(company.id, companyId));
    return row ?? null;
  },

  async insertCompany(tx, input) {
    await tx.insert(company).values(input);
  },

  async updateCompany(tx, id, version, data) {
    const [result] = await tx
      .update(company)
      .set({ ...data, version: bumpVersion(company.version) })
      .where(and(eq(company.id, id), eq(company.version, version)));
    return result.affectedRows === 1;
  },

  async listStoresAnyStatus(tx, organizationId) {
    const rows = await tx
      .select(storeColumns)
      .from(store)
      .where(eq(store.organizationId, organizationId))
      .orderBy(asc(store.name));
    return rows.map(toStoreRecord);
  },

  async findStoreRecord(tx, storeId) {
    const [row] = await tx.select(storeColumns).from(store).where(eq(store.id, storeId));
    return row ? toStoreRecord(row) : null;
  },

  async insertStore(tx, input) {
    await tx.insert(store).values({ ...input, ...storeValues(input) });
  },

  async updateStore(tx, id, version, data) {
    const [result] = await tx
      .update(store)
      .set({ ...storeValues(data), version: bumpVersion(store.version) })
      .where(and(eq(store.id, id), eq(store.version, version)));
    return result.affectedRows === 1;
  },

  async setStoreStatus(tx, id, version, status) {
    const [result] = await tx
      .update(store)
      .set({ status, version: bumpVersion(store.version) })
      .where(and(eq(store.id, id), eq(store.version, version)));
    return result.affectedRows === 1;
  },

  async countActiveStores(tx, organizationId) {
    // Leitura COM TRAVA (FOR UPDATE): duas desativações simultâneas passam em fila e a segunda
    // já enxerga a primeira — sem isso, cada uma veria "2 ativas" e sobraria nenhuma (RN-ORG-06)
    const rows = await tx
      .select({ id: store.id })
      .from(store)
      .where(and(eq(store.organizationId, organizationId), eq(store.status, 'ATIVO')))
      .for('update');
    return rows.length;
  },

  async insertDefaultStation(tx, storeId) {
    await tx
      .insert(kitchenStation)
      .values({ id: newId(), storeId, name: 'Cozinha', isDefault: true });
  },

  listTerminals(tx, storeId) {
    return tx
      .select(terminalColumns)
      .from(terminal)
      .where(eq(terminal.storeId, storeId))
      .orderBy(asc(terminal.code));
  },

  async findTerminal(tx, terminalId) {
    const [row] = await tx
      .select(terminalColumns)
      .from(terminal)
      .where(eq(terminal.id, terminalId));
    return row ?? null;
  },

  async findTerminalByDevice(tx, deviceId): Promise<TerminalRecord | null> {
    const [row] = await tx
      .select(terminalColumns)
      .from(terminal)
      .where(eq(terminal.deviceId, deviceId));
    return row ?? null;
  },

  async insertTerminal(tx, input) {
    await tx.insert(terminal).values(input);
  },

  async updateTerminal(tx, id, version, data) {
    const [result] = await tx
      .update(terminal)
      .set({ ...data, version: bumpVersion(terminal.version) })
      .where(and(eq(terminal.id, id), eq(terminal.version, version)));
    return result.affectedRows === 1;
  },

  async setTerminalActive(tx, id, version, active) {
    const [result] = await tx
      .update(terminal)
      .set({
        active,
        version: bumpVersion(terminal.version),
        ...(active ? {} : { deviceId: null }),
      })
      .where(and(eq(terminal.id, id), eq(terminal.version, version)));
    return result.affectedRows === 1;
  },

  async setTerminalDevice(tx, id, deviceId) {
    await tx
      .update(terminal)
      .set({ deviceId, version: bumpVersion(terminal.version) })
      .where(eq(terminal.id, id));
  },
};
