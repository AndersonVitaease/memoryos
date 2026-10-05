# Relatório — mission-list-compacto-01

Data: 2026-09-28 · Base: `master` @ 13d11ea (watchdog-lane2-01 já mergeada) · Branch: `mission-list-compacto-01`
(worktree `/root/.hermes/worktrees/mission-list-compacto`; o checkout vivo do plugin não foi tocado).

## O que mudou

- **Tool registrada (chat)** `mission_list` / `mission_status` sem flags → **modo compacto**:
  - 1 linha por missão ativa (status presente e fora de `TERMINAL_STATUSES`):
    `id | status | <último evento> há <idade> | [pane viva/<agent>|MORTA|?] | pend: ...`
  - pendência determinística: `needs_recovery→recover`, `prompt_failed→reentregar prompt`,
    `start_timeout`, `interrupted`, `autocompact`, `waiting_operator→aguarda operator`,
    `pane morta`, `consequence:true→close exige verify`.
  - encerradas: `closed.count` + últimas 5 (`CLOSED_LAST_N`) por `updatedAt`, com idade.
  - `counts` por status, `semStatus` (registros sem status), `hint: full=true`.
- **Liveness honesta** (mission_list): `MORTA` só com `pane list` OK e pane ausente; se o herdr
  falhou → `pane ?` + warning. `mission_status` segue sem consultar o herdr.
- `full=true` → resposta anterior, byte a byte. `compact=true` (formato watchdog-lane2) intacto.
  Precedência: `full` > `compact` > default do chamador.
- **Chamada Python direta segue full**: o `fast-router` chama `handle_mission_list({})` /
  `handle_mission_status({})` e formata os campos completos — o default `chat` é injetado só no
  wrapper do `register_tool` (`_view_default="chat"`). `fast-router` não foi tocado.
- `mission_core.last_events(ids)`: último evento de N missões em **uma** passada pelo
  `events.jsonl` (o `last_event` por missão relê o arquivo inteiro N vezes); `age_s(ts)`.
- `mission_status` com `missionId` → registro completo (já é pequeno).

## Provas

### (a) compacto ≤2KB com ≥4 ativas reais
| momento | ledgers | ativas reais | mission_list | mission_status |
|---|---|---|---|---|
| 11:12Z | 108 | 5 (journal-writer-01, judge-restore-01, merge-lane2-01, mission-list-compacto-01, proxy-base44-01) | **834 B** | **743 B** |
| 11:24Z | 109 | 2 (as outras 3 fecharam no meio) | 537 B | 497 B |

Teste `test_list_tool_default_compact_small` / `test_status_tool_default_compact_small`: 105 ledgers
(100 closed + 4 ativas com pane + 1 needs_recovery sem pane) → `≤2048 B` assertado.

### (b) full=true idêntico
Ledger real (11:24Z): `full=true` == handler do master sem flags → `True` para as duas tools
(27 255 B e 37 941 B). Testes `test_*_full_true_equals_current` (bool e string `"true"`),
`test_direct_python_call_stays_full`, `test_compact_true_keeps_watchdog_format`, `test_full_beats_compact`.

### (c) suíte
`python -m unittest test_mission_ops test_lane2 test_mission_list_compacto` → **Ran 135 tests, OK**.
Red→green: os 10 testes novos contra o código do master → `FAILED (failures=1, errors=4)`; com a mudança 10/10.

### 4. Latência / bytes reais (ledger atual, 109 missões, `events.jsonl` 155 906 B; mediana de 5)
| tool | ANTES (default) | DEPOIS (default compacto) | redução |
|---|---|---|---|
| mission_list | 27 255 B · 13 ms | 537 B · 14 ms | −98,0% |
| mission_status | 37 941 B · 216 ms | 497 B · 5 ms | −98,7% |

Leitura de disco do `mission_status`: antes 109 × 155 906 B ≈ **17,0 MB** por chamada (um
`last_event` por ledger); depois 1 passada = **156 KB**. Isso explica 216 ms → 5 ms.

## Achados (não corrigidos — fora de escopo / quebrariam "full idêntico")
- `*.verify.json` na pasta de estado (ex.: `guardian-compute-v11-01.verify.json`) passam no
  `_is_ledger` e aparecem como "missões" sem status no full (6 registros `unknown` hoje). No compacto
  viram só `semStatus: N`. Correção natural: excluir `*.verify.json` em `list_ledgers_report`.
- O checkout vivo `/root/.hermes/plugins/mission-ops` está na branch `gpu-vast-tfa-fix-01` (5 commits
  não mergeados no master). Deploy desta mudança no plugin vivo = merge/checkout pelo operator.

## Escopo respeitado
Catálogo, governança e decisão financeira não tocados; `fast-router` não tocado. Commit único.
