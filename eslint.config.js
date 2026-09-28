import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ---------------------------------------------------------------------------
// Fronteiras de arquitetura (docs/architecture/visao-geral.md §2).
// Implementadas com a regra nativa `no-restricted-imports` para não depender de
// um resolvedor extra de caminhos. Cada camada recebe a lista COMPLETA de
// restrições, porque a última configuração que casa com um arquivo vence.
// ---------------------------------------------------------------------------

const frameworkPaths = [
  { name: 'react', message: 'Domínio/aplicação não dependem de React.' },
  { name: 'react-dom', message: 'Domínio/aplicação não dependem de React.' },
  { name: 'next', message: 'Domínio/aplicação não dependem de Next.js.' },
];
const frameworkPatterns = [
  { regex: '^(next|react-dom)/', message: 'Domínio/aplicação não dependem de Next.js/React.' },
];
const persistencePatterns = [
  {
    regex: '^(drizzle-orm|mysql2)(/|$)',
    message: 'Acesso a banco apenas em infrastructure/ (repositórios).',
  },
  { regex: '^@/shared/db(/|$)', message: 'Acesso a banco apenas em infrastructure/.' },
];
const loggerPatterns = [
  {
    regex: '^(pino(/|$)|@/shared/logger(/|$))',
    message: 'Domínio é puro: sem logger. Retorne erros de domínio.',
  },
];
const crossModulePatterns = [
  {
    regex: '^@/modules/[^/]+/.+',
    message: 'Use apenas a API pública do outro módulo: "@/modules/<modulo>".',
  },
  {
    regex:
      '^(\\.\\./)+(?!(domain|application|infrastructure|interface|\\.\\.)/)[^./][^/]*/(domain|application|infrastructure|interface)(/|$)',
    message: 'Não acesse camadas internas de outro módulo por caminho relativo.',
  },
];

const domainRestrictions = [
  'error',
  {
    paths: frameworkPaths,
    patterns: [
      ...frameworkPatterns,
      ...persistencePatterns,
      ...loggerPatterns,
      ...crossModulePatterns,
      {
        regex: '(^|/)(application|infrastructure|interface)(/|$)',
        message: 'domain/ não depende de camadas externas.',
      },
      {
        regex: '^@/(app|ui)(/|$)',
        message: 'domain/ não depende de UI.',
      },
      {
        regex: '^@/shared/(?!kernel(/|$))',
        message: 'Em shared/, o domínio só pode depender do kernel (@/shared/kernel).',
      },
    ],
  },
];

const kernelRestrictions = [
  'error',
  {
    paths: frameworkPaths,
    patterns: [
      ...frameworkPatterns,
      ...persistencePatterns,
      ...loggerPatterns,
      { regex: '^@/(modules|app|ui)(/|$)', message: 'O kernel não depende de módulos nem de UI.' },
      {
        regex: '^@/shared/(?!kernel(/|$))',
        message: 'O kernel só depende de si mesmo.',
      },
    ],
  },
];

const applicationRestrictions = [
  'error',
  {
    paths: frameworkPaths,
    patterns: [
      ...frameworkPatterns,
      { regex: '^(drizzle-orm|mysql2)(/|$)', message: 'ORM/driver apenas em infrastructure/.' },
      ...crossModulePatterns,
      {
        regex: '(^|/)(infrastructure|interface)(/|$)',
        message: 'application/ depende de portas (interfaces), não de implementações.',
      },
      { regex: '^@/(app|ui)(/|$)', message: 'application/ não depende de UI.' },
    ],
  },
];

const moduleOuterRestrictions = [
  'error',
  {
    patterns: [
      ...crossModulePatterns,
      { regex: '^@/(app|ui)(/|$)', message: 'Módulos não dependem da UI.' },
    ],
  },
];

const uiRestrictions = [
  'error',
  {
    patterns: [
      ...persistencePatterns,
      {
        // Pelo atalho "@/" ou por caminho relativo ("../../modules/x/domain")
        regex: '(^@/|/)modules/[^/]+/(domain|application|infrastructure)(/|$)',
        message:
          'A UI conversa com os módulos apenas pela camada interface/ (Server Actions, DTOs).',
      },
    ],
  },
];

export default defineConfig([
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
    '.features-gen/**',
    'drizzle/**',
    'next-env.d.ts',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Regras invioláveis do README (B.12) e de segurança (B.8)
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Proibido dangerouslySetInnerHTML (risco de XSS).',
        },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-console': 'error' },
  },

  // React / Next.js
  {
    files: ['src/**/*.tsx'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },

  // Fronteiras
  {
    files: ['src/modules/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': moduleOuterRestrictions },
  },
  {
    files: ['src/modules/*/application/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': applicationRestrictions },
  },
  {
    files: ['src/modules/*/domain/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': domainRestrictions },
  },
  {
    files: ['src/shared/kernel/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': kernelRestrictions },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': uiRestrictions },
  },

  // Testes: permitem asserções não nulas em fixtures
  {
    files: ['tests/**/*.ts', 'src/**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  prettier,
]);
