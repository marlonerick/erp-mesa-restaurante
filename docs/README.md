# Documentação — ERP para Restaurantes

Fonte única de verdade do produto: [`/README.md`](../README.md) (Partes A e B).
Status do projeto: [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Índice

| Pasta | Conteúdo |
|---|---|
| [requirements/](requirements/) | Visão, escopo do MVP, priorização P0–P3, riscos, perguntas abertas |
| [architecture/](architecture/) | Arquitetura, estrutura de diretórios, ferramentas, performance |
| [database/](database/) | Modelo de dados do MVP, convenções, índices e constraints |
| [api/](api/) | Convenções de contrato, padrão de erro, idempotência, paginação |
| [security/](security/) | Estratégia de segurança e LGPD |
| [testing/](testing/) | Estratégia de TDD, BDD, SDD e pipeline de CI |
| [modules/](modules/) | Uma especificação SDD por módulo (template em `_TEMPLATE-SDD.md`) |
| [integrations/](integrations/) | Integrações futuras e abstrações previstas |
| [deployment/](deployment/) | Ambientes, versões, backup |
| [decisions/](decisions/) | ADRs (contexto, opções, decisão, consequências) |
| [weeks/](weeks/) | Um documento por etapa (`etapa-XX.md`) |

Diagramas (Mermaid) ficam em [`/maps`](../maps/ROADMAP.md).

## Convenções

- Idioma da documentação e do domínio: português. Código (identificadores): inglês.
- Estados e enums de domínio mantêm os nomes do README (`LIVRE`, `ABERTO`, `ENVIADO`...).
- Todo ADR começa com status `Proposto`; passa a `Aceito` somente após aprovação do usuário.
