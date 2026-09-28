# Módulos

Um diretório por módulo, cada um com as camadas `domain/`, `application/`, `infrastructure/`
e `interface/` (docs/architecture/visao-geral.md). O primeiro módulo entra na Etapa 2.

Regras verificadas pelo ESLint (`eslint.config.js`):

- `domain/` não importa React, Next, ORM, driver de banco, logger nem outras camadas.
- `application/` não importa React, Next, ORM nem `infrastructure/`/`interface/`.
- Outros módulos são acessados apenas pela API pública (`@/modules/<modulo>`), nunca por caminho interno.
