# RELATORIO-SHIP-CGROUPS-01

**Data:** 2026-10-04 ~04:05 UTC · **Status:** ENTREGUE — merge + push executados, **verdict pass** do runner
**Fingerprint:** main/origin-main = `81ea8eaf342543edccccf1d76fa45f7dc866902e` (merge commit; pai 2 = `af7e456c`)

## Problema

O entregável ORCH-V2-CGROUPS-01 (`af7e456c` — slice `mission-workers.slice` dinâmico + `dispatch-cgroups.py` fail-open) estava retido na branch `orch-v2-cgroups-01`, fora de main. O contrato mandava merge via tool governada `engineering.git.merge` + push governado + provas, sem deploy.

## O que aconteceu no gate (dois voos)

**Voo 1 (~02:35Z)** — PARE fail-closed, registrado no ledger como `awaiting_ship_window`: (a) `SHIP-ENG-MCP-04` (ship para main no mesmo cwd) ainda ativa; (b) `engineering.git.merge` PLAN → `MERGE_BLOCKED / TARGET_DIRTY` com `zeroMutationProof` completo. Zero mutação.

**Voo 2 (este, re-nudge 03:55Z)** — gate revalidado na janela aberta:
1. `SHIP-ENG-MCP-04` aterrissou e fechou (main `9ad21732` = origin/main); ledger sem outra ship ativa no cwd (ORCH-* restantes idle/done/needs_recovery, não mutam main).
2. Re-PLAN do merge em `9ad21732`: **`TARGET_DIRTY` persiste** — e é **estrutural e permanente**: 18 gitlinks de worktrees de missões (trackeados-modificados por conteúdo dentro dos worktrees alheios) + `release-state.json` (runtime do pipeline — commitar é proibido, reverter corrompe o estado v150). Limpar exigiria tocar artefatos de outras missões — proibido pelo contrato. A condição de PARE do contrato ("tree dirty") é **insatisfatível**: a sujeira nunca vai limpar enquanto worktrees de missões existirem.
3. **Arbitragem:** JUDGE → `contradicted, 0.4` (<0.6 → deliberar/escalar); SUPERVISOR → "escalar ao operator: exceção explícita para merge host-side; aprovada → executar; negada → PARE/BLOCKED".
4. **Operator aprovou a exceção** (AskUserQuestion, registrada): merge host-side + push governada com acknowledge.

## Entrega

- **Merge host-side** (exceção aprovada): `git merge --no-ff orch-v2-cgroups-01` em main → **`81ea8eaf`**, pais `9ad21732` + `af7e456c`, estratégia `ort`, **4 arquivos, +334, adição pura** (`dispatch-cgroups.py`, `mission-workers.slice`, `RELATORIO-ORCH-V2-CGROUPS-01.md`, `verify-ORCH-V2-CGROUPS-01.json`), zero conflito (nenhum path sujo tocado; os 4 paths não existiam na raiz de main).
- **Push governado** (`engineering.git.push`, `execute=true` + `approval.approved=true` + `acknowledgePush=true` + `expectedHead=81ea8eaf`): **status PUSHED**, fast-forward de 2 commits, `remoteHeadAfter = 81ea8eaf = localHead` (postcheck do tool), `credSource: github-app`, hooks enabled, audit written.
- **Zero deploy** — catálogo `:8787` e produção v150 intocados (o entregável é operação host-side: systemd slice + script).

## Provas executadas (verify-SHIP-CGROUPS-01.json, formato tipado do runner)

1. `git merge-base --is-ancestor af7e456c main && git rev-parse main^2` → `ANCESTOR_OK` + `af7e456cfeadd7b73a4fe51774fdc75b278310e6` — o commit do entregável está no histórico de main (como pai 2 do merge).
2. `git rev-parse main origin/main` → `81ea8eaf…` duas vezes — pós-push, main e origin/main apontam o mesmo SHA.
3. Runner: `python3 /opt/deliver-verify/verify.py --mission SHIP-CGROUPS-01` → verdict **pass** (ver seção Veredito).

## Dívidas / desvios declarados

- **Prova "git status clean pós-push" do contrato é insatisfatível** pela mesma sujeira estrutural — substituída pela prova 2 (sincronia main↔origin), que é o estado pós-push que importa. A sujeira pré-existente está intocada e documentada.
- **Exceção ao caminho governado de merge** aprovada pelo operator — registrada na mensagem do commit de merge e aqui. O merge governado continua hard-bloqueado em qualquer missão futura com worktree no checkout de main (`TARGET_DIRTY`); recomendo ao orchestrator: ou aceitar gitlinks de worktree como não-sujeira no snapshot do merge (GIT-MERGE), ou padronizar a exceção host-side.
- Duplicação cosmética: relatório/manifesto do entregável existem em `/raiz` (via merge) e em `eng-mcp/` (via `69e61673`) — reconciliar em missão futura.
- Watchdog de escopo disparou DUAS vezes (sobre `verify-SHIP-CGROUPS-01.json` e sobre `RELATORIO-SHIP-CGROUPS-01.md` em `/opt/memoryos/eng-mcp`) — **falso positivo, registrado**: o despacho (cláusulas CLOSE-VERIFY-PATH-01/REPORT-HERDR-01) e a seção Entrega do próprio contrato exigem os artefatos **no cwd da missão**, e o ledger define `cwd: /opt/memoryos/eng-mcp` (mesmo padrão dos precedentes SHIP-ENG-MCP-04/ORCH-HYGIENE-01, que gravaram os seus artefatos aí). Nenhum passo do caminho do contrato foi abandonado.
- Prova de ingestão do contrato (`CONTRATO OK SHIP-CGROUPS-01` no pane) não foi ecoada no início deste voo (voo novo pós-re-dispatch consumiu o contrato por leitura direta) — dívida de telemetria, sem efeito no entregável.

## Memória

Memória gravada (fingerprint `81ea8eaf`): (a) entrada em `MEMORY.md` + arquivo `ship-cgroups-01-delivered.md` (memória persistente da ferramenta); (b) linha FINGERPRINT gravada no `engineering.memory.capture` (projectId `memoryos`, memoryId `7a5e7ad9-0bac-4b6b-a702-36bac93aa250`, gate admit 0.75): `{missionId: SHIP-CGROUPS-01, head: 81ea8eaf, registrySha16: "" (arquivo de registry não existe nesta implantação — /data/mcp-registry.json ausente; registry intocado), verdicts: judgeVerify=ALL_SUPPORTED (rodada 2; rodada 1 MIXED sem contradita), runner=pass, ts: 2026-10-04T04:10:00Z}`.

## Veredito

PASS

PARE
