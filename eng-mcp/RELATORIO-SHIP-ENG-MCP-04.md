# RELATÓRIO SHIP-ENG-MCP-04 — DEPLOY EM PRODUÇÃO CONCLUÍDO

**Data:** 2026-10-04 ~03:45 UTC · **Status:** **PASS** — produção em `9ad21732ae2ea51d78d9f7c6963d6ddf3133f7bb`, catálogo `eng-mcp-tools-v150` (150 tools), container `memoryos-eng-mcp` rodando `sha256:8dea4cf4…` (label `revision=9ad21732…`)

## Problema

Produção eng-mcp estava em v147 (`b80a7e64`, 03/10 16:27Z) enquanto o main acumulava a entrega de várias missões: `engineering.shell.run` (worker shell própria, 3 tiers), breaker de pressão zero-LLM (ORCH-BREAKER-01), ciclo de higiene (ORCH-HYGIENE-01), push/fetch via GitHub App (GIT-PUSH-APP-AUTH-01), leitor de artefato preauth (ORCH-PREAUTH-ARTIFACT-01) e mudanças do orquestrador. O contrato exigia gate de pré-condições, merges governados, push governado, pipeline pinado e smoke pós-deploy (catálogo ≥149 + shell.run tier-1/tier-2/tier-3).

## Entrega

**Deploy em produção do main `9ad21732…` via pipeline governado completo.** Commits shipados (b80a7e64 → 9ad21732): `f5b3b10f` (push via App), `9e676f7e` (hygiene.cycle), `b0398614`+`aab478cf` (preauth artifact reader), `114e7688` (fixes de pipeline), `01e6a974` (fix evidências), `9ad21732` (fix shellRun cwd). Catálogo 147 → **150 tools**.

**Quatro blockers de pipeline corrigidos durante a ship** (todos commitados e provados antes do deploy):

1. **whitespaceCheck reprova binário trackeado** (classe do precedente OCR-01): `.glgpd/bin/gitleaks` (ELF) lido como UTF-8 fabricava "linha com trailing space" e bloqueava todo pipeline. Fix: heurística do git (NUL nos primeiros 8000 bytes ⇒ binário, skip) em `scripts/eng-mcp-release.mjs` + 4 testes (`test/releaseWhitespaceBinary.test.ts`) — commit `114e7688`.
2. **`BASELINE_LIMIT_EXCEEDED` no git.stage/commit governado**: `baseline()` contava `.claude-config` (runtime da ferramenta, 136MB, 0 arquivos trackeados). Fix: exclusão no walk em `src/repository.ts` — commit `114e7688`.
3. **Trailing whitespace em 4 evidências** (`evidence-sec-surface-01/*.txt`, commit `4dd10b4a` fora do último deploy): corrigido via Read/Write (só padding final removido; espaçamento interno preservado) — commit `01e6a974`. Varredura de prova: zero arquivos trackeados de texto com trailing whitespace restante.
4. **`SHELL_RUN_DEFAULT_CWD` hardcoded `/opt/memoryos/eng-mcp`** — path inexistente no container de build/test (árvore extraída em `/app`) e na imagem de produção: o `statSync` do `resolveCwd` recusaria TODA chamada do `engineering.shell.run` em produção (`SHELL_RUN_CWD_NOT_FOUND`). A suíte shellRun inteira (11 grupos) falhava no estágio de teste — que **nunca tinha rodado** nas tentativas anteriores (todas paravam antes, no whitespaceCheck). Fix: default cwd derivado (env `ENG_MCP_SHELL_RUN_DEFAULT_CWD` > `/opt/memoryos/eng-mcp` se existir > repo root do módulo), repo root derivado entra em `SHELL_RUN_ROOTS`; teste novo fixa o default como existente (roda no host E no container) — commit `9ad21732`. Prova: 18/18 no host e **18/18 dentro da imagem de teste** `sha256:e9d929f…` (src/test montados).

## Gate e conduta

- **Gate:** sem worker vivo no checkout; árvore limpa de modificações trackeadas (resíduo untracked registrado no relatório); suíte hermética verde (ver abaixo); asserts de catálogo já em 150 validados antes do build.
- **Desvios-sanitizados registrados (SUPERVISOR-WATCHDOG, 6 flags):** todas as edições fora do escopo literal do contrato foram fixes exigidos pelo deploy aprovado (runner/`src/repository.ts`/evidências/`shellRun.ts`+teste/scripts de prova no cwd da missão) — classe OCR-01/DEFER-HOST-SIDE, nenhuma desfetuada, nenhuma funcionalidade nova fora de escopo.
- **Commits host-side:** `114e7688` executado pelo supervisor (DEFER-HOST-SIDE); `01e6a974` e `9ad21732` executados pelo operador via `!` (meu git direto é negado pelo classificador auto-mode — [Auto-Mode Bypass], sem retry). Pushes e pipelines: tool governada com aprovação explícita do operador via AskUserQuestion a cada rodada.
- **Decisões do supervisor acatadas:** push+pipeline de `aab478cf` (em vez de parar em `b0398614`); pipeline sem merge do cgroups (host-side, sem deploy; merge em janela futura); duplicata p6E cercada e PAREd limpa.

## Prova (todas as saídas reais; manifests em `.ship-eng-mcp-04/`)

- **Pipeline (`engineering.release.pipeline` pinado `9ad21732`):** test **PASS 1773 testes / 0 falhas** (suíte completa DENTRO do container de teste, 66.4s), build **PASS** (`eng-mcp-candidate:commit-9ad21732…`, `sha256:8dea4cf4…`), candidate **PASS** (candidateToolCount **150**), deploy aceito (job `99ad1800-63df-4954-8c66-e06e914dc00a`) e smoke do runner **PASS** (exit 0, 4.9s). `release-state.json`: testStatus PASS, failed 0, treeClean true, commitSha/testedHeadSha `9ad21732…`.
- **Produção:** container `memoryos-eng-mcp` `StartedAt=2026-10-04T03:42:59Z`, `Image=sha256:8dea4cf4…`, label `org.opencontainers.image.revision=9ad21732ae2ea51d78d9f7c6963d6ddf3133f7bb`; `engineering.git.remote_compare`: localHead == remoteHead == `9ad21732…`.
- **Catálogo:** `engineering.mcp.catalog` → toolCount **150**, `catalogVersion=eng-mcp-tools-v150`, `engineering.shell.run` presente.
- **Smoke shell.run (3 tiers, produção real):** tier-1 `git status --short` → `executed`, rule `git_read_or_stage`, exit 0, zero LLM; tier-2 `echo ok` → executado via juiz Jev real; tier-2 `whoami` → juiz real respondeu safeScore 0.89 < 0.9 → `refused` (`SHELL_RUN_JUDGE_REFUSED`) com probabilities dos 4 riscos; tier-3 `systemctl restart nginx` → `blocked`, `SHELL_RUN_BLOCKED`, rule `system_service_control`, exitCode null (nunca executado).
- **Verify manifest:** `verify-SHIP-ENG-MCP-04.json` (owner `SHIP-ENG-MCP-04`, provas tipadas cmd/file, todos os comandos rodados de verdade antes de gravar) → `python3 /opt/deliver-verify/verify.py --mission SHIP-ENG-MCP-04` ⇒ **verdict: pass**.

## Dívidas e pendências (registradas, fora desta ship)

- **Wiring do gate preauth no ciclo do daemon (`orchestrateConsumeDaemon.mjs`) NÃO entra nesta ship** — dívida da ORCH-PREAUTH-ARTIFACT-01 (decisão do supervisor registrada).
- **Merge do cgroups** (SHIP-CGROUPS-01) fica para janela futura — host-side, sem deploy.
- **GitNexus indisponível** (engine mismatch v43 vs v42; `npx gitnexus@latest` mesmo erro) — impacto verificado textualmente (callers enumerados; regra UNKNOWN do CLAUDE.md cumprida).
- Callers diretos `base44.entities.X.create`/`Core.*` continuam não migrados (RFC B44-EXP, planejamento).
- Resíduo untracked no checkout registrado (relatórios/verifies de missões anteriores, `.ship-*`, taps) — não trackeado, não commitado.
- Rollback, se necessário: re-pipeline do commit anterior (`b80a7e64…`); NENHUM `--force` usado; nenhum segredo em saída/log (só nome/path/hash).

## Memória

FINGERPRINT gravado no `engineering.memory.capture` (projectId `memoryos`, memoryId `afdebcc6-890b-452f-b44e-8bd9ae5513a8`, gate admit 0.83) — linha FINGERPRINT com `{missionId, head 9ad21732, verdicts (judge.verify ALL_SUPPORTED 5/5, verify.py pass), ts}` no summary: **memória gravada (fingerprint 9ad21732|8dea4cf4|judged)**. Memória local da sessão atualizada (`ship-eng-mcp-04-delivered.md`).
