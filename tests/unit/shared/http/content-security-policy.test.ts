import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { CSP_HEADER, proxy } from '@/proxy';
import { buildContentSecurityPolicy } from '@/shared/http/content-security-policy';

describe('Content Security Policy com nonce (README B.8)', () => {
  it('em produção só libera scripts com o nonce, sem eval', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc123', development: false, https: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('em desenvolvimento permite o recarregamento automático do Next', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc', development: true, https: false });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('o proxy gera um nonce diferente a cada requisição', () => {
    const first = proxy(new NextRequest('http://localhost/login')).headers.get(CSP_HEADER);
    const second = proxy(new NextRequest('http://localhost/login')).headers.get(CSP_HEADER);
    const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? '')?.[1];
    expect(nonceOf(first)).toBeTruthy();
    expect(nonceOf(first)).not.toBe(nonceOf(second));
  });
});
