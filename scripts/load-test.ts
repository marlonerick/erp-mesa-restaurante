// Teste de carga leve do piloto (Etapa 10 — README B.11): 1 loja, 10 mesas girando, 2 garçons,
// cozinha, caixa e gerente durante alguns minutos.
//
// - Leituras automáticas das telas pela REDE, com sessões reais: salão (5 s), comanda aberta (5 s),
//   cozinha (3 s) e painel (30 s).
// - A operação do salão pelos MESMOS casos de uso das telas, no mesmo banco: abrir mesa, lançar,
//   enviar, cozinha pronta, pedir conta, receber no PIX, liberar a mesa.
//
// Uso (servidor de produção já no ar — ver docs/testing/carga.md):
//   BASE_URL=http://localhost:3100 DATABASE_URL=mysql://…/erp_e2e npm run load:test
// Variáveis opcionais: LOAD_SECONDS (padrão 180), LOAD_TABLES (padrão 10).
import { eq } from 'drizzle-orm';
import { authService } from '@/modules/auth';
import { storeAccess } from '@/modules/authorization';
import { cashierService } from '@/modules/cashier';
import { kitchenService } from '@/modules/kitchen';
import { ordersService } from '@/modules/orders';
import { organizationAdministration } from '@/modules/organizations';
import { posService } from '@/modules/pos';
import { tablesService } from '@/modules/tables';
import { getDatabase } from '@/shared/db/client';
import { terminal } from '@/shared/db/schema';
import { type Id, isDomainError, newId, type RequestContext } from '@/shared/kernel';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
/** Mesmo nome que o servidor usa: com APP_ORIGIN em https, o cookie leva o prefixo __Host-. */
const SESSION_COOKIE = (process.env.APP_ORIGIN ?? '').startsWith('https://')
  ? '__Host-erp_session'
  : 'erp_session';
const SECONDS = Number(process.env.LOAD_SECONDS ?? 180);
const TABLES = Number(process.env.LOAD_TABLES ?? 10);
/** Metas do piloto: leituras das telas e operações rápidas o bastante para o salão. */
const HTTP_P95_MS = 300;
const OPERATION_P95_MS = 500;

const TEAM = {
  joao: 'Garcom@2026',
  ana: 'Garcom@2026',
  cozinha: 'Cozinha@2026',
  caixa: 'Caixa@2026',
  gerente: 'Gerente@2026',
} as const;
type Person = keyof typeof TEAM;

// ---- Medições ----

const samples = new Map<string, { ms: number[]; errors: number; lastError?: string }>();

function record(name: string, ms: number, error?: unknown) {
  const entry = samples.get(name) ?? { ms: [], errors: 0 };
  entry.ms.push(ms);
  if (error !== undefined) {
    entry.errors += 1;
    entry.lastError = isDomainError(error)
      ? error.code
      : error instanceof Error
        ? error.message
        : 'erro desconhecido';
  }
  samples.set(name, entry);
}

async function measure<T>(name: string, work: () => Promise<T>): Promise<T | undefined> {
  const start = performance.now();
  try {
    const result = await work();
    record(name, performance.now() - start);
    return result;
  } catch (error) {
    record(name, performance.now() - start, error);
    return undefined;
  }
}

const percentile = (values: readonly number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.4);

// ---- Preparação ----

const meta = { ip: '127.0.0.1', userAgent: 'load-test', requestId: 'load-test' };
const db = getDatabase();
const auth = authService();
const orders = ordersService();
const kitchen = kitchenService();
const pos = posService();
const cashier = cashierService();
const tables = tablesService();
const organizations = organizationAdministration({ access: storeAccess });

async function signIn(person: Person) {
  const result = await auth.login(
    { username: person, password: TEAM[person], sharedDevice: false, deviceToken: null },
    meta,
  );
  const session = await auth.authenticate(result.sessionToken, meta);
  if (!session) throw new Error(`não entrou como ${person}`);
  return { token: result.sessionToken, ctx: session.context };
}

const ready = await fetch(`${BASE_URL}/ready`).catch(() => null);
if (ready?.status !== 200) {
  console.error(`O servidor em ${BASE_URL} não está pronto (/ready). Suba o servidor antes.`);
  process.exit(1);
}

const people = Object.fromEntries(
  await Promise.all((Object.keys(TEAM) as Person[]).map(async (p) => [p, await signIn(p)])),
) as Record<Person, Awaited<ReturnType<typeof signIn>>>;
const storeId = people.gerente.ctx.storeId;
const run = Math.random().toString(36).slice(2, 6).toUpperCase();

// Terminal de caixa deste "aparelho" e caixa aberto (como na Etapa 8)
const { id: terminalId } = await organizations.createTerminal(people.gerente.ctx, {
  code: `CARGA-${run}`,
  name: `Caixa carga ${run}`,
  kind: 'CAIXA',
});
await db.db
  .update(terminal)
  .set({ deviceId: people.caixa.ctx.deviceId })
  .where(eq(terminal.id, terminalId));
await cashier.open(people.caixa.ctx, { openingCents: 0, idempotencyKey: newId() });

// Mesas desta execução (número único por execução)
const tableIds: Id[] = [];
for (let index = 1; index <= TABLES; index += 1) {
  const { id } = await tables.createTable(people.gerente.ctx, {
    number: `L${run}${String(index).padStart(2, '0')}`.slice(0, 10),
    area: 'Carga',
    seats: 4,
  });
  tableIds.push(id);
}

const menu = await orders.menu(people.joao.ctx);
// Sem adicional obrigatório (o garçom teria de escolher — a recusa seria correta)
const simple = menu.filter((product) =>
  product.modifierGroups.every((group) => group.minSelect === 0),
);
const withPrep = simple.filter((product) => product.requiresPreparation).slice(0, 3);
const noPrep = simple.find((product) => !product.requiresPreparation);
if (withPrep.length === 0) throw new Error('o cardápio da loja não tem produtos com preparo');

console.info(
  `Carga: ${String(TABLES)} mesas, ${String(SECONDS)} s, loja ${String(storeId)}, servidor ${BASE_URL}`,
);

// ---- Leituras automáticas das telas (pela rede) ----

const endAt = Date.now() + SECONDS * 1000;
const running = () => Date.now() < endAt;

async function poll(name: string, person: Person, path: string, everyMs: number) {
  while (running()) {
    await measure(name, async () => {
      const response = await fetch(`${BASE_URL}${path}?loja=${String(storeId)}`, {
        headers: {
          cookie: `${SESSION_COOKIE}=${people[person].token}`,
          accept: 'application/json',
        },
      });
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    });
    await sleep(jitter(everyMs));
  }
}

// ---- Operação ----

async function tableLoop(tableId: Id, waiter: RequestContext, waiterToken: string) {
  while (running()) {
    const opened = await measure('abrir mesa', () =>
      orders.openTable(waiter, { tableId, guests: 2 }),
    );
    if (!opened) {
      await sleep(2000);
      continue;
    }
    const { orderId } = opened;
    const screen = { reading: true };
    const comanda = (async () => {
      while (screen.reading) {
        await measure('GET /api/comandas/:id', async () => {
          const response = await fetch(
            `${BASE_URL}/api/comandas/${String(orderId)}?loja=${String(storeId)}`,
            {
              headers: { cookie: `${SESSION_COOKIE}=${waiterToken}`, accept: 'application/json' },
            },
          );
          await response.arrayBuffer();
          if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
        });
        await sleep(jitter(5000));
      }
    })();

    for (const product of [...withPrep, ...(noPrep ? [noPrep] : [])]) {
      await measure('lançar item', () =>
        orders.addItem(waiter, { orderId, productId: product.productId, quantity: 1 }),
      );
      await sleep(jitter(1500));
    }
    const detail = await measure('ler comanda', () => orders.getOrder(waiter, orderId));
    await measure('enviar rodada', () =>
      orders.sendRound(waiter, {
        orderId,
        itemIds: detail?.pending.map((item) => item.id) ?? [],
        idempotencyKey: newId(),
      }),
    );
    // Clientes comendo
    await sleep(jitter(20_000));
    const current = await measure('ler comanda', () => orders.getOrder(waiter, orderId));
    if (current) {
      await measure('pedir conta', () =>
        orders.requestBill(waiter, { orderId, version: current.version }),
      );
    }
    // Espera o caixa receber; depois a mesa é liberada da limpeza
    let paid = false;
    for (let tries = 0; tries < 30 && !paid; tries += 1) {
      const floor = await orders.floor(waiter);
      paid = floor.tables.find((table) => table.id === tableId)?.status === 'LIMPEZA';
      if (!paid) await sleep(2000);
    }
    screen.reading = false;
    await comanda;
    // Só a mesa paga vai para limpeza e pode ser liberada
    if (paid) {
      await measure('liberar mesa', () => tables.releaseTable(people.gerente.ctx, { tableId }));
    }
    await sleep(jitter(3000));
  }
}

async function kitchenLoop() {
  while (running()) {
    const board = await measure('cozinha: ler fila', () => kitchen.board(people.cozinha.ctx));
    for (const ticket of board?.queue ?? []) {
      // Pronto alguns segundos depois de chegar
      if (Date.now() - ticket.createdAt.getTime() < 8000) continue;
      await measure('cozinha: tudo pronto', () =>
        kitchen.readyTicket(people.cozinha.ctx, { ticketId: ticket.id }),
      );
    }
    await sleep(jitter(3000));
  }
}

async function cashierLoop() {
  while (running()) {
    const list = await measure('caixa: contas a receber', () => pos.receivables(people.caixa.ctx));
    for (const order of list ?? []) {
      if (order.pendingCount > 0 || order.totals.balanceCents <= 0) continue;
      const detail = await orders.getOrder(people.caixa.ctx, order.orderId);
      // Só quem pediu a conta (como o caixa faria)
      if (detail.status !== 'ABERTO') continue;
      if (!detail.tables.some((table) => table.status === 'AGUARDANDO_CONTA')) continue;
      await measure('caixa: receber PIX', () =>
        pos.pay(people.caixa.ctx, {
          orderId: order.orderId,
          method: 'PIX',
          amountCents: order.totals.balanceCents,
          idempotencyKey: newId(),
        }),
      );
    }
    await sleep(jitter(2000));
  }
}

await Promise.all([
  ...tableIds.map((tableId, index) => {
    const waiter = index % 2 === 0 ? people.joao : people.ana;
    return tableLoop(tableId, waiter.ctx, waiter.token);
  }),
  kitchenLoop(),
  cashierLoop(),
  poll('GET /api/salao', 'joao', '/api/salao', 5000),
  poll('GET /api/salao', 'ana', '/api/salao', 5000),
  poll('GET /api/cozinha', 'cozinha', '/api/cozinha', 3000),
  poll('GET /api/painel', 'gerente', '/api/painel', 30_000),
  poll('GET /api/painel', 'caixa', '/api/painel', 30_000),
]);

// ---- Encerramento e relatório ----

const screen = await cashier.current(people.caixa.ctx);
if (screen.session) {
  await cashier
    .close(people.caixa.ctx, {
      sessionId: screen.session.id,
      version: screen.session.version,
      declared: { DINHEIRO: 0 },
      idempotencyKey: newId(),
    })
    .catch(() => undefined);
}

const rows = [...samples.entries()]
  .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
  .map(([name, entry]) => {
    const p95 = percentile(entry.ms, 95);
    const limit = name.startsWith('GET ') ? HTTP_P95_MS : OPERATION_P95_MS;
    const ok = entry.errors === 0 && p95 <= limit;
    return {
      operação: name,
      vezes: entry.ms.length,
      'mediana (ms)': Math.round(percentile(entry.ms, 50)),
      'p95 (ms)': Math.round(p95),
      'máx (ms)': Math.round(Math.max(...entry.ms)),
      erros: entry.errors,
      meta: `p95 ≤ ${String(limit)}`,
      resultado: ok ? 'ok' : `FALHOU${entry.lastError ? ` (${entry.lastError})` : ''}`,
    };
  });
console.table(rows);
const failed = rows.some((row) => row.resultado !== 'ok');
await db.close();
console.info(failed ? 'Resultado: FORA DA META' : 'Resultado: dentro da meta');
process.exit(failed ? 1 : 0);
