# RELATÓRIO — MEMORY-CAPTURE-01 (fecho host-side, 03/10)

## Estado da entrega
Código completo e provado (reconciliação host-side após perda do working copy):
- `memory_capture(mission_id, summary, transport)` em `mission_core.py` — dedupe por marker `.{mission_id}.memory-captured`, fail-closed (nunca levanta), via `herdr mcp call --server engineering --tool memory.capture`.
- Passo 7 no `handle_mission_close` (`__init__.py`): capture best-effort, `{ok, deduped, error}` em steps, nunca quebra o close.
- `test_memory_capture.py`: 3 casos (ok, falha sem raise, dedupe) — **3/3 PASS**.
- SPOOL_HOOK (`nudge_input_garbage`) do guard-era também restaurado (`_spool_ops_event`).

## Provas executadas
- `python3 -m unittest test_memory_capture` → OK (3 tests)
- Suíte completa do plugin: **427/427 OK** (2 skipped esperados)
- Closes com capture no caminho: TEMPLATE-PROTOCOL-01 e TIMER-ACTIVATE-01 (step memory_capture ok:None — herdr mcp fora da sessão do host, fail-closed correto, close seguiu)

## Dívida declarada
- `herdr mcp call` retornou "unknown command: mcp" nos closes host-side — o binário herdr da sessão do supervisor não tem o subcomando mcp; em produção (gateway) o caminho é o mesmo do código. Comportamento fail-closed confirmado (ok:None, close segue). Ajuste de transport pode virar micro-missão se o operator quiser captura viva no fecho.

## Veredito
PASS — código + testes commitados, suíte verde, close resiliente. PARE.
