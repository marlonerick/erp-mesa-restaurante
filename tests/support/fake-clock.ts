import type { Clock } from '@/shared/kernel';

/** Relógio controlável para testes de tempo (KDS, expiração, dia operacional). */
export class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = new Date(date);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}
