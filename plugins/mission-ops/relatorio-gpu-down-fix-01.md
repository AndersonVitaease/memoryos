# Relatório — GPU-DOWN-FIX-01 (27/09/2026)

**Status: CONCLUÍDO.** Suíte `python3 -m unittest test_mission_ops`: **110/110 OK** (101 anteriores + 9 novos, 0 falha, 1169.9s — lentidão pré-existente em `TestDispatch`, não relacionada).
Nenhuma chamada real ao vast.ai; nenhum push/merge/deploy/systemctl. Todo gpu-down nos testes roda em cópia sandbox.

## Causa-raiz

Ledger de missão grava `updatedAt`/`closedAt` como **ISO string** (ex. `model-swap-01.json`: `"updatedAt": "2026-09-27T14:40:16Z"`).

1. **`/opt/gpu-orchestrator/gpu-down.sh:60-61` (pré-fix)** — garfo anti-thrash:
   `ts=l.get('updatedAt') or ...; if ts and now-ts<n` → `time.time() - "2026-…Z"` →
   **`TypeError: unsupported operand type(s) for -: 'float' and 'str'`** (exatamente o erro do fechamento).
   Basta QUALQUER outra missão `engine=gpu` no mission-state (a própria é pulada por `GPU_SKIP_MISSION`). O heredoc morre com exit 1 → `ACTIVE_GPU=0` → **o garfo falha ABERTO** (destrói mesmo com missão gpu recente).
2. **`gpu-down.sh:146` (pré-fix)** — custo final: `sum(r.get('cost_usd',0) …)` com `cost_usd` string → `TypeError: … for +: 'int' and 'str'`; `status` nunca vira `down`, custo final nunca gravado. Mesmo risco em `float(dph_usd)`/`int(to)` com lixo/None (linhas 109, 138-140).
3. **`gpu-down.sh:153`** — `SECS=$(( T_END - STARTED ))` com `startedAt` None/ausente → `None: unbound variable` (set -u), aborta após o destroy (achado pelo teste novo de campos ausentes).
4. **`__init__.py` (mission_close, passo 5)** — `detail` era a última linha de `stdout[-600:] + stderr[-200:]` concatenados → o traceback do heredoc **mascarava o veredito real** do script (por isso o fechamento reportou "TypeError" junto de `exit 4`).

## Fix (mudança mínima)

- `gpu-down.sh`: `epoch(v)` (num/str numérica/ISO → epoch; None/lixo → None) no garfo; `num(v)` (`float(v or 0)` com try/except → 0.0) em todos os campos de custo (`dph_usd`, `to`, `billed_to`, `startedAt`, `destroy_startedAt`, `cost_usd`); pula `.json` não-dict; `GPU_MISSION_STATE_DIR` override (default = caminho real); `SECS` guardado contra startedAt não numérico. Backup do original: `gpu-down.sh.bak-20260927-gpu-down-fix`.
- `__init__.py`: novo `_gpu_down_detail(proc)` → `(última linha do stdout, última linha do stderr)`; o passo `gpu_down` usa o stdout como `detail` e anexa `stderr_tail` à parte.

## Provas (red → green)

Classe `TestGpuDownFix01` (9 testes). Sandbox: cópia do script com TODOS os caminhos reais (`/opt/gpu-orchestrator`, `/root/.hermes/mission-state`, `/opt/mission-events`, audit) trocados por tmp, `VAST=` fake (loga chamadas), pkill/sleep neutralizados, assert de que nenhum caminho real sobrou.

| teste | alvo | resultado |
|---|---|---|
| `test_red_prefix_garfo_float_minus_str` | script **pré-fix** + ledger gpu com updatedAt ISO | stderr contém o `TypeError … -: 'float' and 'str'` (VERMELHO reproduzido) |
| `test_red_prefix_final_cost_str_in_ledger` | script **pré-fix** + `cost_usd` string | `TypeError … +: 'int' and 'str'`, status fica `up` (VERMELHO) |
| `test_green_full_path_mixed_types` | fix, tipos mistos + `.json` lista | exit 0, DESTRUÍDA, `from` coagido de `"1790522000"`, final_cost = 0.0374 + intervalo final, audit gravado |
| `test_green_missing_and_none_fields` | fix, None/ausente/lixo | exit 0, `status=down`, custo 0, sem traceback |
| `test_green_garfo_defers_on_recent_iso_updatedat` | fix, outra gpu recente (ISO) | GARFO, zero chamada ao vast, state `up` |
| `test_green_garfo_skips_own_recent_mission` | fix, só a própria recente | destrói normalmente |
| `test_green_destroy_unverified_exit4_ledgers_extra` | fix, vast fake mantém a instância | exit 4, `extra_unverified` no ledger, finding no spool sandbox |
| `test_gpu_down_detail_separates_verdict_from_stderr` | helper | veredito = stdout, stderr separado |
| `test_mission_close_gpu_down_step_uses_stdout_verdict` | mission_close | usa o helper; concatenação antiga removida |

Os testes vermelhos rodam contra o `.bak` pré-fix (skip se o arquivo sumir), assim a reprodução fica permanente.

## Diff — gpu-down.sh

```diff
--- gpu-down.sh.bak-20260927-gpu-down-fix	2026-09-27 14:57:07.355731797 +0000
+++ gpu-down.sh	2026-09-27 22:39:16.180171375 +0000
@@ -42,22 +42,29 @@
 # ---------- garfo anti-thrash ----------
 ACTIVE_GPU=0
 python3 - <<'PY' && ACTIVE_GPU=1
-import json, os, time, sys
-d='/root/.hermes/mission-state'
+import json, os, time, sys, calendar
+d=os.environ.get('GPU_MISSION_STATE_DIR','/root/.hermes/mission-state')
 if not os.path.isdir(d): sys.exit(1)
 now=time.time()
 n=int(os.environ.get('GPU_GRACE_MIN','10'))*60
+def epoch(v):  # GPU-DOWN-FIX-01: ledger grava updatedAt/closedAt ISO str ('...Z'); epoch num/str também
+    if v is None or v == '': return None
+    try: return float(v)
+    except (TypeError, ValueError): pass
+    try: return float(calendar.timegm(time.strptime(str(v)[:19], '%Y-%m-%dT%H:%M:%S')))
+    except (TypeError, ValueError): return None
 for f in os.listdir(d):
     if f.startswith('.') or f=='events.jsonl' or not f.endswith('.json'): continue
     try: l=json.load(open(os.path.join(d,f)))
     except Exception: continue
+    if not isinstance(l, dict): continue  # GPU-DOWN-FIX-01: .json não-ledger (lista) derrubava o garfo
     if l.get('missionId') and l.get('missionId')==os.environ.get('GPU_SKIP_MISSION',''): continue  # a própria missão que está fechando
     if l.get('engine')!='gpu': continue
     st=l.get('status','')
     if st in ('dispatched','interrupted','needs_recovery','start_timeout','autocompact','prompt_failed'):
         sys.exit(0)  # missão gpu ativa → garfo
     # delivered há pouco (graça p/ missão seguinte reusar)
-    ts=l.get('updatedAt') or l.get('closedAt') or 0
+    ts=epoch(l.get('updatedAt')) or epoch(l.get('closedAt'))
     if ts and now-ts<n: sys.exit(0)
 sys.exit(1)
 PY
@@ -105,8 +112,11 @@
   # custo extra cobrando enquanto a instância persiste — REGISTRA no ledger antes de falhar
   EXTRA=$(python3 - "$STATE" "$T_DESTROY" "$T_END" <<'PY'
 import json,sys
+def num(v):  # GPU-DOWN-FIX-01: str/número misto, None/ausente/lixo → 0
+    try: return float(v or 0)
+    except (TypeError, ValueError): return 0.0
 p=sys.argv[1]; s=json.load(open(p))
-frm,to=int(sys.argv[2]),int(sys.argv[3]); dph=float(s.get('dph_usd') or 0)
+frm,to=int(sys.argv[2]),int(sys.argv[3]); dph=num(s.get('dph_usd'))
 e={'instance_id':s.get('instance_id'),'from':frm,'to':to,'dph_usd':dph,
    'cost_usd':round((to-frm)/3600*dph,6),'kind':'extra_unverified'}
 s.setdefault('cost_ledger',[]).append(e)
@@ -130,27 +140,30 @@
 # ---------- registra custo final (intervalos: from = billed_to anterior) ----------
 python3 - "$T_END" <<'PY'
 import json,sys
+def num(v):  # GPU-DOWN-FIX-01: str/número misto, None/ausente/lixo → 0
+    try: return float(v or 0)
+    except (TypeError, ValueError): return 0.0
 p='/opt/gpu-orchestrator/state.json'; s=json.load(open(p))
 to=int(sys.argv[1])
 # FINDING 26/09 (double-count): gpu-populate já fecha o intervalo completo (populate_interim);
 # gpu-down fechava de novo do startedAt → custo 2x. frm = maior 'to' já ledgerado (ou startedAt).
 led=s.setdefault('cost_ledger',[])
-last_to=max([int(e.get('to') or 0) for e in led] or [0])
-frm=max(int(s.get('billed_to') or 0), int(s.get('startedAt') or 0), last_to)
-dph=float(s.get('dph_usd') or 0)
+last_to=int(max([num(e.get('to')) for e in led] or [0]))
+frm=int(max(num(s.get('billed_to')), num(s.get('startedAt')), last_to))
+dph=num(s.get('dph_usd'))
 if frm <= 0: frm = to
 cost=round((to-frm)/3600*dph,6)
 led.append({'instance_id':s.get('instance_id'),'from':frm,'to':to,'dph_usd':dph,'cost_usd':cost,'kind':'final'})
 s['billed_to']=to; s['status']='down'; s['destroyedAt']=to
-s['destroy_poll_seconds']=to-int(s.get('destroy_startedAt') or to)
-s['final_cost_usd']=round(sum(r.get('cost_usd',0) for r in s['cost_ledger']),4)
+s['destroy_poll_seconds']=to-int(num(s.get('destroy_startedAt')) or to)
+s['final_cost_usd']=round(sum(num(r.get('cost_usd')) for r in s['cost_ledger']),4)
 json.dump(s,open(p,'w'))
 PY
 chmod 600 $STATE
 
 # ---------- audit + finding no bus ----------
 COST=$(python3 -c "import json;print(json.load(open('$STATE'))['final_cost_usd'])")
-SECS=$(( T_END - STARTED ))
+case "$STARTED" in ""|*[!0-9]*) SECS=0 ;; *) SECS=$(( T_END - STARTED )) ;; esac  # GPU-DOWN-FIX-01: startedAt None/ausente abortava (set -u)
 LINE=$(python3 -c "import json;print(json.dumps({'ts':__import__('time').strftime('%Y-%m-%dT%H:%M:%SZ',__import__('time').gmtime()),'event':'gpu_down','instance_id':'$CID','seconds':$SECS,'cost_usd':$COST,'model':'$(read_state model)','destroy_verified':True}))")
 echo "$LINE" >> /opt/gpu-bridge/audit.jsonl 2>/dev/null || true
 mkdir -p /opt/mission-events 2>/dev/null
```

## Diff — __init__.py (mission_close passo 5)

```diff
-            out = ((proc.stdout or b"")[-600:] + (proc.stderr or b"")[-200:]).decode("utf-8", "replace")
-            gdown_ok = proc.returncode == 0
-            last = out.strip().splitlines()[-1] if out.strip() else ""
-            steps.append({"step": "gpu_down", "ok": gdown_ok, "exit": proc.returncode,
-                          "detail": last})
+            last, err_tail = _gpu_down_detail(proc)
+            gdown_ok = proc.returncode == 0
+            step = {"step": "gpu_down", "ok": gdown_ok, "exit": proc.returncode, "detail": last}
+            if err_tail:
+                step["stderr_tail"] = err_tail
+            steps.append(step)
```
(+ função `_gpu_down_detail` antes de `_spool_gpu_event`.)

## Observações pro operator

- **Colisão de sessões:** o commit `d6821bb` (sessão mission-resume-01, 22:38Z) levou junto a mudança deste fix em `__init__.py` **e** uma versão antiga e quebrada da classe `TestGpuDownFix01` (de uma sessão anterior desta missão). A versão correta está no working tree (`test_mission_ops.py`, não commitada) — commitar ela substitui a quebrada. Não reescrevi o commit alheio.
- `gpu-down.sh` fica fora do repo (`/opt/gpu-orchestrator`) e é o script que o mission_close chama → o fix já está ativo no próximo fechamento gpu. Nenhum gpu-down real foi executado.
- Lentidão da suíte (~20 min) vem de `TestDispatch` (loops de polling reais) — pré-existente, fora do escopo.
