# MemoryOS

> A permanent, intelligent memory layer for humans.

[![Foundation](https://img.shields.io/badge/Foundation-v1.0.0-violet)](./FOUNDATION.md)
[![Status](https://img.shields.io/badge/Status-Frozen%20Baseline-green)](./FOUNDATION.md)
[![Phase](https://img.shields.io/badge/Phase-Engineering%20First-blue)](./journey/ROADMAP.md)

---

## O que é o MemoryOS

O MemoryOS é uma camada de memória permanente e inteligente projetada para preservar o conhecimento de longo prazo do usuário — permitindo que ele converse naturalmente com sua própria história, sem precisar gerenciar arquivos, chats ou resumos manuais.

É o sistema operacional da memória humana.

---

## Objetivos

- Preservar conhecimento de forma permanente e estruturada
- Permitir consulta natural em linguagem humana
- Conectar contexto entre sessões, documentos e eventos
- Aprender e evoluir com o uso
- Operar de forma transparente, auditável e segura

---

## Filosofia

| Princípio | Descrição |
|---|---|
| **Permanência** | Nenhum conhecimento é perdido |
| **Continuidade** | Toda sessão conhece o passado |
| **Transparência** | Toda decisão é rastreável |
| **Segurança** | Nenhuma ação de alto risco ocorre sem aprovação |
| **Evolução** | A arquitetura cresce por RFC, nunca por impulso |

---

## Arquitetura em Alto Nível

```
┌─────────────────────────────────────────────────────┐
│                   User Interface                     │
│              (Voice + Text + Files)                  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  Core Layer                          │
│   WorkingMemory · EventBus · AuditTrail · Security   │
└──────┬──────────┬────────────┬────────┬─────────────┘
       │          │            │        │
  Journey    Execution    Knowledge  Decision
  Manager     Engine       Engine    Engine
       │          │            │        │
┌──────▼──────────▼────────────▼────────▼─────────────┐
│                Connector Layer                       │
│         (HTTP · Email · Gov · Custom SDKs)           │
└─────────────────────────────────────────────────────┘
```

---

## Organização da Foundation

```
foundation/
├── README.md              ← Este arquivo
├── FOUNDATION.md          ← Declaração oficial
├── CHANGELOG.md           ← Histórico de versões
├── LICENSE.md             ← Licença
├── CODE_OF_CONDUCT.md     ← Código de conduta
├── CONTRIBUTING.md        ← Como contribuir
├── SECURITY.md            ← Política de segurança
├── GOVERNANCE.md          ← Governança
├── docs/
│   ├── vision/            ← MV
│   ├── product/           ← MPS
│   ├── architecture/      ← MAS, MDS, MRS, MCS
│   ├── intelligence/      ← MDIS, MIES
│   └── platform/          ← MDPS, MGFS, MRI, MQCCS, MPEGS
├── rfc/                   ← RFC-000, RFC-001+
├── adr/                   ← ADR-INDEX
├── templates/             ← Templates oficiais
└── journey/               ← Roadmap, Sprints, Milestones
```

---

## Como Navegar pela Documentação

**Novo no projeto?** Comece por:
1. [FOUNDATION.md](./FOUNDATION.md) — Declaração oficial
2. [docs/vision/MV.md](./docs/vision/MV.md) — Visão
3. [docs/product/MPS.md](./docs/product/MPS.md) — Produto
4. [docs/architecture/MAS.md](./docs/architecture/MAS.md) — Arquitetura

**Desenvolvedor?** Leia:
1. [docs/architecture/MDS.md](./docs/architecture/MDS.md) — Developer Spec
2. [docs/platform/MRI.md](./docs/platform/MRI.md) — Reference Implementation
3. [templates/SDK_TEMPLATE.md](./templates/SDK_TEMPLATE.md) — SDK Template

**Contribuindo?** Siga:
1. [CONTRIBUTING.md](./CONTRIBUTING.md) — Guia de contribuição
2. [templates/RFC_TEMPLATE.md](./templates/RFC_TEMPLATE.md) — Template de RFC
3. [rfc/RFC-000.md](./rfc/RFC-000.md) — Primeira RFC aprovada

---

## Índice Geral dos Documentos

| # | Sigla | Nome | Categoria | Status |
|---|---|---|---|---|
| 01 | **MV**    | Memory Vision                           | Visão          | Aprovado |
| 02 | **MPS**   | Memory Product Specification            | Produto        | Aprovado |
| 03 | **MAS**   | Memory Architecture Specification       | Arquitetura    | Aprovado |
| 04 | **MDS**   | Memory Developer Specification          | Engenharia     | Aprovado |
| 05 | **MRS**   | Memory Runtime Specification            | Runtime        | Aprovado |
| 06 | **MCS**   | Memory Core Specification               | Core           | Aprovado |
| 07 | **MDIS**  | Memory Decision Intelligence Spec       | Inteligência   | Aprovado |
| 08 | **MIES**  | Memory Intelligence Evolution Spec      | Evolução       | Aprovado |
| 09 | **MDPS**  | Memory Developer Platform Spec          | Plataforma     | Aprovado |
| 10 | **MGFS**  | Memory Governance & Foundation Spec     | Governança     | Aprovado |
| 11 | **MRI**   | Memory Reference Implementation         | Implementação  | Aprovado |
| 12 | **MQCCS** | Memory Quality, Compliance & Cert Spec  | Qualidade      | Aprovado |
| 13 | **MPEGS** | Memory Platform Evolution Governance    | Evolução       | Aprovado |

---

## Processo RFC

Toda evolução da plataforma ocorre exclusivamente via RFC:

```
Proposta → Discussão (14d mínimo) → Votação → ADR → Implementação
```

- Veja o template: [templates/RFC_TEMPLATE.md](./templates/RFC_TEMPLATE.md)
- Primeira RFC: [rfc/RFC-000.md](./rfc/RFC-000.md)

---

## Processo ADR

Toda decisão arquitetural é documentada como ADR:

```
RFC aprovada → ADR criado → Implementação → Revisão
```

- Índice: [adr/ADR-INDEX.md](./adr/ADR-INDEX.md)
- Template: [templates/ADR_TEMPLATE.md](./templates/ADR_TEMPLATE.md)

---

## Processo de Release

```
Implementação → MRI (validação) → MQCCS (certificação) → Release
```

- Histórico: [CHANGELOG.md](./CHANGELOG.md)
- Roadmap: [journey/ROADMAP.md](./journey/ROADMAP.md)

---

## Processo de Certificação

Todo componente é certificado antes do release pelo MQCCS:

| Nível | Score Mínimo | Requisitos |
|---|---|---|
| Community | 70% | Testes básicos |
| Certified | 85% | + Performance |
| Official | 95% | + Audit completo |

---

*MemoryOS Foundation v1.0.0 — Frozen Baseline — 2026-07-10*