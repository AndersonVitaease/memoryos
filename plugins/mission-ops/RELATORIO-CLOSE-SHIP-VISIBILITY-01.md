# RELATORIO — CLOSE-SHIP-VISIBILITY-01

Data: 03/10/2026 · Repo: /root/.hermes/plugins/mission-ops (commits diretos, sem push/deploy)

## Problema

Segunda classe de perda de entregável, revelada pelo incidente SNAPSHOT-WRAP-01:
a missão fechou **PASS** com o entregável na branch do worktree **SEM merge em
main** — e ninguém percebeu por horas. O close-commit-guard (CLOSE-COMMIT-01)
cobre só "commitado?"; nenhuma peça respondia "mergeado?", e o ship ficava
implícito à boa vontade do worker. O operator fixou a ordem (OBRIGACOES #2):
merge/push/release **NUNCA direto pelo supervisor — sempre via missão SHIP**.

## Entrega

1. **Guard "merged?"** — `close_commit_guard.classify_ship(cwd, ledger)`
   (determinístico, zero LLM, read-only): branch de entrega do ledger
   (worktreeBranch/branch > probe do cwd) vs main do repo
   (`MAIN_BRANCH_CANDIDATES = main, master`, `rev-parse` + `merge-base --is-ancestor`).
   Entrega em branch mainline nunca é unshipped; divergência da main
   (`merge-base != main head`) vira flag `diverged`.
2. **Veredito `unshipped_delivery`** no `handle_mission_close` (passo 0.3b):
   não bloqueia o close (badge segue); grava `shipState`
   `{merged:false, branch, headSha16, mainBranch, mainSha16, diverged}` no ledger,
   evento `unshipped_delivery` + bus, e step `ship_guard` com o veredito.
3. **Auto-despacho da missão SHIP** — novo `close_ship.py`:
   - `SHIP-<alvo>-01` despachada pelo caminho governado
     (`handle_mission_dispatch`, `spawnedBy="supervisor"`, `consequence=true`) —
     OBRIGACOES #2 respeitado; prompt enxuto determinístico (merge via
     `engineering.git.merge sourceBranch→into`, push e release tier-3 **com preauth
     do operador — gate operator-* não é interceptável: sem preauth, AGUARDE,
     nunca contorne**).
   - **Idempotente**: SHIP já ativa no ledger → `no_op` tipado, nunca duplica.
   - **Ship consciente de voos (a)**: missão ativa dependente no mesmo repo →
     item "AVISO DE VOO DEPENDENTE" no prompt (`NÃO rebaseie o worktree dela;
     seu merge é da branch fechada apenas`).
   - **Gate de release (b)**: prova E2E em voo (lastEvent de
     deliver_verify/smoke/deploy/release/... ou consequence+agent working) → SHIP
     **não** despacha: fica `awaiting_ship_window` no ledger; o close do voo
     reavalia (`release_awaiting_ships`) e despacha quando a janela abre — o
     nudge interno do contrato.
   - **Drift (c)**: main avançou desde o close → prompt instrui merge de main
     PARA a branch antes do merge de volta ("ordem certa, zero drift").
   - Fail-open de ponta a ponta: a SHIP nunca derruba o close.
4. **Testes** — `test_close_ship.py`, 17 testes unittest: classificação
   (unmerged/merged/mainline/não-repo/desconectada), idempotência (no_op),
   close mergeado → nada, aviso de dependente no prompt, E2E em voo →
   `awaiting_ship_window`, voo aterrissa → despacho na janela, tier-3 sem
   preauth → ordem de aguardar o operador, E2E real com repo temporário
   (SHIP-<repo>-01 nasce no ledger com prompt correto).

## Prova

- `provas/close-ship-visibility-01/suite-close-ship.txt` — 17/17 OK.
- `provas/close-ship-visibility-01/e2e.txt` — E2E determinístico (repo
  temporário, close de missão fictícia com branch não-mergeada →
  SHIP-<repo>-01 no ledger com prompt correto; janela de release abre no close
  do voo). 2/2 OK, caminho de despacho REAL (chain gate tier-1, spawnedBy
  supervisor).
- `provas/close-ship-visibility-01/suite-full.txt` — varredura completa do
  plugin: 32/34 suítes OK, incluindo **test_mission_ops 139/139**,
  **test_mission_ops_guard 16/16**, test_close_commit_guard 16/16,
  test_close_verify_path 9/9. Suítes pesadas em `systemd-run --scope` isolado
  (nunca no cgroup do herdr).
- Manifesto: `verify-CLOSE-SHIP-VISIBILITY-01.json` (owner
  CLOSE-SHIP-VISIBILITY-01, timeouts ≥ 2×) executado pelo runner deliver-verify.

## Dívidas

1. **Revert externo de worktree (INCIDENTE, fora do escopo)**: às 18:54:05 e
   18:59:09 um processo externo reverteu os tracked files modificados do repo
   (padrão `git restore`). Destruiu (a) meus hunks não-commitados — reaplicados
   e commitados em `807e4cd` — e (b) os hunks **SUP-OBEY-01** de `__init__.py`
   (import obedience, `dispatch_owner_guard` no watch, `relatorio_pendente_guard`
   no close, `boot_context` no register) — **não reconstituídos** (missão de
   outra rodada; `obedience.py`, `OBRIGACOES.md` e `RELATORIO-SUP-OBEY-01.md`
   sobrevivem como untracked). Suspeito circuntancial: worker
   ORCH-CONTRACT-RECOVER-01 (spawn exatamente 18:54); não confirmado. Recomendo
   forense dedicada.
2. **Duas suítes falham no HEAD limpo também** (pré-existentes, fora do escopo):
   `test_batch_e2e.py` (canário exige chain de despacho liberada no ambiente —
   `CHAIN_DISPATCH_NOT_ALLOWED`) e `test_contract_recover.py` (arquivo untracked
   de ORCH-CONTRACT-RECOVER-01; 8F/6E no HEAD limpo). Provas do HEAD limpo via
   worktree temporário em anexo do relatório do pane.
3. **Flake único** de `test_template_ptbr01` no sweep sob carga (5/5 verde
   standalone; teste determinístico de cláusulas de prompt).
4. Fixture-edits que eu fiz em `test_mission_ops.py`/`test_close_verify_path.py`
   para o guard `relatorio_nao_lido` (SUP-OBEY) foram destruídos pelo revert e
   não recriados — irrelevantes enquanto os hunks SUP-OBEY estiverem ausentes;
   quem restaurar SUP-OBEY-01 precisa recriar os ajustes de fixture.

## Conclusão

Guard "merged?" + SHIP automática consciente de voos implementados, provados e
commitados. O close agora dá visibilidade ao destino do entregável e age pelo
caminho firme do operator — sem duplicar ship, sem pisar em voo de release e
sem contornar preauth de tier-3.

**PASS**