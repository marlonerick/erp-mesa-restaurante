import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// Prova que as regras de arquitetura do eslint.config.js realmente bloqueiam importações
// proibidas (critério de aceite da Etapa 1). As regras que dependem de tipos são desligadas
// aqui porque os arquivos analisados são virtuais.
const eslint = new ESLint({ overrideConfig: [tseslint.configs.disableTypeChecked] });

async function lint(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId);
}

const ALLOWED: string[] = [];

describe('fronteiras de arquitetura (docs/architecture/visao-geral.md §2)', () => {
  it.each([
    ['domain → React', 'src/modules/orders/domain/order.ts', "import 'react';"],
    ['domain → Next', 'src/modules/orders/domain/order.ts', "import 'next/headers';"],
    ['domain → ORM', 'src/modules/orders/domain/order.ts', "import 'drizzle-orm';"],
    ['domain → driver MySQL', 'src/modules/orders/domain/order.ts', "import 'mysql2/promise';"],
    [
      'domain → banco compartilhado',
      'src/modules/orders/domain/order.ts',
      "import '@/shared/db/client';",
    ],
    ['domain → logger', 'src/modules/orders/domain/order.ts', "import '@/shared/logger/logger';"],
    [
      'domain → infrastructure',
      'src/modules/orders/domain/order.ts',
      "import '../infrastructure/repo';",
    ],
    [
      'domain → application',
      'src/modules/orders/domain/order.ts',
      "import '../application/use-case';",
    ],
    ['application → ORM', 'src/modules/orders/application/open.ts', "import 'drizzle-orm';"],
    [
      'application → infrastructure',
      'src/modules/orders/application/open.ts',
      "import '../infrastructure/repo';",
    ],
    [
      'módulo → interior de outro módulo',
      'src/modules/payments/application/pay.ts',
      "import '@/modules/orders/domain/order';",
    ],
    [
      'módulo → outro módulo por caminho relativo',
      'src/modules/tables/domain/table.ts',
      "import '../../orders/domain/order';",
    ],
    ['kernel → logger', 'src/shared/kernel/money.ts', "import '@/shared/logger/logger';"],
    ['kernel → React', 'src/shared/kernel/money.ts', "import 'react';"],
    ['tela → banco', 'src/app/pdv/page.tsx', "import '@/shared/db/client';"],
    ['tela → domínio de módulo', 'src/app/pdv/page.tsx', "import '@/modules/orders/domain/order';"],
    // Revisão: o domínio só pode depender do kernel dentro de shared/
    [
      'domain → idempotência',
      'src/modules/orders/domain/order.ts',
      "import '@/shared/idempotency/idempotency';",
    ],
    ['domain → config', 'src/modules/orders/domain/order.ts', "import '@/shared/config/env';"],
    [
      'domain → erros HTTP',
      'src/modules/orders/domain/order.ts',
      "import '@/shared/errors/error-response';",
    ],
    // Revisão: a UI também não entra no domínio por caminho relativo
    [
      'tela → domínio por caminho relativo',
      'src/app/pdv/page.tsx',
      "import '../../modules/orders/domain/order';",
    ],
  ])('bloqueia %s', async (_label, file, code) => {
    expect(await lint(file, code)).toContain('no-restricted-imports');
  });

  it.each([
    ['domain → kernel', 'src/modules/orders/domain/order.ts', "import '@/shared/kernel';"],
    [
      'domain → outro arquivo do domínio',
      'src/modules/orders/domain/order.ts',
      "import './order-item';",
    ],
    [
      'application → domain do próprio módulo',
      'src/modules/orders/application/open.ts',
      "import '../domain/order';",
    ],
    [
      'módulo → API pública de outro módulo',
      'src/modules/payments/application/pay.ts',
      "import '@/modules/orders';",
    ],
    ['infrastructure → ORM', 'src/modules/orders/infrastructure/repo.ts', "import 'drizzle-orm';"],
    [
      'tela → interface de módulo',
      'src/app/pdv/page.tsx',
      "import '@/modules/orders/interface/actions';",
    ],
  ])('permite %s', async (_label, file, code) => {
    expect(await lint(file, code)).toEqual(ALLOWED);
  });
});

describe('regras invioláveis (README B.12)', () => {
  it('proíbe any sem justificativa', async () => {
    expect(await lint('src/shared/x.ts', 'export const x: any = 1;')).toContain(
      '@typescript-eslint/no-explicit-any',
    );
  });

  it('proíbe @ts-ignore', async () => {
    expect(await lint('src/shared/x.ts', '// @ts-ignore\nexport const x = 1;')).toContain(
      '@typescript-eslint/ban-ts-comment',
    );
  });

  it('proíbe dangerouslySetInnerHTML', async () => {
    const code = 'export const C = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;';
    expect(await lint('src/ui/c.tsx', code)).toContain('no-restricted-syntax');
  });

  it('proíbe console no código da aplicação (usar o logger)', async () => {
    expect(await lint('src/shared/x.ts', "console.log('x');")).toContain('no-console');
  });
});
