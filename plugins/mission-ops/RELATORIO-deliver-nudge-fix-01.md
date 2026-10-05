# RELATÓRIO — DELIVER-NUDGE-FIX-01

## Sumário
O passo `deliver_verify_nudge` do `mission_close` estava morto: quando o verify
vermelho reabria a missão, o nudge nunca era entregue de fato — o step reportava
`ok:false, error:[true,null]` mesmo com entrega OK, e a missão ficava em
`interrupted` sem o prompt de reengajamento injetado no pane.

## Causa-raiz
`mc.deliver_prompt()` (mission_core.py:802) retorna a tupla `(bool, last_error)`.
Em `__init__.py:1725` o código usava walrus:

```python
if err := mc.deliver_prompt(pane_id, nudge):
```

Uma tupla `(True, None)` é truthy → o ramo de erro era tomado SEMPRE, mesmo com
entrega bem-sucedida, gravando `{"ok": False, "error": [true, null]}` no step.
Os demais call sites (linhas 328, 580, 1794, 1839) já desempacotavam corretamente
(`ok, derr = ...`) — só este estava quebrado.

## Fix
`__init__.py:1725` — desempacotar a tupla:

```python
nud_ok, nud_err = mc.deliver_prompt(pane_id, nudge)
if not nud_ok:
    steps.append({"step": "deliver_verify_nudge", "ok": False,
                  "error": nud_err or "prompt delivery failed"})
else:
    steps.append({"step": "deliver_verify_nudge", "ok": True})
```

## Provas
- **Red (prova do bug)**: simulação do walrus antigo com `(True, None)` →
  `{"step":"deliver_verify_nudge","ok":false,"error":[true,null]}` (reproduzido).
- **Teste de regressão**: `test_mission_ops.py::TestConsequenceGuard::test_close_verify_red_nudge_tuple_unpacked`
  — close com verify vermelho simulado + `deliver_prompt=(True,None)` exige
  `deliver_verify_nudge ok:true` sem `error`. Suíte: **127 passed** (126 antes + 1 novo).
- **Canário (dry, sem tocar missões em voo)**: `upstream-idle-01` (closed) reaberta
  com verify vermelho simulado → `deliver_verify_nudge ok:true`, ledger vai a
  `interrupted` como esperado; ledger restaurado a `closed`/`verified_e2e pass`
  após a prova. Diff: `/root/.hermes/scratch/deliver-nudge-fix-01.diff`.
- **Backup**: `__init__.py.bak-DELIVER-NUDGE-FIX-01` (125536 bytes, íntegro).

## Nota de escopo
`test_mission_ops_guard.py` (não-rastreado, WIP de outra missão) falha 14 testes
por símbolos ausentes (`input_garbage_prefix` etc.) — pré-existente, fora do
escopo desta missão. A suíte principal `test_mission_ops.py` está 127/127 verde.

## Memória
memória: não aplicável (fix pontual registrado no código e no relatório; nada de
preferência do operator ou padrão reutilizável além do que o repo já documenta).

## Veredito
**PASS**
## Adendo 02/10 (relançamento da sessão)
Suíte rodada conforme instrução do operator: `python3 -m unittest test_mission_ops -v` → **exit 1** (NÃO 126/126). ~12 tests de dispatch falham com `HERDR_PANE_CREATE_FAILED` / `unexpected herdr call: tab create ... --env MISSION_OPS_WORKER=1`.

Causa-raiz (diagnóstico, não fix nesta missão): o working tree contém mudanças NÃO-commitadas de missões paralelas (GUARDRAIL-SCOPE-FIX-01 / TOOL-FAST-01 / TEMPLATE-MEM-PTBR-01) que adicionaram `--env MISSION_OPS_WORKER=1` em `tab_create()` (mission_core.py:648) e `split_pane()` (mission_core.py:175). Os fakes de herdr em test_mission_ops.py (TestDispatch etc.) validam a sequência exata de args e recusam o novo `--env` → ~12 vermelhos. O fix do nudge desta missão (mission_core.py + test_mission_ops.py `test_close_verify_red_nudge_tuple_unpacked` — ok na suíte) NÃO é a causa.

verify-DELIVER-NUDGE-FIX-01.json já está com cmd exato pedido (suíte, expect_exit 0, timeout 120). Suíte hoje = FAIL: deliver-verify vai reportar vermelho honesto até GUARDRAIL-SCOPE-FIX-01 (ou dono do `--env`) atualizar os fakes.

## Adendo 2 (02/10, execução da instrução enfileirada)
1. Fix central no fake: `fake_herdr()` em test_mission_ops.py agora normaliza o marker `--env MISSION_OPS_WORKER=1` (nova assinatura de `tab_create()`/`split_pane()` da GUARDRAIL-SCOPE-FIX-01) antes de casar as chaves — uma única edição, restante do fake continua estrito.
2. Suíte completa: `python3 -m unittest test_mission_ops -v` → **Ran 127 tests — OK** (127/127, exit 0), incluindo o novo `test_close_verify_red_nudge_tuple_unpacked` desta missão.
3. verify-DELIVER-NUDGE-FIX-01.json confirmado: cmd unittest, expect_exit 0, timeout 120 — sem alteração (já estava correto).
