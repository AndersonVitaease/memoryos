# CAPABILITY-MANIFEST-SPEC.md
# MemoryOS — Especificação Oficial do Capability Manifest
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## Schema Completo

```typescript
interface CapabilityManifest {
  // ── Identidade ───────────────────────────────────────────────────────
  id: string                              // ex: "read-document-v1" (lowercase, hífens)
  version: string                         // semver ex: "1.0.0"
  schemaVersion: number                   // versão do schema do manifest (atual: 1)
  owner: string                           // equipe ou módulo responsável

  // ── Descrição ────────────────────────────────────────────────────────
  name: string                            // nome legível, ex: "Read Document"
  description: string                     // descrição completa (max 500 chars)
  category: CapabilityCategory
  tags: string[]                          // classificação (max 20 tags)

  // ── Contratos de I/O ────────────────────────────────────────────────
  inputSchema: JSONSchema                 // JSON Schema do input esperado
  outputSchema: JSONSchema                // JSON Schema do output produzido
  errorSchema: JSONSchema                 // JSON Schema de erros estruturados

  // ── Permissões e Segurança ───────────────────────────────────────────
  permissions: CapabilityPermission[]     // permissões declaradas explicitamente
  requiredConnectors: string[]            // IDs de ConnectorManifests necessários
  requiredMemories: MemoryRequirement[]   // tipos de Memory necessárias
  requiredContext: ContextRequirement[]   // campos de Context necessários

  // ── Performance ──────────────────────────────────────────────────────
  timeoutMs: number                       // timeout máximo em ms
  latency: LatencySpec                    // SLA de latência
  cost: CapabilityCost                    // custo estimado de execução

  // ── Confiabilidade ───────────────────────────────────────────────────
  idempotent: boolean                     // execuções repetidas produzem mesmo resultado
  retryPolicy: RetryPolicy
  rollbackPolicy: RollbackPolicy
  sideEffects: SideEffect[]               // efeitos colaterais declarados
  failureModes: FailureMode[]             // modos de falha documentados

  // ── Observabilidade ──────────────────────────────────────────────────
  healthChecks: HealthCheckSpec[]
  telemetry: TelemetrySpec
  auditLevel: "none"|"basic"|"full"

  // ── Versionamento ────────────────────────────────────────────────────
  minRuntimeVersion: string               // versão mínima do Capability Runtime
  deprecated?: boolean
  deprecatedAt?: string
  deprecatedReason?: string
  supersededBy?: string                   // ID do manifest que substitui este
}
```

---

## CapabilityCategory

```typescript
type CapabilityCategory =
  | "memory"          // acessa ou modifica memória
  | "retrieval"       // recupera informação
  | "analysis"        // analisa conteúdo
  | "extraction"      // extrai dados estruturados
  | "generation"      // gera conteúdo via LLM
  | "integration"     // integra com sistema externo
  | "transformation"  // transforma dados
  | "notification"    // envia notificações
  | "utility"         // utilitário genérico
```

---

## CapabilityPermission

```typescript
interface CapabilityPermission {
  resource: string                        // ex: "memory:read", "document:write"
  action: "read"|"write"|"delete"|"execute"
  scope: "own"|"project"|"global"         // escopo de acesso
  required: boolean                       // false = opcional (degrada graciosamente)
  reason: string                          // por que esta permissão é necessária
}
```

---

## MemoryRequirement

```typescript
interface MemoryRequirement {
  memoryType?: MemoryType                 // tipo de Memory necessária
  minImportance?: MemoryImportance        // importância mínima
  minConfidence?: number                  // confiança mínima (0.0-1.0)
  required: boolean                       // false = executa sem, com qualidade reduzida
  purpose: string                         // para que esta Memory é usada
}
```

---

## ContextRequirement

```typescript
interface ContextRequirement {
  field: string                           // ex: "userId", "projectId", "sessionHistory"
  type: "string"|"number"|"boolean"|"object"|"array"
  required: boolean
  description: string
}
```

---

## LatencySpec

```typescript
interface LatencySpec {
  p50Ms: number                           // latência esperada p50
  p95Ms: number                           // latência esperada p95
  p99Ms: number                           // latência esperada p99
  pathType: "A"|"B"                       // path interativo ou background
}
// Validação: p50 < p95 < p99 <= timeoutMs
```

---

## CapabilityCost

```typescript
interface CapabilityCost {
  llmCalls: number                        // número de chamadas LLM
  connectorCalls: number                  // número de chamadas a Connectors
  memoryReads: number                     // número de leituras de Memory
  estimatedCredits: number                // créditos estimados por execução
  costClass: "free"|"low"|"medium"|"high"|"critical"
}
```

---

## RetryPolicy

```typescript
interface RetryPolicy {
  maxAttempts: number                     // 0 = sem retry
  strategy: "none"|"linear"|"exponential"|"fixed"
  delayMs: number
  maxDelayMs: number
  retryOn: string[]                       // error codes que trigam retry
  dontRetryOn: string[]                   // error codes que NÃO devem ser retentados
}
```

---

## RollbackPolicy

```typescript
interface RollbackPolicy {
  supported: boolean                      // se rollback é suportado
  strategy: "none"|"compensating"|"idempotent_replay"|"manual"
  timeoutMs?: number                      // tempo máximo para rollback
  requiresApproval?: boolean              // rollback requer aprovação humana
  description: string                     // como o rollback é implementado
}
```

---

## SideEffect

```typescript
interface SideEffect {
  type: "database_write"|"external_api"|"email"|"file_write"|"cache_update"|"event_publish"
  description: string
  reversible: boolean
  rollbackStrategy?: string
}
```

---

## FailureMode

```typescript
interface FailureMode {
  code: string                            // ex: "DOCUMENT_NOT_FOUND"
  description: string
  probability: "low"|"medium"|"high"
  impact: "low"|"medium"|"high"|"critical"
  recovery: "automatic"|"manual"|"none"
  recoveryDescription?: string
}
```

---

## HealthCheckSpec

```typescript
interface HealthCheckSpec {
  id: string
  description: string
  type: "dependency"|"resource"|"custom"
  timeoutMs: number                       // máximo 100ms (Constituição O-02)
  criticalForExecution: boolean
}
```

---

## TelemetrySpec

```typescript
interface TelemetrySpec {
  trackInputHash: boolean                 // hash do input para deduplicação
  trackOutputHash: boolean                // hash do output para validação
  logLevel: "none"|"error"|"warn"|"info"|"debug"
  emitEvents: string[]                    // eventos publicados (do EVENT-CATALOG)
  customMetrics: string[]                 // métricas customizadas expostas
}
```

---

## Exemplo Completo: ReadDocumentCapability

```json
{
  "id": "read-document-v1",
  "version": "1.0.0",
  "schemaVersion": 1,
  "owner": "memory-team",
  "name": "Read Document",
  "description": "Lê e extrai conteúdo de um Document armazenado no sistema.",
  "category": "retrieval",
  "tags": ["document", "reading", "extraction"],
  "inputSchema": {
    "type": "object",
    "required": ["documentId"],
    "properties": {
      "documentId": { "type": "string" },
      "extractSections": { "type": "array", "items": { "type": "string" } }
    }
  },
  "outputSchema": {
    "type": "object",
    "required": ["content", "metadata"],
    "properties": {
      "content": { "type": "string" },
      "metadata": { "type": "object" }
    }
  },
  "permissions": [
    { "resource": "document:read", "action": "read", "scope": "own", "required": true, "reason": "Precisa ler o conteúdo do documento" }
  ],
  "requiredConnectors": [],
  "requiredMemories": [],
  "requiredContext": [
    { "field": "userId", "type": "string", "required": true, "description": "Proprietário do documento" }
  ],
  "timeoutMs": 3000,
  "latency": { "p50Ms": 200, "p95Ms": 800, "p99Ms": 2000, "pathType": "A" },
  "cost": { "llmCalls": 0, "connectorCalls": 0, "memoryReads": 1, "estimatedCredits": 0, "costClass": "free" },
  "idempotent": true,
  "retryPolicy": { "maxAttempts": 2, "strategy": "linear", "delayMs": 500, "maxDelayMs": 1000, "retryOn": ["STORAGE_TIMEOUT"], "dontRetryOn": ["NOT_FOUND", "FORBIDDEN"] },
  "rollbackPolicy": { "supported": false, "strategy": "none", "description": "Read-only, sem rollback necessário" },
  "sideEffects": [],
  "failureModes": [
    { "code": "DOCUMENT_NOT_FOUND", "description": "Documento não existe", "probability": "low", "impact": "medium", "recovery": "none" },
    { "code": "STORAGE_TIMEOUT", "description": "Storage não respondeu", "probability": "low", "impact": "high", "recovery": "automatic", "recoveryDescription": "Retry automático 2x" }
  ],
  "healthChecks": [
    { "id": "storage-check", "description": "Storage acessível", "type": "dependency", "timeoutMs": 50, "criticalForExecution": true }
  ],
  "telemetry": { "trackInputHash": true, "trackOutputHash": false, "logLevel": "error", "emitEvents": ["capability.executed.v1", "capability.failed.v1"], "customMetrics": ["document_read_bytes"] },
  "auditLevel": "basic",
  "minRuntimeVersion": "1.0.0"
}
```

---

## Validação de Manifest

| Regra | Detalhe |
|---|---|
| `id` único | Verificado no Registry (EF-14) na registração |
| `version` semver | Formato X.Y.Z obrigatório |
| `p50 < p95 < p99 <= timeoutMs` | Validado pelo Registry |
| `required permissions declaradas` | Todas as permissões usadas devem estar listadas |
| `sideEffects declarados` | Capability com side effects não declarados é inválida |
| `healthChecks timeoutMs <= 100` | Constituição O-02 |
| `retryOn e dontRetryOn não se sobrepõem` | Validado pelo Registry |
| `rollbackPolicy.supported` | Se `idempotent: false` e tem side effects, rollback deve ser suportado ou justificado |

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- OFFICIAL-CONTRACTS.md — EF-14, EF-15
- MEMORYOS-CONSTITUTION.md — Artigo III
- DOMAIN-MODEL.md — Capability, CapabilityManifest

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*