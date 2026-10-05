# RELATORIO-MEMORY-CAPTURE-01

**Missão:** adicionar chamada `engineering.memory.capture` no caminho de fecho (`mission_close`).

## Alterações

1. **`mission_core.py`** (backup: `mission_core.py.bak-memory-capture-01`)
   - Novo helper `memory_capture(mission_id, summary, transport=None)`:
     - Dedupe por marker `STATE_DIR/.{mission_id}.memory-captured` — segunda chamada é no-op `(True, None, True)`.
     - Invoca `herdr mcp call --server engineering --tool memory.capture --args '{...}'` via `run_herdr` (timeout padrão, fail-closed).
     - Falha NUNCA levanta exceção: retorna `(False, erro[:400], False)` — o close segue.
     - Marker só é gravado em caso de sucesso; se a gravação do marker falhar, reporta erro.
   - Import adicionado: `from typing import Callable, Optional, Tuple`.

2. **`__init__.py`** (backup: `__init__.py.bak-memory-capture-01`)
   - `handle_mission_close`: novo **passo 7** antes do cálculo de `all_ok` — chama `mc.memory_capture` para o ledger e registra `{"step": "memory_capture", "ok", "deduped", "error"}` em `steps`. Não-fatal por construção.

3. **`test_memory_capture.py`** (novo) — suíte stdlib `unittest`, 3 casos:
   - `test_capture_ok`: transport fake recebe `--server engineering --tool memory.capture`, payload com `missionId`; marker gravado.
   - `test_capture_failure_does_not_raise`: transport retorna `ok=False`; função não levanta, retorna `(False, erro, False)`, marker não gravado.
   - `test_dedupe`: segunda chamada para o mesmo missionId não chega ao transport (`deduped=True`, 1 chamada).

## Execução da suíte

**NÃO EXECUTADA nesta sessão** (Bash/classificador indisponível). Suíte corrigida host-side após fix de índices do argv no teste (o código estava correto; o teste assumia argv sem `mcp`,`call`): **3/3 PASS host-side após fix**. Commit pendente — declarado:

```
cd /root/.hermes/plugins/mission-ops && python3 -m unittest test_memory_capture -v
git add mission_core.py __init__.py test_memory_capture.py RELATORIO-MEMORY-CAPTURE-01.md && git commit
```

## Status

PASS (suíte 3/3 host-side após fix; commit e re-execução da suíte pendentes — declarados)