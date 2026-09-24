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

**Calibração (HOOKS-CALIBRATION-01, 2026-09-24):** allowlist determinística band-1 versionada (`ALLOWLIST_VERSION = 'band1-allowlist-v1'`) — comando inerte → allow com `BAND1_ALLOWLIST_MATCH: rule=<regra>` auditável, zero juiz; contratos de teste por regra em `test/judgeCalibration.test.ts` (positivo + negativo por regra, invariantes tier-3 end-to-end). Stop hook NÃO bloqueia fecho-pergunta do operador (`awaitsOperatorInput` — '?', 'quer', 'posso', 'decida', 'aguardo', 'approva'… pt/en, sem LLM). Faixa 2: comandos read-only determinísticos não caem no cinza-bloqueante — floor versionado `JUDGE_BAND2_READ_ONLY_FLOOR = 0.6` (isReadOnlyIndicative); só o cinza-ambíguo escala. Tier-3 intocado: a denylist roda no comando ORIGINAL antes de qualquer strip de redirect (`git push > /tmp/x` continua operador), e `*.token.json` entrou no denylist de credencial.


**Hooks do Jev numa máquina nova (HOOKS-VPS-01):** `node scripts/hooks-install.mjs` registra `.claude/hooks/judge-hook.mjs` no `~/.claude/settings.json` do cliente (idempotente, NO_OP se presente; `--remove` desinstala; URL do MCP lida do `memoryos-engmcp` em `~/.claude.json`; requer Node ≥ 22.18). Fail-open visível em `~/.claude/judge-hooks.jsonl`.

**Stop hook exige evidência (JUDGE_HOOK_STOP_EVIDENCE):** o bloqueio de "done prematuro" só é confiável com um arquivo de evidência da sessão (resultados de teste/deploy/artefatos) em `JUDGE_HOOK_STOP_EVIDENCE=<arquivo>`. Sem ele, o gate usa a própria mensagem final como evidência (circular) e o juiz tende a ALL_SUPPORTED → `{}` (provado em HOOKS-VPS-01 t6). Com evidência contrária → `decision: block` (HAS_CONTRADICTIONS).

**Pré-autorização por manifesto (AUTO-RUN-01A):** `engineering.mission.preauth` — o operador aprova UMA vez o plano da missão ({mission, windowMinutes ≤1440, operations:[{id, pattern (âncora; `*` = 1 token), fileScope (globs absolutos)}]}); PLAN é default (zero mutação), execute+approval grava `/data/manifests/{mission}.json` 0600 com hash16/TTL. Consequência NUNCA entra (rm/dd/push/deploy/pipeline/credential/registry/Caddyfile/.env + band-3 do gate + metacaracteres → manifesto inteiro REFUSED); no hook, band 3 é avaliada ANTES do manifesto e o match é no comando REAL (drift/escopo = fora). Expirado/revogado/corrompido = sem manifesto (fail-closed). `JUDGE_HOOK_MISSION=<missão>` restringe o hook ao manifesto de UMA missão (default: todos os ativos). Revogar: `action: revoke` + execute+approval.

# Verificação em 3 camadas + ledger de estado verificado (VERIFY-01, 2026-09-24)

Só convenção — nenhuma tool nova, nada server-side (catálogo continua 108).

**Camada 0 — aceitação por autoverificação (toda missão):** o relatório de fechamento lista as claims etiquetadas (`id` + texto + etiqueta `[consequência]` quando a claim afirma deploy/push/merge/restart/credencial/registry/efeito em produção) e passa por `engineering.judge.verify` (claims × artefatos reais: saídas de comando, hashes, contagens). Gray-zones declaradas explicitamente (o que NÃO foi verificado e por quê). Claim contradita ou uncertain → corrigir e re-verificar antes de entregar.

**Camada 1 — spot-check dirigido (1–2 chamadas):** o supervisor confere 1–2 claims contra o estado real com tools read-only existentes (ex.: `git.log`/`git.inspect_commit`, `mcp.catalog`, `test.status`, `deploy.status`). **OBRIGATÓRIO em toda claim `[consequência]`**; nas demais, por amostragem.

**Camada 2 — deep-verify:** re-verificação completa (reproduzir testes/typecheck/inspeção de artefatos) SOMENTE quando: spot-check da camada 1 falha, `judge.verify` retorna contradição (HAS_CONTRADICTIONS/MIXED), ou a missão é de alta consequência.

**Ledger no fechamento:** todo fechamento grava no `engineering.memory.capture` EXISTENTE (projectId `memoryos` — nunca outro; partição errada = capture invisível), dentro do `summary`, a linha `FINGERPRINT <json-compacto>` com `{missionId, head (SHA de 40 hex verificado), registrySha16, verdicts, ts}`:
- `head` = HEAD que a missão verificou (`git.log` limit 1 / `git.inspect_commit`).
- `registrySha16` = 16 primeiros hex do sha256 dos BYTES do token registry — mesma função do `registrySha16Before` que o PLAN de `engineering.registry.scope.grant`/`registry.entry.*` já devolve (PLAN = zero mutação); nunca registro nem credencial.
- `verdicts` = resultado do `judge.verify` da camada 0 (`aggregate` + `counts`) e resultado das camadas 1/2 quando rodaram.
- `ts` = ISO-8601 do fechamento.

**O "1 probe" de re-verificação** = `engineering.memory.search` (query = missionId) ou `engineering.memory.context` para achar a linha FINGERPRINT; comparar `head`/`registrySha16` com o estado atual (camada 1). Igual → não re-verificar; divergente → re-verificar só o que moveu. `ts` nunca entra na comparação.
