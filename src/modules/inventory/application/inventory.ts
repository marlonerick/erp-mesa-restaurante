import { recordAuditFromContext } from '@/modules/audit';
import type { StoreInfo } from '@/modules/organizations';
import { MYSQL_ERRNO, mysqlErrno } from '@/shared/db/mysql-errors';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import {
  type BaseUnit,
  DomainError,
  formatQuantityText,
  type Id,
  type Money,
  newId,
  operationalDate,
  Quantity,
  type RequestContext,
  requirePermission,
  UnitCost,
} from '@/shared/kernel';
import {
  averageCostAfterEntry,
  conversionName,
  enteredText,
  ingredientName,
  isBelowMinimum,
  type LossReason,
  movementValue,
  optionalNote,
  parseAmount,
  parseConversionFactor,
  parsePaidText,
  requiredNote,
  toBase,
  validateBaseUnit,
  validateLossReason,
} from '../domain/rules';
import type {
  ConversionRecord,
  IngredientRecord,
  IngredientWithStock,
  InventoryDependencies,
  MovementLossReason,
  MovementRecord,
  MovementType,
  NewMovement,
  OriginType,
  StockRecord,
} from './ports';

// ---- Erros (docs/modules/inventory.md §6) ----

const errors = {
  storeNotFound: () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND'),
  ingredientNotFound: () =>
    new DomainError('INGREDIENT_NOT_FOUND', 'Insumo não encontrado.', 'NOT_FOUND'),
  conversionNotFound: () =>
    new DomainError('CONVERSION_NOT_FOUND', 'Unidade não encontrada.', 'NOT_FOUND'),
  nameTaken: () =>
    new DomainError(
      'INGREDIENT_NAME_TAKEN',
      'Já existe um insumo com este nome (talvez desativado).',
      'CONFLICT',
    ),
  conversionTaken: () =>
    new DomainError(
      'CONVERSION_NAME_TAKEN',
      'Este insumo já tem uma unidade com este nome.',
      'CONFLICT',
    ),
  inactive: () =>
    new DomainError('INGREDIENT_INACTIVE', 'Este insumo está desativado.', 'BUSINESS_RULE'),
  concurrent: () =>
    new DomainError(
      'CONCURRENT_MODIFICATION',
      'Outra pessoa alterou estes dados. Recarregue a página e tente de novo.',
      'CONFLICT',
    ),
};

async function mapDuplicate<T>(work: Promise<T>, error: () => DomainError): Promise<T> {
  try {
    return await work;
  } catch (caught) {
    if (mysqlErrno(caught) === MYSQL_ERRNO.DUPLICATE_ENTRY) throw error();
    throw caught;
  }
}

const UNIT_LABEL: Readonly<Record<BaseUnit, string>> = { g: 'g', ml: 'ml', un: 'un' };

/** "500 g" para mensagens. */
const describe = (thousandths: number, unit: BaseUnit) =>
  `${formatQuantityText(thousandths)} ${UNIT_LABEL[unit]}`;

// ---- Escopo (RN-INV-01) ----

async function activeStore(
  deps: InventoryDependencies,
  tx: Transaction,
  ctx: RequestContext,
): Promise<StoreInfo> {
  const found = await deps.stores.findStore(tx, ctx.storeId);
  if (found?.organizationId !== ctx.organizationId) throw errors.storeNotFound();
  return found;
}

async function findIngredientOf(
  deps: InventoryDependencies,
  tx: Transaction,
  companyId: Id,
  ingredientId: Id,
): Promise<IngredientRecord> {
  const found = await deps.repo.findIngredient(tx, { companyId, ingredientId });
  if (!found) throw errors.ingredientNotFound();
  return found;
}

// ---- Motor de movimentações (RN-INV-09, 10, 12, 16, 17) ----

/** Uma mudança de saldo pedida por um caso de uso. `quantity` com sinal, em milésimos. */
interface MovementRequest {
  readonly ingredient: IngredientRecord;
  readonly type: MovementType;
  readonly quantity: number;
  /** Entrada: valor pago (define o custo médio). */
  readonly paid?: Money;
  /** Estorno/perda de venda: valor e custo EXATOS do consumo original (RN-INV-13). */
  readonly fixed?: { readonly valueCents: number; readonly unitCostMicros: bigint };
  /** Obedece à política de estoque negativo? (saída, perda manual, consumo) */
  readonly checksPolicy: boolean;
  readonly lossReason?: MovementLossReason;
  readonly note?: string | null;
  readonly enteredText?: string | null;
  readonly originType: OriginType;
  readonly originId?: Id | null;
}

/** Falta de estoque: devolvido como aviso (permitir) ou recusado (bloquear) — ADR-0007. */
export interface StockShortage {
  readonly ingredientId: Id;
  readonly name: string;
  readonly unit: BaseUnit;
  /** Saldo antes e quanto foi pedido, em milésimos. */
  readonly balance: number;
  readonly required: number;
}

function insufficient(shortages: readonly StockShortage[]): DomainError {
  const text = shortages
    .map(
      (item) =>
        `${item.name} tem ${describe(item.balance, item.unit)}, precisa de ${describe(item.required, item.unit)}`,
    )
    .join('; ');
  return new DomainError('INSUFFICIENT_STOCK', `Estoque insuficiente: ${text}.`, 'BUSINESS_RULE', {
    items: shortages.map((item) => ({
      ingredientId: item.ingredientId,
      name: item.name,
      balance: formatQuantityText(item.balance),
      required: formatQuantityText(item.required),
      unit: item.unit,
    })),
  });
}

/**
 * Grava as movimentações e os saldos NA MESMA TRANSAÇÃO (README B.7.5). As linhas de saldo são
 * travadas em ordem de insumo; os pedidos são aplicados em sequência (o segundo já vê o primeiro).
 * Com BLOQUEAR, qualquer falta recusa tudo antes de gravar.
 */
async function applyMovements(
  deps: InventoryDependencies,
  tx: Transaction,
  ctx: RequestContext,
  requests: readonly MovementRequest[],
): Promise<StockShortage[]> {
  if (requests.length === 0) return [];
  const settings = await deps.stores.settings(tx, {
    organizationId: ctx.organizationId,
    storeId: ctx.storeId,
  });
  if (!settings) throw errors.storeNotFound();
  const stocks = await deps.repo.lockStock(
    tx,
    ctx.storeId,
    requests.map((item) => item.ingredient.id),
  );
  const state = new Map<Id, { quantity: number; cost: UnitCost }>();
  for (const [id, stock] of stocks) {
    state.set(id, { quantity: stock.quantity, cost: UnitCost.fromMicros(stock.avgCostMicros) });
  }

  const now = ctx.clock.now();
  const day = operationalDate(now, settings.timezone, settings.operationalDayCutoff);
  const shortages: StockShortage[] = [];
  const rows: NewMovement[] = [];

  for (const request of requests) {
    const { ingredient } = request;
    const current = state.get(ingredient.id) ?? { quantity: 0, cost: UnitCost.zero() };
    const balance = Quantity.fromThousandths(current.quantity, ingredient.baseUnit);
    const delta = Quantity.fromThousandths(request.quantity, ingredient.baseUnit);
    const after = balance.add(delta);

    if (request.checksPolicy && delta.isNegative() && after.isNegative()) {
      shortages.push({
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.baseUnit,
        balance: balance.thousandths,
        required: -delta.thousandths,
      });
    }

    let cost = current.cost;
    let valueCents: number;
    let unitCostMicros: bigint;
    if (request.type === 'ENTRADA' && request.paid) {
      cost = averageCostAfterEntry(balance, current.cost, delta, request.paid);
      valueCents = request.paid.cents;
      unitCostMicros = UnitCost.fromTotal(request.paid, delta).micros;
    } else if (request.fixed) {
      valueCents = request.fixed.valueCents;
      unitCostMicros = request.fixed.unitCostMicros;
    } else {
      valueCents = movementValue(delta, current.cost).cents;
      unitCostMicros = current.cost.micros;
    }

    state.set(ingredient.id, { quantity: after.thousandths, cost });
    rows.push({
      id: newId(),
      storeId: ctx.storeId,
      ingredientId: ingredient.id,
      type: request.type,
      quantity: delta.thousandths,
      unitCostMicros,
      valueCents,
      balanceAfter: after.thousandths,
      lossReason: request.lossReason ?? null,
      note: request.note ?? null,
      enteredText: request.enteredText ?? null,
      originType: request.originType,
      originId: request.originId ?? null,
      userId: ctx.userId,
      occurredAt: now,
      operationalDate: day,
    });
  }

  if (shortages.length > 0 && settings.negativeStockPolicy === 'BLOQUEAR') {
    throw insufficient(shortages);
  }
  for (const [ingredientId, value] of state) {
    const before = stocks.get(ingredientId);
    if (before?.quantity === value.quantity && before.avgCostMicros === value.cost.micros) continue;
    await deps.repo.saveStock(tx, {
      storeId: ctx.storeId,
      ingredientId,
      quantity: value.quantity,
      avgCostMicros: value.cost.micros,
    });
  }
  await deps.repo.insertMovements(tx, rows);
  return shortages;
}

// ---- Leitura ----

export interface IngredientView extends IngredientWithStock {
  readonly belowMinimum: boolean;
}

const toView = (item: IngredientWithStock): IngredientView => ({
  ...item,
  belowMinimum: isBelowMinimum(
    Quantity.fromThousandths(item.quantity, item.baseUnit),
    Quantity.fromThousandths(item.minQuantity, item.baseUnit),
  ),
});

export async function listIngredients(
  deps: InventoryDependencies,
  ctx: RequestContext,
  filter: { search?: string; includeInactive?: boolean; belowMinimumOnly?: boolean } = {},
): Promise<IngredientView[]> {
  requirePermission(ctx, 'inventory.read');
  const search = filter.search?.trim().slice(0, 80) ?? '';
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const rows = await deps.repo.listIngredients(tx, {
      companyId,
      storeId: ctx.storeId,
      search: search === '' ? null : search,
      includeInactive: filter.includeInactive ?? false,
    });
    const views = rows.map(toView);
    return filter.belowMinimumOnly ? views.filter((item) => item.belowMinimum) : views;
  });
}

export interface MovementView extends MovementRecord {
  readonly userName: string | null;
}

export interface IngredientDetail extends IngredientView {
  readonly conversions: ConversionRecord[];
  readonly movements: MovementView[];
}

const MOVEMENTS_SHOWN = 100;

export async function getIngredient(
  deps: InventoryDependencies,
  ctx: RequestContext,
  ingredientId: Id,
): Promise<IngredientDetail> {
  requirePermission(ctx, 'inventory.read');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const ingredient = await findIngredientOf(deps, tx, companyId, ingredientId);
    const stock = await deps.repo.findStock(tx, ctx.storeId, ingredient.id);
    const movements = await deps.repo.listMovements(tx, {
      storeId: ctx.storeId,
      ingredientId: ingredient.id,
      limit: MOVEMENTS_SHOWN,
    });
    const names = await deps.userNames(tx, [...new Set(movements.map((item) => item.userId))]);
    return {
      ...toView({
        ...ingredient,
        quantity: stock?.quantity ?? 0,
        avgCostMicros: stock?.avgCostMicros ?? 0n,
        minQuantity: stock?.minQuantity ?? 0,
      }),
      conversions: await deps.repo.listConversions(tx, ingredient.id),
      movements: movements.map((item) => ({ ...item, userName: names.get(item.userId) ?? null })),
    };
  });
}

// ---- Cadastro (RN-INV-02, RN-INV-03) ----

export async function createIngredient(
  deps: InventoryDependencies,
  ctx: RequestContext,
  input: { name: string; baseUnit: string },
): Promise<{ id: Id }> {
  requirePermission(ctx, 'inventory.manage');
  const name = ingredientName(input.name);
  const baseUnit = validateBaseUnit(input.baseUnit);
  const id = newId();
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      await deps.repo.insertIngredient(tx, { id, companyId, name, baseUnit });
      await recordAuditFromContext(tx, ctx, 'INGREDIENT_CREATED', {
        storeId: null, // cadastro da empresa: vale para todas as lojas
        entityType: 'ingredient',
        entityId: id,
        after: { name, baseUnit },
      });
    }),
    errors.nameTaken,
  );
  return { id };
}

export async function updateIngredient(
  deps: InventoryDependencies,
  ctx: RequestContext,
  input: { ingredientId: Id; version: number; name: string; active: boolean },
): Promise<void> {
  requirePermission(ctx, 'inventory.manage');
  const data = { name: ingredientName(input.name), active: input.active };
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const current = await findIngredientOf(deps, tx, companyId, input.ingredientId);
      if (current.version !== input.version) throw errors.concurrent();
      if (current.name === data.name && current.active === data.active) return;
      if (!(await deps.repo.updateIngredient(tx, current.id, input.version, data))) {
        throw errors.concurrent();
      }
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      if (current.name !== data.name) {
        before.name = current.name;
        after.name = data.name;
      }
      if (current.active !== data.active) {
        before.active = current.active;
        after.active = data.active;
      }
      await recordAuditFromContext(tx, ctx, 'INGREDIENT_UPDATED', {
        storeId: null,
        entityType: 'ingredient',
        entityId: current.id,
        before,
        after,
      });
    }),
    errors.nameTaken,
  );
}

export async function addConversion(
  deps: InventoryDependencies,
  ctx: RequestContext,
  input: { ingredientId: Id; unitName: string; factor: string },
): Promise<void> {
  requirePermission(ctx, 'inventory.manage');
  const unitName = conversionName(input.unitName);
  const factorThousandths = parseConversionFactor(input.factor);
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const ingredient = await findIngredientOf(deps, tx, companyId, input.ingredientId);
      const id = newId();
      await deps.repo.insertConversion(tx, {
        id,
        ingredientId: ingredient.id,
        unitName,
        factorThousandths,
      });
      await recordAuditFromContext(tx, ctx, 'INGREDIENT_UPDATED', {
        storeId: null,
        entityType: 'ingredient',
        entityId: ingredient.id,
        after: { conversionAdded: { unitName, factor: formatQuantityText(factorThousandths) } },
      });
    }),
    errors.conversionTaken,
  );
}

export async function removeConversion(
  deps: InventoryDependencies,
  ctx: RequestContext,
  input: { conversionId: Id },
): Promise<void> {
  requirePermission(ctx, 'inventory.manage');
  await runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const conversion = await deps.repo.findConversion(tx, {
      companyId,
      conversionId: input.conversionId,
    });
    if (!conversion) throw errors.conversionNotFound();
    await deps.repo.deleteConversion(tx, conversion.id);
    await recordAuditFromContext(tx, ctx, 'INGREDIENT_UPDATED', {
      storeId: null,
      entityType: 'ingredient',
      entityId: conversion.ingredientId,
      before: {
        conversionRemoved: {
          unitName: conversion.unitName,
          factor: formatQuantityText(conversion.factorThousandths),
        },
      },
    });
  });
}

// ---- Mínimo (RN-INV-11) ----

export async function setMinimum(
  deps: InventoryDependencies,
  ctx: RequestContext,
  input: { ingredientId: Id; minimum: string },
): Promise<void> {
  requirePermission(ctx, 'inventory.manage');
  const minQuantity = parseAmount(input.minimum, { allowZero: true });
  await runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const ingredient = await findIngredientOf(deps, tx, companyId, input.ingredientId);
    const current = await deps.repo.findStock(tx, ctx.storeId, ingredient.id);
    if ((current?.minQuantity ?? 0) === minQuantity) return;
    await deps.repo.setMinimum(tx, {
      storeId: ctx.storeId,
      ingredientId: ingredient.id,
      minQuantity,
    });
    await recordAuditFromContext(tx, ctx, 'STOCK_MINIMUM_SET', {
      entityType: 'ingredient',
      entityId: ingredient.id,
      before: { minimum: formatQuantityText(current?.minQuantity ?? 0) },
      after: { minimum: formatQuantityText(minQuantity) },
    });
  });
}

// ---- Movimentações manuais (RN-INV-05 a RN-INV-09) ----

interface AmountInput {
  readonly ingredientId: Id;
  /** Texto digitado ("1,5"). */
  readonly quantity: string;
  /** Unidade fixa ("kg") ou id de conversão do insumo. */
  readonly unit: string;
}

/** Insumo + quantidade na base + texto para o extrato. */
async function resolveAmount(
  deps: InventoryDependencies,
  tx: Transaction,
  companyId: Id,
  input: AmountInput,
  options: { allowZero?: boolean } = {},
) {
  const ingredient = await findIngredientOf(deps, tx, companyId, input.ingredientId);
  const amount = parseAmount(input.quantity, options);
  const conversions = await deps.repo.listConversions(tx, ingredient.id);
  const quantity = toBase(amount, input.unit, ingredient.baseUnit, conversions);
  if (!options.allowZero && !quantity.isPositive()) throw parseAmountError();
  const label = conversions.find((item) => item.id === input.unit)?.unitName ?? input.unit;
  return { ingredient, quantity, text: enteredText(input.quantity, label) };
}

const parseAmountError = () =>
  new DomainError(
    'INVALID_QUANTITY',
    'Informe uma quantidade maior que zero, com até 3 casas decimais (ex.: 1,5).',
    'VALIDATION',
  );

/** Resultado de uma movimentação: avisos de estoque negativo (política "permitir com alerta"). */
export interface MovementResult {
  readonly warnings: StockShortage[];
}

export async function registerEntry(
  deps: InventoryDependencies,
  ctx: RequestContext,
  input: AmountInput & { paid: string; note?: string | null },
): Promise<MovementResult> {
  requirePermission(ctx, 'inventory.manage');
  const paid = parsePaidText(input.paid);
  const note = optionalNote(input.note ?? null);
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const { ingredient, quantity, text } = await resolveAmount(deps, tx, companyId, input);
    if (!ingredient.active) throw errors.inactive();
    const warnings = await applyMovements(deps, tx, ctx, [
      {
        ingredient,
        type: 'ENTRADA',
        quantity: quantity.thousandths,
        paid,
        checksPolicy: false,
        note,
        enteredText: text,
        originType: 'MANUAL',
      },
    ]);
    await recordAuditFromContext(tx, ctx, 'STOCK_ENTRY', {
      entityType: 'ingredient',
      entityId: ingredient.id,
      after: { quantity: quantity.toDecimalString(), paidCents: paid.cents, entered: text },
    });
    return { warnings };
  });
}

export async function registerExit(
  deps: InventoryDependencies,
  ctx: RequestContext,
  input: AmountInput & { note: string },
): Promise<MovementResult> {
  requirePermission(ctx, 'inventory.manage');
  const note = requiredNote(input.note);
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const { ingredient, quantity, text } = await resolveAmount(deps, tx, companyId, input);
    const warnings = await applyMovements(deps, tx, ctx, [
      {
        ingredient,
        type: 'SAIDA',
        quantity: -quantity.thousandths,
        checksPolicy: true,
        note,
        enteredText: text,
        originType: 'MANUAL',
      },
    ]);
    await recordAuditFromContext(tx, ctx, 'STOCK_EXIT', {
      entityType: 'ingredient',
      entityId: ingredient.id,
      after: { quantity: quantity.negate().toDecimalString(), note, entered: text },
    });
    return { warnings };
  });
}

export async function registerLoss(
  deps: InventoryDependencies,
  ctx: RequestContext,
  input: AmountInput & { reason: string; note?: string | null },
): Promise<MovementResult> {
  requirePermission(ctx, 'inventory.manage');
  const reason: LossReason = validateLossReason(input.reason);
  const note =
    reason === 'OUTRO' ? requiredNote(input.note ?? null) : optionalNote(input.note ?? null);
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const { ingredient, quantity, text } = await resolveAmount(deps, tx, companyId, input);
    const warnings = await applyMovements(deps, tx, ctx, [
      {
        ingredient,
        type: 'PERDA',
        quantity: -quantity.thousandths,
        checksPolicy: true,
        lossReason: reason,
        note,
        enteredText: text,
        originType: 'MANUAL',
      },
    ]);
    await recordAuditFromContext(tx, ctx, 'STOCK_LOSS', {
      entityType: 'ingredient',
      entityId: ingredient.id,
      after: { quantity: quantity.negate().toDecimalString(), reason, note, entered: text },
    });
    return { warnings };
  });
}

/**
 * Contagem física (RN-INV-08): grava a DIFERENÇA para o saldo no momento de salvar — a contagem é a
 * verdade, então movimentações feitas enquanto a pessoa contava entram na conta. Zero = nada.
 */
export async function registerCount(
  deps: InventoryDependencies,
  ctx: RequestContext,
  input: AmountInput,
): Promise<{ adjusted: boolean }> {
  requirePermission(ctx, 'inventory.manage');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const { ingredient, quantity, text } = await resolveAmount(deps, tx, companyId, input, {
      allowZero: true,
    });
    const locked = await deps.repo.lockStock(tx, ctx.storeId, [ingredient.id]);
    const balance = locked.get(ingredient.id)?.quantity ?? 0;
    const difference = quantity.thousandths - balance;
    if (difference === 0) return { adjusted: false };
    await applyMovements(deps, tx, ctx, [
      {
        ingredient,
        type: 'AJUSTE',
        quantity: difference,
        checksPolicy: false,
        note: `Contagem: ${text}`,
        enteredText: text,
        originType: 'MANUAL',
      },
    ]);
    await recordAuditFromContext(tx, ctx, 'STOCK_ADJUSTMENT', {
      entityType: 'ingredient',
      entityId: ingredient.id,
      before: {
        quantity: Quantity.fromThousandths(balance, ingredient.baseUnit).toDecimalString(),
      },
      after: { quantity: quantity.toDecimalString(), counted: text },
    });
    return { adjusted: true };
  });
}

// ---- Baixa por venda (RN-INV-12 a RN-INV-14; ADR-0006 opção A) — API pública ----

export interface ConsumptionLine {
  readonly ingredientId: Id;
  /** Quantidade a baixar, em milésimos da unidade base (> 0). */
  readonly quantity: number;
  /** Item do pedido que originou o consumo. */
  readonly originId: Id;
}

/**
 * Consumo ao enviar a rodada para a cozinha, DENTRO da transação de quem chama (Etapa 6). Com
 * BLOQUEAR, falta em qualquer insumo recusa tudo; com PERMITIR_COM_ALERTA, devolve os avisos.
 */
export async function consumeStock(
  deps: InventoryDependencies,
  tx: Transaction,
  ctx: RequestContext,
  lines: readonly ConsumptionLine[],
): Promise<StockShortage[]> {
  const positive = lines.filter((line) => line.quantity > 0);
  if (positive.length === 0) return [];
  const { companyId } = await activeStore(deps, tx, ctx);
  const ids = [...new Set(positive.map((line) => line.ingredientId))];
  const ingredients = new Map(
    (await deps.repo.findIngredients(tx, companyId, ids)).map((item) => [item.id, item]),
  );
  const requests: MovementRequest[] = positive.map((line) => {
    // Insumo de outra empresa (ou inexistente) nunca é baixado
    const ingredient = ingredients.get(line.ingredientId);
    if (!ingredient) throw errors.ingredientNotFound();
    return {
      ingredient,
      type: 'CONSUMO_VENDA',
      quantity: -line.quantity,
      checksPolicy: true,
      originType: 'ORDER_ITEM',
      originId: line.originId,
    };
  });
  return applyMovements(deps, tx, ctx, requests);
}

/** O que ainda está consumido (e não estornado) de uma origem, por insumo. */
async function outstandingConsumption(
  deps: InventoryDependencies,
  tx: Transaction,
  ctx: RequestContext,
  originId: Id,
) {
  const rows = await deps.repo.saleMovementsOf(tx, {
    storeId: ctx.storeId,
    originType: 'ORDER_ITEM',
    originId,
  });
  const byIngredient = new Map<
    Id,
    { quantity: number; valueCents: number; unitCostMicros: bigint }
  >();
  for (const row of rows) {
    const current = byIngredient.get(row.ingredientId) ?? {
      quantity: 0,
      valueCents: 0,
      unitCostMicros: row.unitCostMicros,
    };
    byIngredient.set(row.ingredientId, {
      quantity: current.quantity + row.quantity,
      valueCents: current.valueCents + row.valueCents,
      unitCostMicros: row.type === 'CONSUMO_VENDA' ? row.unitCostMicros : current.unitCostMicros,
    });
  }
  const { companyId } = await activeStore(deps, tx, ctx);
  const pending = [...byIngredient].filter(([, value]) => value.quantity < 0);
  const ingredients = new Map(
    (
      await deps.repo.findIngredients(
        tx,
        companyId,
        pending.map(([id]) => id),
      )
    ).map((item) => [item.id, item]),
  );
  return pending.flatMap(([id, value]) => {
    const ingredient = ingredients.get(id);
    return ingredient ? [{ ingredient, ...value }] : [];
  });
}

/**
 * Item cancelado ANTES do preparo (RN-INV-13): devolve ao estoque exatamente o que foi consumido,
 * com o custo do consumo. Repetir não faz nada.
 */
export async function reverseConsumption(
  deps: InventoryDependencies,
  tx: Transaction,
  ctx: RequestContext,
  originId: Id,
): Promise<void> {
  const pending = await outstandingConsumption(deps, tx, ctx, originId);
  await applyMovements(
    deps,
    tx,
    ctx,
    pending.map((item) => ({
      ingredient: item.ingredient,
      type: 'ESTORNO_VENDA',
      quantity: -item.quantity,
      fixed: { valueCents: -item.valueCents, unitCostMicros: item.unitCostMicros },
      checksPolicy: false,
      originType: 'ORDER_ITEM',
      originId,
    })),
  );
}

/**
 * Item cancelado DEPOIS do preparo (RN-INV-14): o insumo já saiu; o consumo vira perda. Estorno +
 * perda de mesma quantidade e custo — o saldo não muda, o CMV não conta o item, a perda aparece.
 */
export async function consumptionToLoss(
  deps: InventoryDependencies,
  tx: Transaction,
  ctx: RequestContext,
  originId: Id,
): Promise<void> {
  const pending = await outstandingConsumption(deps, tx, ctx, originId);
  await applyMovements(
    deps,
    tx,
    ctx,
    pending.flatMap((item) => [
      {
        ingredient: item.ingredient,
        type: 'ESTORNO_VENDA' as const,
        quantity: -item.quantity,
        fixed: { valueCents: -item.valueCents, unitCostMicros: item.unitCostMicros },
        checksPolicy: false,
        originType: 'ORDER_ITEM' as const,
        originId,
      },
      {
        ingredient: item.ingredient,
        type: 'PERDA' as const,
        quantity: item.quantity,
        fixed: { valueCents: item.valueCents, unitCostMicros: item.unitCostMicros },
        checksPolicy: false,
        lossReason: 'CANCELAMENTO_APOS_PREPARO' as const,
        originType: 'ORDER_ITEM' as const,
        originId,
      },
    ]),
  );
}

/** CMV da loja no período (dias operacionais, inclusive) em centavos — RN-INV-15. */
export async function costOfGoodsSold(
  deps: Pick<InventoryDependencies, 'repo'>,
  tx: Transaction,
  scope: { storeId: Id; from: string; to: string },
): Promise<number> {
  const total = await deps.repo.sumValues(tx, {
    ...scope,
    types: ['CONSUMO_VENDA', 'ESTORNO_VENDA'],
  });
  return total === 0 ? 0 : -total;
}

/** Perdas da loja no período (manuais e por cancelamento), em centavos. */
export async function lossesValue(
  deps: Pick<InventoryDependencies, 'repo'>,
  tx: Transaction,
  scope: { storeId: Id; from: string; to: string },
): Promise<number> {
  const total = await deps.repo.sumValues(tx, { ...scope, types: ['PERDA'] });
  return total === 0 ? 0 : -total;
}

/** Custo médio de cada insumo da empresa na loja (ficha técnica — Recipes). */
export async function ingredientCosts(
  deps: Pick<InventoryDependencies, 'repo'>,
  tx: Transaction,
  scope: { companyId: Id; storeId: Id },
): Promise<IngredientWithStock[]> {
  return deps.repo.listIngredients(tx, { ...scope, search: null, includeInactive: true });
}

export type { StockRecord };
