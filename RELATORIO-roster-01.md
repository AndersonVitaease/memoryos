# RELATORIO-roster-01 — engineering.session.roster

**Missão:** ROSTER-01 — inventário auditável e LGPD-safe de sessões/turnos/missões do ecossistema, 1 chamada, zero-LLM.
**Worktree:** `/opt/memoryos/eng-mcp-wt-roster-01` (branch `roster-01`, base `main` @ 571425ad).
**Data:** 2026-09-30.

## Contexto da sessão

Sessão anterior terminou no shell (pane fallback) com trabalho não comprovado: `src/sessionRoster.ts` + `test/sessionRoster.test.ts` escritos, mas SEM registro da tool no servidor, com bug `require()` em módulo ESM, parser do herdr quebrado (`--json` não existe), teste destrutivo (escrevia mocks direto no ledger de produção) e sem verify.json/relatório. Esta sessão fechou o circuito.

## O que foi entregue (arquivos)

| Arquivo | Mudança |
|---|---|
| `eng-mcp/src/sessionRoster.ts` | (1) `require('child_process')` → `import { execSync } from 'child_process'` (ESM puro; o require dentro de try/catch falhava silenciosamente e deixava `panes` sempre vazio); (2) parser do herdr corrigido para o formato real (`herdr tab list` SEM flag `--json`; JSON em `result.tabs`; campos `tab_id`/`label`/`agent_status`); (3) `MISSION_STATE_DIR_OVERRIDE` agora lido **por chamada** (função `missionStateDir()`), permitindo teste isolado em tmpdir sem tocar produção. |
| `eng-mcp/src/tools.ts` | Tool **registrada** no catálogo: `engineering.session.roster` (tier `read`, `requireRead()`, inputSchema vazio strict, zero-LLM). Import `getRoster`. Catálogo 138 → **139** (`eng-mcp-tools-v139`, computado dinamicamente). |
| `eng-mcp/test/sessionRoster.test.ts` | Reescrito para **tmpdir + `MISSION_STATE_DIR_OVERRIDE`** (o teste original escrevia/apagava mocks direto em `/root/.hermes/mission-state` — produção real; violava LGPD/produção). +1 teste de guard: mocks nunca podem vazar para o ledger real. |
| `eng-mcp/test/tool-alias-compat.test.ts` | Contagem de catálogo 138 → 139 (3 asserts). |
| `eng-mcp/test/base44ToolsScope.test.ts` | idem (1 assert). |
| `eng-mcp/test/shiplock.test.ts` | idem (1 assert — "the gate adds no tool to the catalog"). |
| `eng-mcp/test/tools.integration.test.ts` | `engineering.session.roster` adicionada à lista exata de tools do endpoint autenticado + length 139 + `actualToolCount`/`catalogVersion` `eng-mcp-tools-v139`. |

Removido: `test/sessionRoster.test.ts.bak-destrutivo` (backup do teste destrutivo da sessão anterior).

## Verificação

- **Testes da tool:** `node --import tsx --test test/sessionRoster.test.ts` → **7/7 PASS** (inclui LGPD: roster JSON não contém transcript/message/content/text; isolamento: override ativo e produção intocada).
- **Latência:** subteste `performance` — p95 (20 runs, `performance.now`) ≈ 48ms < 100ms PASS.
- **Suíte completa:** `npm test` → **1611 testes, 1605 pass, 1 fail = `zz-proxy-live` (403 no proxy vivo — falha ambiental pré-existente, a mesma da baseline)**, 5 skipped.
- **tsc:** erros pré-existentes em outros módulos, **0 novos** em `sessionRoster.ts` e `tools.ts`.
- **Estado real da tool:** `getRoster()` contra o ecossistema vivo → 128 missões, 4 panes herdr vivos, 1 sessão claude.
- **LGPD:** grep `transcript|.jsonl|conversation` em `sessionRoster.ts` → 0 ocorrências; sessões claude lidas apenas por `readdirSync`/`statSync` (NOMES e mtimes, zero conteúdo de conversa).

## verify.json

Manifesto tipado em `/opt/memoryos/eng-mcp-wt-roster-01/verify.json` (owner `roster-01`), provas cmd×4 + file×2, executadas pelo `/opt/deliver-verify/verify.py` → **verdict: pass** (8/8 checks, 0 LLM calls, ~60s).

## Não-quebra

- Aditivo: 1 case novo no final do bloco de registro (`tools.ts`); nenhuma tool existente alterada.
- Catálogo: contagens atualizadas nos 4 testes que fixavam 138 (precedente do bump 137→138).
- Nenhum push/deploy (conforme missão); branch `roster-01` local, pronta para etapa governada (conflito com orchestrator-f1/watch-fp resolvido lá).
- Ledger de produção verificado limpo (nenhum mock `mission-0{1,2,3}.json` remanescente).

## Riscos/observações

- `staleness_flags` na prova real deu 0 (nenhuma missão dispatched/working >15min no momento) — o comportamento >15min está coberto pelo teste isolado.
- `herdr tab list` executa CLI a cada chamada (~50ms) — incluso no orçamento p95 <100ms (passou com folga no host atual).

**Veredito: PASS**