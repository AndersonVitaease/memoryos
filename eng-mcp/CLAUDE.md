<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **memoryos** (2374 symbols, 6229 relationships, 165 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/memoryos/context` | Codebase overview, check index freshness |
| `gitnexus://repo/memoryos/clusters` | All functional areas |
| `gitnexus://repo/memoryos/processes` | All execution flows |
| `gitnexus://repo/memoryos/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

# Regra operacional — pipeline de deploy (Convergência Git, 2026-09-14)

**Nenhuma edição fora do pipeline oficial commit → test → build → deploy.**

- Toda mudança em `src/`, `test/`, `scripts/` entra por file.create/file.patch → git.commit → engineering.release.test → build → candidate → deploy pelo release runner.
- NUNCA editar produção direto no disco nem sincronizar staging↔remoto manualmente — essa foi a causa raiz do desalinhamento de 2026-09-12/14.
- Git é a fonte da verdade: `main` compila o que produção roda; produção rastreável a um SHA de commit.
- Nunca commitar: `release-state.json`, `*.token.json` (segredos — ver .gitignore).

# Convenção judge — arbitragem e autoverificação (JUDGE-HOOKS-01, 2026-09-20)

**Decision points** (decisões fechadas: retry vs change approach, erro fatal?, done?, qual tool usar): consultar `engineering.judge.evaluate` ANTES de gastar turno frontier. `>0.9` → segue o veredito; `0.6–0.9` → segue e marca no relatório; `<0.6` → delibera normalmente ou escalata ao operador.

**Autoverificação**: antes de entregar qualquer relatório de missão, rodar `engineering.judge.verify` (claims do rascunho × artefatos reais). Claim não sustentada → corrigir e re-verificar antes de entregar.

**Fail-open**: juiz indisponível NUNCA trava missão.

**REGRA INVIOLÁVEL**: o juiz NÃO aprova — tria, explica e acelera; humano permanece no gatilho de consequência. Implementação: `src/harness/judgeGate.ts` (gate) + `src/harness/judgeGateCli.ts` (hooks CLI) + `.claude/hooks/judge-hook.mjs` (hook portátil versionado). Faixa 1 trivial (allowlist determinística em código, sem juiz) → auto; faixa 2 cinzenta → `judge.evaluate` com 4 perguntas de risco ({destructive?, outward-facing?, touches-credentials?, large-blast-radius?}): >0.9 auto com audit, 0.6–0.9 operador com score/reasons anexados, <0.6 operador; faixa 3 consequência (denylist, credenciais, push/deploy/merge/restart) → SEMPRE operador, mesmo com score 0.99 — contexto do juiz é explicativo, nunca decisório (NOT A SECURITY BOUNDARY). Fail-open com timeout 2s em todos os hooks (JUDGE_HOOKS_ENABLED=0 = escape hatch). Audit das chamadas: `/data/audit/judge.jsonl`.


**Hooks do Jev numa máquina nova (HOOKS-VPS-01):** `node scripts/hooks-install.mjs` registra `.claude/hooks/judge-hook.mjs` no `~/.claude/settings.json` do cliente (idempotente, NO_OP se presente; `--remove` desinstala; URL do MCP lida do `memoryos-engmcp` em `~/.claude.json`; requer Node ≥ 22.18). Fail-open visível em `~/.claude/judge-hooks.jsonl`.

**Stop hook exige evidência (JUDGE_HOOK_STOP_EVIDENCE):** o bloqueio de "done prematuro" só é confiável com um arquivo de evidência da sessão (resultados de teste/deploy/artefatos) em `JUDGE_HOOK_STOP_EVIDENCE=<arquivo>`. Sem ele, o gate usa a própria mensagem final como evidência (circular) e o juiz tende a ALL_SUPPORTED → `{}` (provado em HOOKS-VPS-01 t6). Com evidência contrária → `decision: block` (HAS_CONTRADICTIONS).
