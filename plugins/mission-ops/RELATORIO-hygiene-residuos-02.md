# RELATORIO-hygiene-residuos-02 — Limpeza de resíduos pós-janela de ship (pendência §9)

Missão: hygiene-residuos-02 · Data: 2026-09-30 · Executor: worker (Claude Code)
Escopo: /root/.hermes/worktrees/ · Repositório pai: /root/.hermes/plugins/mission-ops

## 1. Inventário ANTES (2026-09-30 ~12:29Z)

`du -sb /root/.hermes/worktrees/` = **2.774.226 bytes** (6 diretórios).
`df /` antes: 18% usado (66G usados, 321G livres).

| worktree | tipo | branch | último commit | status git | missão (ledger) | ledger |
|---|---|---|---|---|---|---|
| /root/.hermes/worktrees/dispatch-fast | git worktree registrada | dispatch-fast-01 | 5be7257 2026-09-27 05:54Z | limpa (0 mudanças) | dispatch-fast-03 | closed |
| /root/.hermes/worktrees/fix-mission-nudge | git worktree registrada | fix-mission-nudge | 5a65b01 2026-09-27 00:34Z | limpa (0 mudanças) | mission-nudge-02 | closed |
| /root/.hermes/worktrees/mission-notify | git worktree registrada | mission-notify-01 | b1f6616 2026-09-27 00:17Z | limpa (0 mudanças) | mission-notify-02 | closed |
| /root/.hermes/worktrees/mission-ops-wd02 | git worktree registrada | watchdog-02 | b4e95e5 2026-09-26 22:56Z | limpa (0 mudanças) | watchdog-02 (+ wd02-t1..t7) | closed |
| /root/.hermes/worktrees/model-swap | diretório comum (SEM .git) | — | — | n/a | model-swap-01 | closed |
| /root/.hermes/worktrees/plantao | diretório comum (SEM .git) | — | — | n/a | plantao-01 | closed |

Critério aplicado (contrato da missão): worktree LIMPA + branch mergeado no main do repo pai + missão `closed` no ledger. Verificação de merge (`git merge-base --is-ancestor`): as 4 branches registradas são ancestrais de `master` E de `mission-batch-01` (HEAD atual).

## 2. Decisões e execução

| worktree | decisão | motivo / comando |
|---|---|---|
| dispatch-fast | **REMOVIDA** | limpa + branch mergeado + dispatch-fast-03 closed → `git worktree remove` (OK) |
| fix-mission-nudge | **REMOVIDA** | limpa + branch mergeado + mission-nudge-02 closed → `git worktree remove` (OK) |
| mission-notify | **REMOVIDA** | limpa + branch mergeado + mission-notify-02 closed → `git worktree remove` (OK) |
| mission-ops-wd02 | **REMOVIDA** | limpa + branch mergeado + watchdog-02/wd02-t1..t7 closed → `git worktree remove` (OK) |
| model-swap | **PRESERVADA** | não é worktree git registrada (sem `.git`); `git worktree remove` recusou (`fatal: ... is not a working tree`, exit 128) e `rm -rf` é proibido pelo contrato |
| plantao | **PRESERVADA** | idem model-swap: recusa do git respeitada (`fatal: ... is not a working tree`, exit 128); contém relatório final plantao-01 |

Branches locais deletadas após remoção (`git branch -d` — todas mergeadas, missões closed):
`dispatch-fast-01` (5be7257), `fix-mission-nudge` (5a65b01), `mission-notify-01` (b1f6616), `watchdog-02` (b4e95e5).

Nenhuma recusa adicional do git além das 2 esperadas acima (todas respeitadas e registradas).

## 3. Bytes liberados

- `du -sb` antes: 2.774.226 bytes · depois: 86.740 bytes
- **Liberados: 2.687.486 bytes (~2,56 MiB)**
- `df /` depois: 18% usado (66G, 321G livres) — inalterado em ponto percentual (disco de 387G; resíduo era pequeno, ação preventiva como previsto no §9)

## 4. Itens preservados e por quê

1. `/root/.hermes/worktrees/model-swap` (37.207 B) — não registrada como worktree; remoção segura via git indisponível e rm -rf proibido. Missão model-swap-01 está closed, mas os artefatos (`swap.sh`, `rollback.sh`, `qwen-config.yaml`) podem ter valor de rollback operacional.
2. `/root/.hermes/worktrees/plantao` (49.533 B) — idem; contém `relatorio-final-plantao-01.md` e scripts de plantão.
3. Repo pai `/root/.hermes/plugins/mission-ops` — worktree principal, em uso (branch mission-batch-01). Não tocada.

## 5. Inventário ADICIONAL (só medido — nada apagado)

| item | medida |
|---|---|
| /root/.hermes/sessions/ (dumps de request) | **51.563.853 bytes (~51,5 MiB)** |
| imagens docker candidate | **1 imagem**: `eng-mcp-candidate:commit-571425ade6a5a8f72792c55999c84b22f0f3fdaf` (2,27GB) — apenas listada, SEM docker prune |
| memoryos.db (produção) | /opt/eng-mcp-release-data/production/memoryos.db = 0 bytes (vazio, 25/09); diretório memoryos/ = 152.917.136 bytes (~153 MiB, contém memoryos.db real + wal/shm) — nenhum snapshot datado adicional encontrado |

Observação: nenhum destes itens foi mutado (fronteira da missão); ficam registrados para futura decisão de higiene.

## 6. Prova pós-limpeza

`git worktree list --porcelain` ANTES (10 entradas de caminho, 5 worktrees) e DEPOIS:

```
$ git -C /root/.hermes/plugins/mission-ops worktree list
/root/.hermes/plugins/mission-ops          f7bd52c [mission-batch-01]
```

Somente a worktree principal permanece registrada. Diretório /root/.hermes/worktrees/ restante contém apenas os 2 diretórios preservados (model-swap, plantao).