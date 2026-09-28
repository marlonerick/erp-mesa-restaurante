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

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }

  advanceMinutes(minutes: number): void {
    this.advanceSeconds(minutes * 60);
  }

  advanceHours(hours: number): void {
    this.advanceSeconds(hours * 60 * 60);
  }
}
