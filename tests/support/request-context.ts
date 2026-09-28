import { type Clock, type Id, newId, type Permission, type RequestContext } from '@/shared/kernel';
import { FakeClock } from './fake-clock';

interface Options {
  readonly permissions?: readonly Permission[];
  readonly userId?: Id;
  readonly organizationId?: Id;
  readonly storeId?: Id;
  readonly sessionId?: Id;
  readonly clock?: Clock;
}

/** Contexto de requisição para testes de casos de uso. */
export class FakeRequestContext implements RequestContext {
  readonly requestId = 'req-test';
  readonly sessionId: Id;
  readonly userId: Id;
  readonly organizationId: Id;
  readonly storeId: Id;
  readonly permissions: ReadonlySet<Permission>;
  readonly ip = '127.0.0.1';
  readonly userAgent = 'vitest';
  readonly clock: Clock;

  constructor(options: Options = {}) {
    this.sessionId = options.sessionId ?? newId();
    this.userId = options.userId ?? newId();
    this.organizationId = options.organizationId ?? newId();
    this.storeId = options.storeId ?? newId();
    this.permissions = new Set(options.permissions ?? []);
    this.clock = options.clock ?? new FakeClock(new Date('2026-03-14T21:00:00.000Z'));
  }
}
