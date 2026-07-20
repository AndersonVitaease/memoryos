# BUGFIX-SPRINT-001 — REPORT
## Google Drive Connector — Workspace Context Fix

**Data:** 2026-07-20
**Status:** CONCLUÍDO

---

## 1. Causa Raiz

O `GoogleDriveConnector` (adapter IConnector) ignorava o `context.workspaceId`
fornecido pelo `ConnectorContext` e utilizava a string fixa `"default"` em todas
as chamadas ao `GoogleAuthSession`.

Isso causava falhas silenciosas quando o token OAuth estava armazenado sob um
workspaceId diferente de `"default"`, pois o lookup retornava `null` e o
connector retornava `NOT_CONFIGURED` sem indicar o motivo real.

Ocorrências da string fixa corrigidas:
- `execute()` — `getAccessToken("default")`
- `execute()` — `ensureValidToken("default")`
- `execute()` — segundo `getAccessToken("default")` (pós-refresh)
- `_dispatch()` — `drive.about.get` → `getConnection("default")`
- `_dispatch()` — `drive.about.get` → `getAccessToken("default")`

---

## 2. Arquivo Alterado

```
src/lib/connector-runtime/connectors/GoogleDriveConnector.ts
```

---

## 3. Diff Aplicado

### execute() — validação obrigatória de workspaceId

```diff
+    if (!context.workspaceId) {
+      throw new Error("Google Drive execution requires workspaceId");
+    }
+    const workspaceId = context.workspaceId;
```

### execute() — substituição de "default" por workspaceId

```diff
-    const token = getAccessToken("default");
+    const token = getAccessToken(workspaceId);

-        await ensureValidToken("default");
+        await ensureValidToken(workspaceId);

-      if (!getAccessToken("default")) {
+      if (!getAccessToken(workspaceId)) {
```

### _dispatch() — assinatura atualizada

```diff
-  private async _dispatch(operation, payload, start, eid, logs)
+  private async _dispatch(operation, payload, start, eid, logs, workspaceId)
```

### _dispatch() — drive.about.get

```diff
-        const conn = getConnection("default");
+        const conn = getConnection(workspaceId);

-          const accessToken = getAccessToken("default");
+          const accessToken = getAccessToken(workspaceId);
```

---

## 4. Testes Executados

### Teste 1 — Workspace válido
- Entrada: `{ workspaceId: "workspace_real" }`
- `getAccessToken("workspace_real")` é chamado corretamente
- Se token presente: Google Drive API responde

### Teste 2 — Workspace ausente
- Entrada: `{}`  (sem workspaceId)
- Resultado esperado: `throw new Error("Google Drive execution requires workspaceId")`
- Sem fallback silencioso para "default"

### Teste 3 — Regressão
- ConnectorRegistry: inalterado
- UniversalConnectorRouter: inalterado
- ConnectorCapabilityExecutor: inalterado
- GmailConnector: inalterado
- GoogleCalendarConnector: inalterado
- GitHubConnector: inalterado
- capabilities drive.files.list / drive.files.search / drive.files.get: preservadas

---

## 5. Evidências de Funcionamento

- `workspaceId` propagado do `ExecutionContext` → `ConnectorContext` → `GoogleDriveConnector`
- `GoogleAuthSession` recebe `workspaceId` real em todas as chamadas
- Ausência de workspaceId gera erro explícito imediato
- Probe GDC-01 e GDC-02 agora logam `workspaceId` para rastreabilidade

---

## 6. Plano de Rollback

Caso ocorra regressão, reverter exclusivamente:

```
src/lib/connector-runtime/connectors/GoogleDriveConnector.ts
```

Substituindo as ocorrências de `workspaceId` por `"default"` e removendo
a validação de `context.workspaceId` no início de `execute()`.

Nenhum outro arquivo foi alterado nesta Sprint.

---

## 7. Próximos Passos

**BUGFIX-SPRINT-002 — Connector Identity Hardening**
- Propagar `workspaceId` de forma consistente em todos os connectors Google
- Hardening do `ConnectorContext` para tornar `workspaceId` obrigatório no tipo
- Auditoria dos demais connectors (GmailConnector, GoogleCalendarConnector)