import { and, asc, between, desc, eq, inArray, like, sql } from 'drizzle-orm';
import {
  ingredient,
  ingredientStock,
  ingredientUnitConversion,
  stockMovement,
} from '@/shared/db/schema';
import { type Id, Quantity, UnitCost } from '@/shared/kernel';
import type {
  IngredientWithStock,
  InventoryRepository,
  MovementLossReason,
  MovementRecord,
  MovementType,
  OriginType,
} from '../application/ports';

// DECIMAL chega como texto: converte para inteiros sem passar por float (ADR-0003)
const toThousandths = (value: string | null) =>
  value === null ? 0 : Quantity.of(value, 'un').thousandths;
const toMicros = (value: string | null) =>
  value === null ? 0n : UnitCost.fromDecimalString(value).micros;
const quantityText = (thousandths: number) =>
  Quantity.fromThousandths(thousandths, 'un').toDecimalString();
const costText = (micros: bigint) => UnitCost.fromMicros(micros).toDecimalString();

/** Texto da busca vira padrão LIKE literal. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const ingredientColumns = {
  id: ingredient.id,
  companyId: ingredient.companyId,
  name: ingredient.name,
  baseUnit: ingredient.baseUnit,
  active: ingredient.active,
  version: ingredient.version,
};

const movementColumns = {
  id: stockMovement.id,
  ingredientId: stockMovement.ingredientId,
  type: stockMovement.type,
  quantity: stockMovement.quantity,
  unitCost: stockMovement.unitCost,
  valueCents: stockMovement.valueCents,
  balanceAfter: stockMovement.balanceAfter,
  lossReason: stockMovement.lossReason,
  note: stockMovement.note,
  enteredText: stockMovement.enteredText,
  originType: stockMovement.originType,
  originId: stockMovement.originId,
  userId: stockMovement.userId,
  occurredAt: stockMovement.occurredAt,
  operationalDate: stockMovement.operationalDate,
};

interface MovementRow {
  id: Id;
  ingredientId: Id;
  type: MovementType;
  quantity: string;
  unitCost: string;
  valueCents: number;
  balanceAfter: string;
  lossReason: MovementLossReason | null;
  note: string | null;
  enteredText: string | null;
  originType: OriginType;
  originId: Id | null;
  userId: Id;
  occurredAt: Date;
  operationalDate: string;
}

const toMovement = (row: MovementRow): MovementRecord & { ingredientId: Id } => ({
  id: row.id,
  ingredientId: row.ingredientId,
  type: row.type,
  quantity: toThousandths(row.quantity),
  unitCostMicros: toMicros(row.unitCost),
  valueCents: row.valueCents,
  balanceAfter: toThousandths(row.balanceAfter),
  lossReason: row.lossReason,
  note: row.note,
  enteredText: row.enteredText,
  originType: row.originType,
  originId: row.originId,
  userId: row.userId,
  occurredAt: row.occurredAt,
  operationalDate: row.operationalDate,
});

export const inventoryRepository: InventoryRepository = {
  async listIngredients(tx, { companyId, storeId, search, includeInactive }) {
    const rows = await tx
      .select({
        ...ingredientColumns,
        quantity: ingredientStock.quantity,
        avgUnitCost: ingredientStock.avgUnitCost,
        minQuantity: ingredientStock.minQuantity,
      })
      .from(ingredient)
      .leftJoin(
        ingredientStock,
        and(eq(ingredientStock.ingredientId, ingredient.id), eq(ingredientStock.storeId, storeId)),
      )
      .where(
        and(
          eq(ingredient.companyId, companyId),
          includeInactive ? undefined : eq(ingredient.active, true),
          search ? like(ingredient.name, likePattern(search)) : undefined,
        ),
      )
      .orderBy(asc(ingredient.name));
    return rows.map((row): IngredientWithStock => ({
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      baseUnit: row.baseUnit,
      active: row.active,
      version: row.version,
      quantity: toThousandths(row.quantity),
      avgCostMicros: toMicros(row.avgUnitCost),
      minQuantity: toThousandths(row.minQuantity),
    }));
  },

  async findIngredient(tx, { companyId, ingredientId }) {
    const [row] = await tx
      .select(ingredientColumns)
      .from(ingredient)
      .where(and(eq(ingredient.id, ingredientId), eq(ingredient.companyId, companyId)));
    return row ?? null;
  },

  async findIngredients(tx, companyId, ids) {
    if (ids.length === 0) return [];
    return tx
      .select(ingredientColumns)
      .from(ingredient)
      .where(and(eq(ingredient.companyId, companyId), inArray(ingredient.id, [...ids])));
  },

  async insertIngredient(tx, input) {
    await tx.insert(ingredient).values(input);
  },

  async updateIngredient(tx, id, version, data) {
    const [result] = await tx
      .update(ingredient)
      .set({ ...data, version: sql`${ingredient.version} + 1` })
      .where(and(eq(ingredient.id, id), eq(ingredient.version, version)));
    return result.affectedRows === 1;
  },

  async listConversions(tx, ingredientId) {
    const rows = await tx
      .select({
        id: ingredientUnitConversion.id,
        ingredientId: ingredientUnitConversion.ingredientId,
        unitName: ingredientUnitConversion.unitName,
        factor: ingredientUnitConversion.factorToBase,
      })
      .from(ingredientUnitConversion)
      .where(eq(ingredientUnitConversion.ingredientId, ingredientId))
      .orderBy(asc(ingredientUnitConversion.unitName));
    return rows.map(({ factor, ...row }) => ({ ...row, factorThousandths: toThousandths(factor) }));
  },

  async findConversion(tx, { companyId, conversionId }) {
    const [row] = await tx
      .select({
        id: ingredientUnitConversion.id,
        ingredientId: ingredientUnitConversion.ingredientId,
        unitName: ingredientUnitConversion.unitName,
        factor: ingredientUnitConversion.factorToBase,
      })
      .from(ingredientUnitConversion)
      .innerJoin(ingredient, eq(ingredient.id, ingredientUnitConversion.ingredientId))
      .where(
        and(eq(ingredientUnitConversion.id, conversionId), eq(ingredient.companyId, companyId)),
      );
    return row
      ? {
          id: row.id,
          ingredientId: row.ingredientId,
          unitName: row.unitName,
          factorThousandths: toThousandths(row.factor),
        }
      : null;
  },

  async insertConversion(tx, input) {
    await tx.insert(ingredientUnitConversion).values({
      id: input.id,
      ingredientId: input.ingredientId,
      unitName: input.unitName,
      factorToBase: quantityText(input.factorThousandths),
    });
  },

  async deleteConversion(tx, id) {
    await tx.delete(ingredientUnitConversion).where(eq(ingredientUnitConversion.id, id));
  },

  async findStock(tx, storeId, ingredientId) {
    const [row] = await tx
      .select({
        quantity: ingredientStock.quantity,
        avgUnitCost: ingredientStock.avgUnitCost,
        minQuantity: ingredientStock.minQuantity,
      })
      .from(ingredientStock)
      .where(
        and(eq(ingredientStock.storeId, storeId), eq(ingredientStock.ingredientId, ingredientId)),
      );
    return row
      ? {
          storeId,
          ingredientId,
          quantity: toThousandths(row.quantity),
          avgCostMicros: toMicros(row.avgUnitCost),
          minQuantity: toThousandths(row.minQuantity),
        }
      : null;
  },

  async lockStock(tx, storeId, ingredientIds) {
    const ids = [...new Set(ingredientIds)].sort();
    if (ids.length === 0) return new Map();
    // Cria as linhas que faltam (saldo zero) sem sobrescrever as existentes...
    await tx
      .insert(ingredientStock)
      .values(ids.map((ingredientId) => ({ storeId, ingredientId })))
      .onDuplicateKeyUpdate({ set: { storeId: sql`${ingredientStock.storeId}` } });
    // ...e trava todas, na ordem da chave (a mesma para todo mundo: sem deadlock circular)
    const rows = await tx
      .select({
        ingredientId: ingredientStock.ingredientId,
        quantity: ingredientStock.quantity,
        avgUnitCost: ingredientStock.avgUnitCost,
        minQuantity: ingredientStock.minQuantity,
      })
      .from(ingredientStock)
      .where(and(eq(ingredientStock.storeId, storeId), inArray(ingredientStock.ingredientId, ids)))
      .orderBy(asc(ingredientStock.ingredientId))
      .for('update');
    return new Map(
      rows.map((row) => [
        row.ingredientId,
        {
          storeId,
          ingredientId: row.ingredientId,
          quantity: toThousandths(row.quantity),
          avgCostMicros: toMicros(row.avgUnitCost),
          minQuantity: toThousandths(row.minQuantity),
        },
      ]),
    );
  },

  async saveStock(tx, { storeId, ingredientId, quantity, avgCostMicros }) {
    await tx
      .update(ingredientStock)
      .set({
        quantity: quantityText(quantity),
        avgUnitCost: costText(avgCostMicros),
        version: sql`${ingredientStock.version} + 1`,
      })
      .where(
        and(eq(ingredientStock.storeId, storeId), eq(ingredientStock.ingredientId, ingredientId)),
      );
  },

  async setMinimum(tx, { storeId, ingredientId, minQuantity }) {
    // Valor absoluto (RN-INV-11): não muda a versão do saldo
    const min = quantityText(minQuantity);
    await tx
      .insert(ingredientStock)
      .values({ storeId, ingredientId, minQuantity: min })
      .onDuplicateKeyUpdate({ set: { minQuantity: min } });
  },

  async insertMovements(tx, rows) {
    if (rows.length === 0) return;
    await tx.insert(stockMovement).values(
      rows.map((row) => ({
        id: row.id,
        storeId: row.storeId,
        ingredientId: row.ingredientId,
        type: row.type,
        quantity: quantityText(row.quantity),
        unitCost: costText(row.unitCostMicros),
        valueCents: row.valueCents,
        balanceAfter: quantityText(row.balanceAfter),
        lossReason: row.lossReason,
        note: row.note,
        enteredText: row.enteredText,
        originType: row.originType,
        originId: row.originId,
        userId: row.userId,
        occurredAt: row.occurredAt,
        operationalDate: row.operationalDate,
      })),
    );
  },

  async listMovements(tx, { storeId, ingredientId, limit }) {
    const rows = await tx
      .select(movementColumns)
      .from(stockMovement)
      .where(and(eq(stockMovement.storeId, storeId), eq(stockMovement.ingredientId, ingredientId)))
      // UUIDv7 desempata movimentações do mesmo milissegundo na ordem em que foram gravadas
      .orderBy(desc(stockMovement.occurredAt), desc(stockMovement.id))
      .limit(limit);
    return rows.map(toMovement);
  },

  async saleMovementsOf(tx, { storeId, originType, originId }) {
    const rows = await tx
      .select(movementColumns)
      .from(stockMovement)
      .where(
        and(
          eq(stockMovement.originType, originType),
          eq(stockMovement.originId, originId),
          eq(stockMovement.storeId, storeId),
          inArray(stockMovement.type, ['CONSUMO_VENDA', 'ESTORNO_VENDA']),
        ),
      )
      .orderBy(asc(stockMovement.id));
    return rows.map(toMovement);
  },

  async sumValues(tx, { storeId, from, to, types }) {
    const [row] = await tx
      .select({ total: sql<string | null>`sum(${stockMovement.valueCents})` })
      .from(stockMovement)
      .where(
        and(
          eq(stockMovement.storeId, storeId),
          between(stockMovement.operationalDate, from, to),
          inArray(stockMovement.type, [...types]),
        ),
      );
    // SUM de BIGINT chega como texto (DECIMAL): inteiro exato
    return row?.total ? Number(row.total) : 0;
  },
};
