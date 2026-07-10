# CONTRIBUTING.md
## Como Contribuir com o MemoryOS

---

## Bem-vindo

O MemoryOS é uma plataforma open-architecture. Contribuições são bem-vindas através do processo formal de RFC.

---

## Como Propor uma Mudança

### 1. Verifique se já existe uma RFC ou ADR relacionada

Consulte [rfc/](./rfc/) e [adr/ADR-INDEX.md](./adr/ADR-INDEX.md).

### 2. Crie uma RFC usando o template oficial

```
templates/RFC_TEMPLATE.md
```

### 3. Submeta para discussão

Abra uma issue com o prefixo `[RFC]` e o título da sua proposta.

### 4. Aguarde o período mínimo de discussão

- Features: 14 dias
- Breaking changes: 30 dias
- Critical: 30 dias + votação formal

### 5. Aguarde aprovação do Core Team

Após aprovação, o ADR correspondente será criado.

### 6. Implemente

Toda implementação deve:
- Passar nos testes do MRI
- Ser certificada pelo MQCCS (score mínimo 85%)
- Incluir documentação atualizada

---

## Tipos de Contribuição

| Tipo | Processo |
|---|---|
| Bug fix de documentação | PR direto |
| Nova feature | RFC → ADR → Implementação |
| Breaking change | RFC crítica → ADR → Implementação |
| Novo Connector | RFC + SDK_TEMPLATE |
| Novo Specialist | RFC + SPECIALIST_TEMPLATE |
| Knowledge Package | RFC + KNOWLEDGE_PACKAGE_TEMPLATE |

---

## Padrões de Código

- TypeScript para todos os engines do Core
- JavaScript para libs auxiliares
- Testes obrigatórios no MRI
- Score MQCCS mínimo: 85%

---

## Código de Conduta

Veja [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*