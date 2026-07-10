# Connector Template
## MemoryOS Connector — Template Oficial

---

## Estrutura Obrigatória

```typescript
import type { IConnector, ConnectorResult, ExecutionContext } from "@memoryos/core";

export class MyConnector implements IConnector {
  readonly connectorId = "my-connector";
  readonly version     = "1.0.0";

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    // 1. Validar input
    // 2. Executar ação
    // 3. Retornar ConnectorResult padronizado

    return {
      status:       "success",
      outputData:   { /* resultado */ },
      auditLog:     [`executed at ${new Date().toISOString()}`],
      resourceRef:  `ref:${ctx.executionId}`,
    };
  }

  async rollback(previousOutput: unknown, ctx: ExecutionContext): Promise<void> {
    // Desfazer a ação se isReversible=true
  }

  async healthCheck(): Promise<{ status: "healthy" | "degraded" | "down" }> {
    return { status: "healthy" };
  }

  getMetadata() {
    return {
      connectorId:  this.connectorId,
      version:      this.version,
      capabilities: ["capability-1", "capability-2"],
      riskLevel:    "LOW" as const,
      isReversible: true,
    };
  }
}
```

---

## Checklist de Publicação

- [ ] Implementa `IConnector` completamente
- [ ] `rollback` implementado se `isReversible=true`
- [ ] `healthCheck` funcional
- [ ] Testes no MRI
- [ ] Score MQCCS ≥ 85%
- [ ] RFC aprovada

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*