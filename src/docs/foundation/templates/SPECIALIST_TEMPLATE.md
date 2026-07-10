# Specialist Template
## MemoryOS Specialist — Template Oficial

---

## Estrutura Obrigatória

```typescript
import type { ISpecialist, SpecialistResult, KnowledgeContext } from "@memoryos/core";

export class MySpecialist implements ISpecialist {
  readonly specialistId = "my-specialist";
  readonly domain       = "domain-name";
  readonly capabilities = ["capability-1", "capability-2"];

  async process(
    query: string,
    context: KnowledgeContext
  ): Promise<SpecialistResult> {
    // 1. Identificar intenção
    // 2. Buscar contexto relevante
    // 3. Gerar resposta estruturada

    return {
      specialistId: this.specialistId,
      response:     "Resposta processada",
      confidence:   0.92,
      reasoning:    ["Passo 1", "Passo 2"],
      sources:      [],
      recommendations: [],
    };
  }

  canHandle(query: string): boolean {
    // Determinar se este specialist pode processar a query
    return false;
  }

  getMetadata() {
    return {
      specialistId: this.specialistId,
      domain:       this.domain,
      version:      "1.0.0",
      languages:    ["pt-BR", "en"],
      expertise:    { "topic": 0.9 },
    };
  }
}
```

---

## Checklist de Publicação

- [ ] Implementa `ISpecialist` completamente
- [ ] `canHandle` retorna false para queries fora do domínio
- [ ] Testes no MRI com queries reais do domínio
- [ ] Score MQCCS ≥ 85%
- [ ] RFC aprovada

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*