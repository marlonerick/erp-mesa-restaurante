// Conventional Commits (README B.12) com o escopo da semana/etapa (decisão do usuário, 2026-09-28):
//   tipo(semana-N): etapa N - o que foi feito
//   ex.: feat(semana-2): etapa 2 - adiciona login com sessão revogável
const SEMANA = /^semana-(\d+)$/;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'escopo-semana': ({ scope }) => [
          SEMANA.test(scope ?? ''),
          'use o escopo da semana: tipo(semana-N): etapa N - descrição',
        ],
        'assunto-etapa': ({ scope, subject }) => {
          const match = SEMANA.exec(scope ?? '');
          if (!match) return [true];
          const prefix = `etapa ${match[1]} - `;
          return [
            (subject ?? '').startsWith(prefix) && (subject ?? '').length > prefix.length,
            `o assunto deve começar com "${prefix}" seguido do que foi feito`,
          ];
        },
      },
    },
  ],
  rules: {
    'subject-case': [0],
    'body-max-line-length': [1, 'always', 100],
    'escopo-semana': [2, 'always'],
    'assunto-etapa': [2, 'always'],
  },
};
