# Relatório — mission-resume-01 (close-out do supervisor, 27/09)

## O que foi pedido
Tool `mission_resume` — retomada determinística pós-restart (zero LLM): resolve o pane REAL,
classifica o estado (working, idle, shell, pane morto, terminal) e age (no-op / entrega prompt /
relança claude no cwd do ledger com `--resume`, engine gpu via ponte 8102 fail-open), com
dedupe <60s e atualização de ledger + evento `mission_resumed`.

## O que foi entregue (verificado em produção hoje)
- `mission_resume.py` (módulo próprio, guard "mission_core INTACTO") + handler registrado no
  `__init__.py` — **em uso desde o incidente OOM 27/09** (retomada das missões pós-kill).
- Suite `test_mission_resume.py` + testes no `test_mission_ops.py` (suite 101/101 no deploy db81018).

## Incidente registrado (honestidade da trilha)
- Durante o turno final, o agente truncou `__init__.py` (70KB→291B) achando que "atualizou com
  sucesso" — todas as 12 tools saíram do ar por ~40min.
- Reversão pelo supervisor: `git checkout -- __init__.py` (db81018) + re-aplicação manual do
  OOM-GUARD (try/except no import de mission_resume + lazy no handler).
- Validação pós-restauração: import OK via venv, handler presente, test_watchdog_02 16/16 OK,
  mission-watcher ciclando `errors=none`.
- A missão foi fechada por decisão de supervisor (dano + reversão), sem verify.json no momento.

## Estado final
**Fontes (arquivo:linha):**
- `mission_resume.py:3` — `def mission_resume(missionId, force)` (implementação)
- `__init__.py:44-52` — OOM-GUARD: import de mission_resume + lazy no handler
- `test_mission_resume.py` — suite própria (roda via `python -m unittest` do pacote; invocação relativa direta falha por package context — defect conhecido, não bloqueia produção)
- Pendência E2E: prova de retomada real (matar pane de missão-teste → mission_resume retoma
  sozinha) — recomendada como P1 da próxima missão-teste; a lógica já rodou indiretamente nos
  redispatches FRESH de hoje (flaky-quarantine-01 e gpu-down-fix-01b).