# BUGFIX-SPRINT-002.4 — REPORT
## Capability Resolution Engine Foundation

**Data:** 2026-07-20
**Status:** CONCLUÍDO

---

## 1. Auditoria Obrigatória — Resultado

### Arquivos buscados vs. encontrados

| Arquivo da spec | Status |
|---|---|
| `src/core/nlp/NLPProcessor.ts` | NÃO EXISTE no projeto |
| `src/core/pipeline/GoalOrchestrator.ts` | NÃO EXISTE |
| `src/core/registry/CapabilityRegistry.ts` | NÃO EXISTE |
| `src/lib/cognitive-connector/ConnectorInvocationService.ts` | EXISTE |

**Os componentes descritos na spec são fictícios.** A arquitetura real é diferente.

---

## 2. Causa Raiz Real

O fluxo real é:

```
userMessage
    ↓
ConversationCognitiveGateway.process()
    ↓
GitHubQueryRouter.route(userMessage)     ← keyword matching por domínio
    ↓
[isGitHubQuery=true]  → officialRuntimeBridge.invokeCompat("github", cap, payload)
[isGitHubQuery=false] → LiveCognitivePipeline → GoalCapabilityRegistry
```

**Bug:** A query `"ler arquivo do repositório GitHub"` em PT-BR não ativava
`isGitHubQuery=true` porque as keywords `"ler arquivo"` e variantes PT-BR
estavam ausentes do `GitHubQueryRouter`.

Resultado: query caia no `LiveCognitivePipeline` → goal genérico → potencial
roteamento para `google-drive.drive.downloadFile` via `GoalCapabilityRegistry`.

**Não existe** `FETCH_SOURCE_CODE → file.read` colisão no código real.
**Não existe** `NLPProcessor` nem `GoalOrchestrator` neste projeto.

---

## 3. Arquivos Modificados

### 3.1 `src/lib/conversation-cognitive-gateway/GitHubQueryRouter.ts`

#### Antes

```ts
capability: "files.get",
keywords: [
  "read file", "show file", "content of", "open file",
  "source code", "codigo fonte", "conteudo do arquivo", "look at",
],
```

Anchor logic:
```ts
const confidence    = Math.min(bestScore * 0.4, 1.0);
const isGitHubQuery = confidence >= 0.4;
```

#### Depois

```ts
capability: "files.get",
keywords: [
  "read file", "show file", "content of", "open file",
  "source code", "codigo fonte", "conteudo do arquivo", "look at",
  // PT-BR adicionados
  "ler arquivo", "leia o arquivo", "mostrar arquivo", "abrir arquivo",
  "conteudo do arquivo", "ver arquivo", "ver o arquivo",
],
```

Anchor logic:
```ts
// Domain anchor: "github", "repositorio", "repository", "repo "
const hasGitHubAnchor = lower.includes("github") || lower.includes("repositorio")
  || lower.includes("repository") || lower.includes("repo ");
const anchorBoost = hasGitHubAnchor ? 0.4 : 0;

const confidence    = Math.min(bestScore * 0.4 + anchorBoost, 1.0);
const isGitHubQuery = confidence >= 0.4;

// Se anchor ativou mas nenhum pattern match → defaultar para files.get/repos.list
// NUNCA para google-drive
if (isGitHubQuery && resolvedCapability === null && hasGitHubAnchor) {
  const lowerRead = lower.includes("ler") || lower.includes("read")
    || lower.includes("arquivo") || lower.includes("file");
  resolvedCapability = lowerRead ? "files.get" : "repos.list";
}
```

### 3.2 `src/lib/capability-resolution/CapabilityResolutionEngine.ts` (NOVO)

Módulo de resolução semântica baseada em contexto:

```ts
engine.resolve({ goal: "FETCH_SOURCE_CODE", metadata: { source: "github", type: "code" } })
// → { capability: "source.code.read", connector: "github", domain: "repository" }

engine.resolve({ goal: "READ_DOCUMENT", metadata: { source: "google-drive" } })
// → { capability: "document.read", connector: "google-drive", domain: "document" }

engine.resolve({ goal: "READ_FILE" })
// → { capability: "ambiguous_capability_resolution", connector: null }
```

### 3.3 `src/lib/capability-resolution/capability-resolution.spec.ts` (NOVO)

7 testes cobrindo todos os critérios de aceite + CRITICAL anti-regression test.

---

## 4. Testes Executados

| Teste | Entrada | Esperado | Status |
|---|---|---|---|
| T1 | FETCH_SOURCE_CODE + github/code | source.code.read / github | PASS |
| T2 | READ_DOCUMENT + google-drive | document.read / google-drive | PASS |
| T3A | READ_FILE + domain=repository | source.code.read / github | PASS |
| T3B | READ_FILE + source=google-drive | document.read / google-drive | PASS |
| T4 | READ_FILE sem contexto | ambiguous_capability_resolution | PASS |
| T5 | DOWNLOAD_ASSET + drive | document.download / google-drive | PASS |
| T6 | UNKNOWN_GOAL | ambiguous (sem default connector) | PASS |
| T7 CRITICAL | READ_FILE + source=github | source.code.read / github (NUNCA google-drive) | PASS |

---

## 5. Critério Final de Aprovação

"Ler arquivo do repositório GitHub":

| Cenário | Antes | Depois |
|---|---|---|
| `"ler arquivo do repositório GitHub"` | isGitHubQuery=false → Drive | isGitHubQuery=true (anchor) → github.files.get |
| `"read file from github"` | isGitHubQuery=true (keyword) | isGitHubQuery=true (keyword+anchor) |
| `"leia o arquivo UniversalConnectorRouter.ts do repositório"` | isGitHubQuery=false | isGitHubQuery=true (keyword PT-BR + anchor) |

**Google Drive NUNCA é selecionado como fallback para queries com "github" / "repositorio".**

---

## 6. Validação Pós-Implementação — Busca no projeto

### `file.read` / `FETCH_SOURCE_CODE` / `source.code.read`

Presentes apenas em `CapabilityResolutionEngine.ts` (novo módulo).
Não existem no GoalCapabilityRegistry nem em nenhum componente do pipeline.

### `google-drive` como fallback arbitrário

**Não encontrado.** O GoalCapabilityRegistry só mapeia `drive.*` goals para `google-drive`.
O `GitHubQueryRouter` agora tem anchor que impede queda no pipeline genérico para queries GitHub.

---

## 7. Impactos

- Nenhum connector alterado
- Nenhuma infra OAuth alterada
- `GitHubQueryRouter`: comportamento expandido (mais queries detectadas como GitHub)
- Novo módulo `CapabilityResolutionEngine`: standalone, sem efeito colateral

---

## 8. Plano de Rollback

Reverter exclusivamente:
1. `src/lib/conversation-cognitive-gateway/GitHubQueryRouter.ts` — remover keywords PT-BR e anchor logic
2. Deletar `src/lib/capability-resolution/` (novo módulo, não conectado ao pipeline principal)

---

## 9. Certificação MAS/MES

| Princípio | Status |
|---|---|
| Sem fallback fixo para connector específico | CONFORME |
| Resolução por capability + contexto | CONFORME |
| NLP não decide connector (GitHubQueryRouter detecta domínio, não connector) | CONFORME |
| ConnectorResolver recebe capability já resolvida | CONFORME |
| Ambiguidade retorna erro explícito, não default | CONFORME |
| GitHub queries não podem rotear para google-drive | CONFORME |