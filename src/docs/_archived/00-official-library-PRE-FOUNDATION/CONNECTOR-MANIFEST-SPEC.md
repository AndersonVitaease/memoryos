# CONNECTOR-MANIFEST-SPEC.md
# MemoryOS — Especificação Oficial do Connector Manifest
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## Visão Geral

Um Connector Manifest define o contrato completo de um Connector externo.
O Connector Runtime usa o manifest para autenticação, rate limiting, retry e auditoria.
Capabilities declaram `requiredConnectors` por ID de manifest.

---

## Schema Completo

```typescript
interface ConnectorManifest {
  // ── Identidade ───────────────────────────────────────────────────────
  id: string                              // ex: "github-api-v1"
  version: string                         // semver ex: "1.0.0"
  schemaVersion: number                   // versão do schema do manifest (atual: 1)
  owner: string                           // equipe responsável

  // ── Descrição ────────────────────────────────────────────────────────
  name: string                            // ex: "GitHub API"
  description: string                     // max 500 chars
  category: ConnectorCategory
  tags: string[]

  // ── Autenticação ─────────────────────────────────────────────────────
  auth: ConnectorAuth

  // ── Permissões e Escopos ─────────────────────────────────────────────
  scopes: ConnectorScope[]                // escopos OAuth ou permissões de API key
  permissions: ConnectorPermission[]

  // ── Rate Limiting ────────────────────────────────────────────────────
  rateLimits: RateLimitSpec[]

  // ── Confiabilidade ───────────────────────────────────────────────────
  timeoutMs: number
  retryPolicy: ConnectorRetryPolicy
  circuitBreaker: CircuitBreakerSpec

  // ── Ações Suportadas ────────────────────────────────────────────────
  supportedActions: ConnectorAction[]

  // ── Webhooks ────────────────────────────────────────────────────────
  webhooks?: ConnectorWebhook[]           // null se não suporta webhooks

  // ── Saúde ────────────────────────────────────────────────────────────
  healthCheck: ConnectorHealthCheck

  // ── Modos de Falha ───────────────────────────────────────────────────
  failureModes: ConnectorFailureMode[]

  // ── Observabilidade ──────────────────────────────────────────────────
  telemetry: ConnectorTelemetry
  auditLevel: "none"|"basic"|"full"

  // ── Versionamento ────────────────────────────────────────────────────
  deprecated?: boolean
  deprecatedAt?: string
  supersededBy?: string
}
```

---

## ConnectorCategory

```typescript
type ConnectorCategory =
  | "productivity"      // Google Workspace, Microsoft 365
  | "communication"     // Slack, Teams, email
  | "repository"        // GitHub, GitLab
  | "storage"           // Drive, OneDrive, Dropbox
  | "crm"               // Salesforce, HubSpot
  | "project"           // Linear, Jira, Asana
  | "calendar"          // Google Calendar, Outlook
  | "data"              // BigQuery, Snowflake, databases
  | "ai"                // Hugging Face, OpenAI
  | "payment"           // Stripe
  | "utility"           // genérico
```

---

## ConnectorAuth

```typescript
interface ConnectorAuth {
  type: "oauth2"|"apikey"|"basic"|"bearer"|"none"

  // OAuth2 (se type == "oauth2")
  oauth2?: {
    authorizationUrl: string
    tokenUrl: string
    refreshUrl: string
    scopes: string[]                      // escopos mínimos necessários
    pkce: boolean                         // PKCE required?
    tokenStorage: "memory"|"encrypted_storage"
    refreshStrategy: "proactive"|"reactive"
    expiryBufferSeconds: number           // renovar N segundos antes do expirar
  }

  // API Key (se type == "apikey")
  apikey?: {
    headerName: string                    // ex: "X-API-Key"
    prefix?: string                       // ex: "Bearer "
    rotationPolicy: "manual"|"scheduled"
    secretName: string                    // nome do secret no vault
  }

  // Basic Auth
  basic?: {
    usernameField: string
    passwordField: string
  }
}
```

---

## ConnectorScope

```typescript
interface ConnectorScope {
  id: string                              // ex: "repo:read"
  name: string                            // ex: "Read repositories"
  description: string
  required: boolean                       // se false, funcionalidade reduzida
  sensitiveData: boolean                  // acessa dados sensíveis?
  capabilities: string[]                  // capabilities que precisam deste scope
}
```

---

## ConnectorPermission

```typescript
interface ConnectorPermission {
  action: string                          // ex: "read_files", "create_issue"
  scope: string                           // scope OAuth necessário
  description: string
  sensitive: boolean
}
```

---

## RateLimitSpec

```typescript
interface RateLimitSpec {
  id: string
  description: string
  limit: number                           // número de requests
  windowSeconds: number                   // janela de tempo
  scope: "global"|"per_user"|"per_action"
  strategy: "fixed_window"|"sliding_window"|"token_bucket"
  onExceeded: "queue"|"reject"|"retry_after"
  retryAfterSeconds?: number              // se onExceeded == "retry_after"
}
```

---

## ConnectorRetryPolicy

```typescript
interface ConnectorRetryPolicy {
  maxAttempts: number
  strategy: "exponential"|"linear"|"fixed"
  delayMs: number
  maxDelayMs: number
  jitter: boolean                         // adiciona jitter para evitar thundering herd
  retryOnStatusCodes: number[]            // ex: [429, 500, 502, 503, 504]
  dontRetryOnStatusCodes: number[]        // ex: [400, 401, 403, 404]
}
```

---

## CircuitBreakerSpec

```typescript
interface CircuitBreakerSpec {
  enabled: boolean
  failureThreshold: number                // % de falhas para abrir o circuito
  successThreshold: number                // consecutivos para fechar (half-open → closed)
  timeoutSeconds: number                  // tempo em OPEN antes de tentar half-open
  monitoringWindowSeconds: number         // janela para calcular failure rate
}
```

---

## ConnectorAction

```typescript
interface ConnectorAction {
  id: string                              // ex: "list_repos"
  name: string
  description: string
  method: "GET"|"POST"|"PUT"|"PATCH"|"DELETE"|"GRAPHQL"|"GRPC"
  endpoint: string                        // URL template (ex: "/repos/{owner}/{repo}")
  requiredScopes: string[]
  inputSchema: JSONSchema
  outputSchema: JSONSchema
  idempotent: boolean
  sideEffects: string[]
  rateLimitId?: string                    // qual rate limit se aplica
  timeoutMs?: number                      // override do timeout padrão do connector
  paginated: boolean
  paginationStrategy?: "cursor"|"offset"|"page_token"
}
```

---

## ConnectorWebhook

```typescript
interface ConnectorWebhook {
  id: string
  eventType: string                       // ex: "push", "pull_request"
  description: string
  payloadSchema: JSONSchema
  signatureVerification: {
    enabled: boolean
    algorithm?: "hmac-sha256"|"hmac-sha1"
    headerName?: string                   // ex: "X-Hub-Signature-256"
    secretName?: string                   // nome do secret no vault
  }
  idempotencyKey?: string                 // campo no payload para deduplicação
  deliveryGuarantee: "at_least_once"|"at_most_once"|"exactly_once"
}
```

---

## ConnectorHealthCheck

```typescript
interface ConnectorHealthCheck {
  endpoint: string                        // endpoint de health check
  method: "GET"|"HEAD"
  expectedStatusCode: number             // ex: 200
  timeoutMs: number                       // máximo 100ms (Constituição O-02)
  intervalSeconds: number                 // frequência do check
  failureThreshold: number                // failures consecutivos = FAILED
  successThreshold: number               // successes = HEALTHY após falha
}
```

---

## ConnectorFailureMode

```typescript
interface ConnectorFailureMode {
  code: string                            // ex: "AUTH_EXPIRED", "RATE_LIMITED"
  statusCode?: number                     // HTTP status associado
  description: string
  probability: "low"|"medium"|"high"
  impact: "low"|"medium"|"high"|"critical"
  recovery: "automatic"|"manual"|"user_action"
  recoveryDescription: string
  resultStatus: "FAILED"|"TIMEOUT"|"DENIED"|"CANCELLED"
}
```

---

## ConnectorTelemetry

```typescript
interface ConnectorTelemetry {
  trackRequestPayload: boolean            // CUIDADO: pode incluir PII
  trackResponsePayload: boolean           // CUIDADO: pode incluir PII
  logLevel: "none"|"error"|"warn"|"info"
  emitEvents: string[]                    // eventos do EVENT-CATALOG
  customMetrics: string[]
  sensitiveFields: string[]               // campos a mascarar nos logs
}
```

---

## Exemplo Completo: GitHubAPIConnector

```json
{
  "id": "github-api-v1",
  "version": "1.0.0",
  "schemaVersion": 1,
  "owner": "connector-team",
  "name": "GitHub API",
  "description": "Conecta ao GitHub API para leitura de repositórios, issues e PRs.",
  "category": "repository",
  "tags": ["github", "code", "issues", "prs"],
  "auth": {
    "type": "oauth2",
    "oauth2": {
      "authorizationUrl": "https://github.com/login/oauth/authorize",
      "tokenUrl": "https://github.com/login/oauth/access_token",
      "refreshUrl": "https://github.com/login/oauth/access_token",
      "scopes": ["repo", "read:user"],
      "pkce": false,
      "tokenStorage": "encrypted_storage",
      "refreshStrategy": "proactive",
      "expiryBufferSeconds": 300
    }
  },
  "scopes": [
    { "id": "repo", "name": "Repository Access", "description": "Leitura de repositórios", "required": true, "sensitiveData": false, "capabilities": ["list-repos-v1", "read-file-v1"] },
    { "id": "read:user", "name": "User Profile", "description": "Perfil do usuário", "required": false, "sensitiveData": true, "capabilities": ["get-user-v1"] }
  ],
  "rateLimits": [
    { "id": "default", "description": "GitHub REST API rate limit", "limit": 5000, "windowSeconds": 3600, "scope": "per_user", "strategy": "sliding_window", "onExceeded": "retry_after", "retryAfterSeconds": 60 }
  ],
  "timeoutMs": 10000,
  "retryPolicy": {
    "maxAttempts": 3, "strategy": "exponential", "delayMs": 500, "maxDelayMs": 10000,
    "jitter": true, "retryOnStatusCodes": [429, 500, 502, 503], "dontRetryOnStatusCodes": [400, 401, 403, 404, 422]
  },
  "circuitBreaker": {
    "enabled": true, "failureThreshold": 50, "successThreshold": 3,
    "timeoutSeconds": 30, "monitoringWindowSeconds": 60
  },
  "supportedActions": [
    {
      "id": "list_repos", "name": "List Repositories", "description": "Lista repositórios do usuário autenticado",
      "method": "GET", "endpoint": "/user/repos",
      "requiredScopes": ["repo"], "idempotent": true, "sideEffects": [],
      "rateLimitId": "default", "paginated": true, "paginationStrategy": "page_token",
      "inputSchema": { "type": "object", "properties": { "visibility": { "type": "string" }, "per_page": { "type": "number" } } },
      "outputSchema": { "type": "object", "properties": { "repos": { "type": "array" }, "next_cursor": { "type": "string" } } }
    }
  ],
  "webhooks": [
    {
      "id": "push_event", "eventType": "push", "description": "Commit pushed to repository",
      "payloadSchema": { "type": "object" },
      "signatureVerification": { "enabled": true, "algorithm": "hmac-sha256", "headerName": "X-Hub-Signature-256", "secretName": "GITHUB_WEBHOOK_SECRET" },
      "idempotencyKey": "after",
      "deliveryGuarantee": "at_least_once"
    }
  ],
  "healthCheck": {
    "endpoint": "https://api.github.com/", "method": "GET",
    "expectedStatusCode": 200, "timeoutMs": 80, "intervalSeconds": 60,
    "failureThreshold": 3, "successThreshold": 2
  },
  "failureModes": [
    { "code": "AUTH_EXPIRED", "statusCode": 401, "description": "Token OAuth expirado", "probability": "medium", "impact": "high", "recovery": "automatic", "recoveryDescription": "Runtime tenta refresh do token", "resultStatus": "FAILED" },
    { "code": "RATE_LIMITED", "statusCode": 429, "description": "Rate limit excedido", "probability": "low", "impact": "medium", "recovery": "automatic", "recoveryDescription": "Retry após header Retry-After", "resultStatus": "FAILED" }
  ],
  "telemetry": {
    "trackRequestPayload": false, "trackResponsePayload": false, "logLevel": "error",
    "emitEvents": [], "customMetrics": ["github_api_calls_total"], "sensitiveFields": ["token", "password"]
  },
  "auditLevel": "basic"
}
```

---

## Regras de Validação de Manifest

| Regra | Detalhe |
|---|---|
| `id` único | Verificado pelo Connector Runtime na registração |
| `version` semver | Formato X.Y.Z obrigatório |
| `healthCheck.timeoutMs <= 100` | Constituição O-02 |
| `retryOnStatusCodes ∩ dontRetryOnStatusCodes = ∅` | Sem sobreposição |
| `webhook.signatureVerification.enabled = true` | Obrigatório para webhooks de produção |
| `telemetry.sensitiveFields` | Campos com PII devem estar listados |
| `failureModes.resultStatus` | Apenas `FAILED`, `TIMEOUT`, `DENIED`, `CANCELLED` |
| `auth.oauth2.tokenStorage` | "encrypted_storage" para produção; "memory" apenas para testes |

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- MEMORYOS-CONSTITUTION.md — Artigo IV
- DOMAIN-MODEL.md — ConnectorManifest
- CAPABILITY-MANIFEST-SPEC.md

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*