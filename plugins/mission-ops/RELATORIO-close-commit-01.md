# RELATORIO — CLOSE-COMMIT-01 (02/10/2026)

## Problema vivo
Classe recorrente confirmada no dia: **MISSION-MANIFEST-PATCH-01-R2 fechou PASS com src/test/RELATORIO untracked** — o entregável ficou só no worktree (zero commits no branch) e precisou ser recuperado à mão como commits "recover" no ship v146. O mesmo já ocorrera no orchestrator-f1-01. O close verificava o relatório, mas **nunca o git**.

## Entregável (commit `a168d44`, branch `or-mission-supervisor-01`)
Guard de close contra entrega não-commitada, no plugin mission-ops:

- **`close_commit_guard.py` (novo, 141 linhas)** — módulo determinístico, zero-LLM, read-only sobre o git: roda `git status --porcelain -uall` no worktree do **cwd do ledger** e classifica cada caminho alterado.
  - *Session files nunca são entrega*: `verify*.json`, `.claude/`, `.claude-config/`, `.glgpd/`, `__pycache__/`, `venv/`, backups (`*.bak-*`, `*.destroyed-*`).
  - *Entrega não-commitada*: modificados/untracked em deploy paths (`src/`, `test/`, `tests/`, `scripts/`, `package.json`, `package-lock.json`), arquivos novos do componente (untracked com extensão de código-fonte) e **RELATORIO\*** (qualquer estado — RELATORIO faz parte do commit; foi ele que se perdeu no incidente).
  - `-uall` obrigatório: o porcelain default agrega dir untracked inteiro em `src/` — o contrato exige os **paths exatos** no warning.
- **`__init__.py` — passo 0.3 no `handle_mission_close`** (entre deliver-verify e o consequence guard): dirty de entrega → **bloqueia o badge `verified_e2e`** (fail-closed), grava `closeWarning` acionável com paths exatos + remédio (`worker: commit os artefatos antes do PARE` ou `recover-<id>-fim`), faz **auto-nudge ao worker** no pane vivo e emite evento `close_commit_dirty`. O supervisor **nunca auto-commita**. Worktree limpo → verdict `clean`; cwd fora de repo git → `not-git` (caminho inalterado). Cancelamento governado (`cancel` + `acceptUnverified`) pula o guard, como pula o deliver-verify. Guard independe do deliver-verify (sem verify.json o dirt continua virando warning).
- **`test_close_commit_guard.py` (novo, 368 linhas, 16 testes)** — molde da suíte canônica (TempState/fake_herdr): classificação determinística (8) + wiring no close (8), incluindo **red-then-green** explícito.

## Provas
| Prova | Resultado |
|---|---|
| Suíte completa do plugin (263 tests, `systemd-run --scope` isolado — regra de memória: nunca no cgroup herdr) | **OK (skipped=2), 60.343s** — `provas/close-commit-01/suite-full.txt` |
| Red-then-green explícito (untracked em deploy path bloqueia badge+warning; commit dos artefatos fecha verde com badge) | **2/2 OK** — `provas/close-commit-01/red-green.txt` |
| `verify.py --mission CLOSE-COMMIT-01` (manifest FLAT, owner = mission, 2 cmd + 4 file, evidence_tail em cada prova) | **verdict pass — 8/8 checks OK** |

## Nota honesta de execução
Nesta própria missão: os artefatos (guard, testes, wiring) **foram commitados** em `a168d44` (staging seletivo via hunks — mudanças irmãs de outras missões preservadas unstaged). Porém o close desta missão **vai disparar o guard sobre resíduo pré-existente de missões passadas** (ex.: `trinity_wire.py`, RELATORIOs antigos untracked) — comportamento honesto do guard sobre sujeira real; o remédio indicado no warning é `recover-<id>-fim`. É exatamente a classe de incidente que ele foi construído para flagar.

## Resultado final
**PASS** — suíte 263 verde, guard 16/16, red-then-green provado, verify pass 8/8, commit único só com artefatos da missão.