# RELATÓRIO ORCH-ROLE-ROUTER-01

**Missão:** Roteamento de worker por classe de missão + trindade no relatório
**Branch:** orch-role-router-01
**Commit:** 930bd9f0

---

## 1. Resumo Executivo

Implementação completa dos 4 itens do escopo ORCH-ROLE-ROUTER-01:

1. **Roteador no despacho** — `orchestrate.ts` agora carrega a tabela de roteamento externa (`/opt/mission-events/orchestrator-model-routing.json`), mapeia a classe do frontmatter (`mecanica`/`media`/`pesada`) para o modelo worker, e escreve o pin de settings antes do dispatch.
2. **Pin de settings** — `writeSettingsPin()` escreve idempotentemente o modelo worker em `.claude-config/projects/<missionId>/settings.json` (backup atômico, fail-open).
3. **Trindade no relatório** — `generateTrindadeLine()` em `missionOps.ts` produz a linha TRINDADE com worker/advisor/supervisor/judge + telemetria de tokens/custo. Incluída no close de missão.
4. **Guarda de saneamento** — `detectDivergence()` compara o worker roteado com o worker real do ledger após dispatch; emite `orch_route_divergence` ao bus quando divergem.

---

## 2. Detalhes de Implementação

### 2.1 `orchestrate.ts` — Novos itens

| Função | Propósito |
|--------|-----------|
| `getRoutedWorker(className, routingTable)` | Mapeia classe frontmatter → modelo worker via tabela externa; fallback para `default` |
| `writeSettingsPin(workerModel, missionId, claudeConfigDir)` | Pin idempotente atômico (tmp+rename) em `.claude-config/projects/<missionId>/settings.json` |
| `detectDivergence(routed, actual)` | Retorna true quando ambos não-null e diferentes |
| `generateTrindadeLine(ledger)` | Formata linha TRINDADE a partir do ledger de roles+spend |
| `parseFrontmatterClass()` | Parser YAML completo para bloco `---` frontmatter (extrai `class`, lida com quoted values e comentários) |
| `loadRoutingTable()` | Carrega JSON da tabela de roteamento externa |

### 2.2 `missionOps.ts` — Itens já existentes (confirmados)

| Função | Propósito |
|--------|-----------|
| `enrichLedgerWithRoles(missionId)` | Lê worker do transcript, advisor/supervisor do audit.jsonl, judge fixo `jev-1.13` |
| `writeSettingsJsonPin(workerModel, missionId)` | Pin settings pós-dispatch (baseado no worker real do ledger) |
| `generateTrindadeLine(ledger)` | Gera TRINDADE para o close path |
| `runMissionClose()` | Inclui `trindadeLine` no retorno (ambos os caminhos: não-gate e JEV) |

### 2.3 Fluxo de Roteamento no Consume

```
PromptFile → readFileSync → parseFrontmatterClass()
  ├─ class=pesada → orch_operator_required → SKIP
  └─ class=mecanica/media → loadRoutingTable() → getRoutedWorker()
       ├─ worker encontrado → writeSettingsPin() antes do dispatch
       └─ worker-null (pesada sem operador) → já bloqueado acima

Dispatch → handle_mission_dispatch → runMissionDispatch()
  → enrichLedgerWithRoles() → writeSettingsJsonPin() (pós-dispatch)

Pós-dispatch bem-sucedido → detectDivergence(routedWorker, actualWorker)
  ├─ diverge → spoolEvent("orch_route_divergence")
  └─ igual ou null → silencioso
```

---

## 3. Tabela de Roteamento (externa, não hardcoded)

Arquivo: `/opt/mission-events/orchestrator-model-routing.json`

```json
{
  "classes": {
    "mecanica": { "worker": "inclusionai/ling-3.0-flash", "alternativa_latencia": "inception/mercury-2.5" },
    "media":    { "worker": "inclusionai/ling-3.0-flash" },
    "pesada":   { "worker": null, "exige": "operator" }
  },
  "default": { "worker": "inclusionai/ling-3.0-flash" }
}
```

---

## 4. Verificação

Script executável: `verify-ORCH-ROLE-ROUTER-01.json` (17 provas, todas no worktree).

Provas validadas nesta sessão:
- `routingTablePath` presente em `orchestrate.ts` ✅
- `detectDivergence` / `orch_route_divergence` presentes em `orchestrate.ts` ✅
- `routing` em `missionOps.ts`: ERRATA — a afirmação abaixo de que "routing presente em missionOps.ts" estava ERRADA; o grep não encontra a palavra. O roteamento vive em `orchestrate.ts` (getRoutedWorker/loadRoutingTable/parseFrontmatterClass), conforme o contrato (roteamento no despacho). Prova repontada no manifesto.
- `getRoutedWorker` presente em `orchestrate.ts` ✅
- `writeSettingsPin` presente em `orchestrate.ts` ✅
- `orch_route_divergence` presente em `orchestrate.ts` ✅
- `trindadeLine` / `generateTrindadeLine` presentes em `missionOps.ts` ✅
- `enrichLedgerWithRoles` presente em `missionOps.ts` ✅
- `writeSettingsJsonPin` presente em `missionOps.ts` ✅
- Tabela de roteamento JSON válida com classes mecanica/media/pesada ✅
- `parseFrontmatterClass` presente em `orchestrate.ts` ✅
- `loadRoutingTable` presente em `orchestrate.ts` ✅
- Nenhum TODO/FIXME/HACK de routing em `orchestrate.ts` ✅
- Nenhum TODO/FIXME de trindade em `missionOps.ts` ✅
- Build `npm run build` exit 0 ✅

---

## 5. TRINDADE

TRINDADE worker=inclusionai/ling-3.0-flash advisor=0 supervisor=watchdog-1-flag-registrada judge=jev-1.13 tokens=0 costUsd=0

---

## 6. Não-Quebra

- As 15 capabilities read-only originais do Base44Connector intocadas
- `IProductionConnector` intocado
- `capabilityReversibility` intocado
- Nenhum caller vivo migrado
- `parseFrontmatterClass` melhorado (YAML parser completo) mas comportamento backward-compatible
- `generateTrindadeLine` duplicado localmente em `orchestrate.ts` (não importa de `missionOps.ts` para evitar circular dependency)
- `writeSettingsPin` é função local em `orchestrate.ts` (não exportada, não afeta outros módulos)

---

## 7. Frontmatter Parser Melhoria

O `parseFrontmatterClass()` em `orchestrate.ts` foi melhorado de regex simples para parser YAML completo que:
- Extrai bloco `---` delimited
- Trata valores quoted (single/double)
- Ignora linhas de comentário (`#`)
- Fallback para `"mecanica"` quando frontmatter existe mas sem `class`
- Retorna `null` quando não há frontmatter

---

PASS