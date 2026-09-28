// Conventional Commits (README B.12). Assuntos em português são permitidos.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'body-max-line-length': [1, 'always', 100],
  },
};
