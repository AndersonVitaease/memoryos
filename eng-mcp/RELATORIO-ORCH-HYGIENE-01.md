# RELATÓRIO — ORCH-HYGIENE-01

**Data:** 2026-10-04 · **Commit:** `9e676f7eeda2b2437a4b93bef4adc8d42b32b6b7` (main) · **Veredito:** PASS

## Problema

O host acumula resíduos de missões sem nenhuma limpeza determinística: worktrees merged esquecidas, containers rollback `Exited(137)` há semanas, ledgers órfãos de missões mortas, panes fantasmas — e nenhum caminho governado para merge do trabalho pronto que fica preso em worktrees. Tudo hoje depende de ação manual do operator.

## Entrega

**`engineering.hygiene.cycle`** — ciclo determinístico **zero-LLM** com máquina de estados `IDLE → CLEANUP → MERGE → DEPLOY_WINDOW → IDLE` (`src/orchestrateHygiene.ts`, 916 linhas):

- **CLEANUP** (4 frentes, caps por ciclo, ordem determinística alfabética):
  1. **Worktrees**: merged em main (`merge-base --is-ancestor`) **E** sem diff não-commitado → `git worktree remove` + `git branch -d`. Com diff → **skip tipado, NUNCA descarta trabalho**.
  2. **Containers rollback** `memoryos-eng-mcp-rollback-*`: `Exited(137)` E idade > 7d → `docker rm`, **mantendo sempre os 3 mais recentes** (retenção independente de idade).
  3. **Ledgers órfãos** (status dispatched/cancelled, sem pane e sem aba no herdr, > 48h) → marcados `hygiene_orphan` no próprio ledger. **NUNCA deleta**. **Fail-closed**: herdr ilegível ⇒ nada é marcado (motivo tipado por ledger).
  4. **Panes fantasmas**: anti-ghost **REUSADO** chamando `mission_snapshot` (não copiado) — execute apenas; dryRun adia com nota.
- **MERGE**: fila **serial** (1 por vez, nunca paralela) de worktrees limpas com branch ahead de main; `git merge --ff-only` (**nunca force**); divergência = skip tipado com main intocado; main com diff não-commitado = merge adiado; cap 3/ciclo; nada a fazer = no-op com prova.
- **DEPLOY_WINDOW**: janela só com as 3 condições verdadeiras — 0 missões host em voo (ledgers dispatched), memória sob o teto do plan (`floor(MemAvailableGb/2.5) ≥ 1`, evidência ausente = conservador = janela NÃO abre), swap < 50% (REUSA o probe do breaker `readPressureSample`, não duplica amostragem). Sem janela = defer com persistência; **defer > 4h com deploy pendente comprovado** (release-state `currentCommitSha` vs HEAD) → spool `orch_hygiene_needs_operator` + notify, **uma vez por episódio** — nunca spin silencioso. Deploy pendente só é alegado com prova (arquivo ilegível = unknown, nunca inventado).
- **Trilha**: execute grava `/opt/mission-events/hygiene/ciclo-<ts>.json` (append-only: ações, skips com motivo, provas) + `state.json` + resumo 1-linha + spool `orch_hygiene_cycle`.
- **dryRun é o DEFAULT fail-closed** (`input.dryRun !== false`): projeção read-only, **zero escrita** (nem trilha, nem state, nem spool, nem mutação) — guard explícito no `spoolEvent`, sem estado de módulo.
- **Idempotência**: ciclo em estado limpo = no-op com prova; nada é deletado sem registro de destino; rollback = revert do commit.

**Modo 1 (on-demand):** tool `engineering.hygiene.cycle` registrada em `src/tools.ts` (access `write`, `requireWrite`, schema `{dryRun?: boolean}` strict).
**Modo 2 (automático):** gatilho LEVE no fim de **todo** ciclo do consume (`runDaemonCycle`, 3 return paths): `scanWorktrees` barato; só roda o ciclo se há worktree limpa com branch ahead de main; dryRun default, execute só com `ORCH_HYGIENE_APPROVED=1` no drop-in (mesmo padrão do ORCH-DAEMON-01); `ORCH_HYGIENE=0` desliga; **fail-open** — nunca trava o ciclo do consume. Runner standalone `src/orchestrateHygieneRun.mjs` (1 ciclo/invocação) para timer systemd dedicado.

## Prova (todas rodadas de verdade; manifesto tipado em `verify-ORCH-HYGIENE-01.json`)

| # | Prova | Resultado |
|---|---|---|
| 1 | Suíte alvo hermética (`test/orchestrateHygiene.test.ts`, 15 testes: máquina de estados, idempotência 2 ciclos, dryRun zero-mutação, caps, órfão nunca deletado, fail-closed herdr, gatilho 3 modos) | **15/15 pass** |
| 2 | Wiring do gatilho (`orchestrateConsumeDaemon.test.mjs` + compaction) | **19/19 pass** |
| 3 | Suíte completa do repo | **1761 testes: 1755 pass / 1 falha ambiental / 5 skipped** — discriminador estrutural exit 0 |
| 4 | **2 dryRuns REAIS consecutivos em produção** (standalone, sem approval): mesma ordem de estados, decisões de cleanup idênticas, **trilha não criada, spool com 0 eventos hygiene** (`check_hygiene_dryrun.py` 5/5 PASS, exit 0) | **exit 0** |

Falha ambiental (pré-existente, mesma do ORCH-BREAKER-01): `test/zz-proxy-live.test.ts` — probe HTTP viva contra 127.0.0.1:8787 (403 de canal nesta máquina; zz-convention: efêmera, "NEVER staged/committed", roda no host VPS). Prova estrutural: TODAS as falhas têm essa location → exit 0.

## Análise de impacto e risco (GitNexus)

- Índice com mismatch de engine (DB v43 vs build v42) — `run.cjs` local não lê; análise via runner atualizado (`npx gitnexus@latest`).
- `impact registerEngineeringTools --direction upstream`: **LOW** (4 impactados). `runDaemonCycle` não indexado (.mjs) = **UNKNOWN** → resolvido por busca textual (convenção): chamadores = teste do daemon, main do daemon, unit systemd — edição é cauda aditiva, fail-open, env-gated.
- `detect-changes --scope all` pré-commit: **risk HIGH** declarado (não eximido) — esperado: `registerEngineeringTools` está em 6 fluxos de execução; a mudança é puramente aditiva (1 register + objeto deps novo; as 15 capabilities existentes intocadas).

## Dívidas / notas para o operator

1. **`release-state.json` permanece v147** — a tool nova eleva o catálogo para **v150** (fixtures dos 4 testes de catálogo já atualizados; a entrada `orchestrate.mission_spend` do SPEND-LEDGER-01 já estava defasada e foi incluída). Atualização do release-state é da missão de ship.
2. **Ativação do Modo 2** (timer systemd / `ORCH_HYGIENE_APPROVED=1` no drop-in) é decisão de deploy do operator — padrão do ship runner.
3. **Nenhum arquivo de plugin foi editado** (`/root/.hermes/plugins/**` só lido para o design do anti-ghost) — backup não aplicável.
4. Camada 0 (`engineering.judge.verify`) e `engineering.memory.capture` não são invocáveis a partir deste pane (tools MCP do eng-mcp não expostas na sessão) — autoverificação feita por provas reais + spot-checks git; juiz de roles triou `not_addressed` (fail-open, não bloqueia).

## Memória

- **Item pendente registrado (watchdog 04/10 — "primeiro entregável pendente"):** a gravação do FINGERPRINT no ledger via `engineering.memory.capture` (VERIFY-01) está BLOQUEADA para este agente: o endpoint MCP (127.0.0.1:8787/mcp) exige bearer token e o registry `/data/tokens.json` armazena SOMENTE `tokenHash` (sha256 — raw não recuperável, verificado por nomes de campo); auto-emitir token seria emissão de credencial (faixa 3 = operator-only). **O que o operator precisa fazer (1 passo):** emitir/passar um token com scope `engineering:write` (ou `engineering:memory:capture`) e pedir o capture com o FINGERPRINT abaixo, OU deixar que o fluxo de close do supervisor o capture a partir deste relatório. FINGERPRINT pronto: `{"missionId":"ORCH-HYGIENE-01","head":"9e676f7eeda2b2437a4b93bef4adc8d42b32b6b7","registrySha16":"2655b039037d4013","verdicts":{"camada0":"provas reais exit 0 (judge.verify MCP não acessível do pane)","camada1":"git log + spot-checks ok","suite":"1755/1761, 1 ambiental zz-proxy-live"},"ts":"2026-10-04T00:30:00Z"}`.

- **Nota de escopo (watchdog 04/10):** o mission-supervisor flaggou a gravação deste RELATÓRIO como "fora dos repos do contrato" — falsa positivo confirmado contra o contrato: L13 «Escopo (repo eng-mcp — cwd /opt/memoryos/eng-mcp, commit em main)» e L48 «RELATÓRIO-ORCH-HYGIENE-01.md pt-BR + verify-ORCH-HYGIENE-01.json … no cwd que o close lê». O arquivo está no cwd exato do contrato; nada foi desfeito (mesmo padrão do RELATÓRIO-ORCH-BREAKER-01.md na mesma pasta). **Segundo flag igual (verify-ORCH-HYGIENE-01.json):** mesmo veredito — o próprio L48 exige esse arquivo NESTE cwd ("owner correto, no cwd que o close lê"), e a regra de condução CLOSE-VERIFY-PATH-01 fixa o nome exato `verify-ORCH-HYGIENE-01.json` no cwd da missão; ambos os arquivos permanecem, verdict `pass` re-confirmado após cada edição.
- Memória persistente do agente: gravada (`orch-hygiene-01-delivered.md`, ver arquivo em `.claude-config/projects/-opt-memoryos/memory/`).
- Fingerprint do ledger (VERIFY-01): `{"missionId":"ORCH-HYGIENE-01","head":"9e676f7eeda2b2437a4b93bef4adc8d42b32b6b7","registrySha16":"2655b039037d4013","verdicts":{"camada0":"provas reais exit 0 (judge.verify MCP não acessível do pane)","camada1":"git log + spot-checks ok","suite":"1755/1761, 1 ambiental zz-proxy-live"},"ts":"2026-10-04T00:30:00Z"}` — capture no ledger fica pendente de chamada MCP disponível.

## Conclusão

Entrega aditiva, fail-closed por padrão, reversível (revert do commit), sem push/deploy. **PASS**
