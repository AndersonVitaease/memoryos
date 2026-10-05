# RELATÓRIO — gpu-vast-tfa-fix-01 (28/09/2026)

Branch: `gpu-vast-tfa-fix-01` (plugin mission-ops). Evidências: `/opt/vast-tfa-fix/evidence/`.
Nenhum valor de credencial impresso — só sha16. Instância 53056956, gc-tunnel-qwen-coder e gpu-bridge/8102 **intocados**.

## Resumo
| item | estado |
|---|---|
| 1. TFA | **Presente e válida** — premissa "sumiu" está desatualizada. Não emiti `tfa_key_missing` (não se aplica). |
| 2. Prova de destroy | **E2E REAL concluído** (operator aprovou orçamento): instância descartável 53156403 criada e destruída em ~40 s via TFA key; guardian intacto; custo < US$0,005. Red→green de auth a custo zero também documentado. |
| 3. Volume 52833471 | **NÃO é órfão** — está `in-use`, anexado à 53056956 (guardian, protegida). Não deletado. Custo/dia poupado: **US$0,00** (correto: deletar derrubaria o guardian). |
| 4. Fix float-str | Corrigido em `notify.py` + módulo novo `cost_coerce.py`; teste red→green. |
| 5. Regressão | `mission_close` de missão fake engine:gpu (custos string, updatedAt ISO): sem TypeError, `custo_gpu` presente. |

## 1. Diagnóstico da TFA
- Path canônico: `/root/.config/vastai/vast_tfa_key` — 64 bytes, **sha16 `9f95650037d2385e`**, mtime `2026-09-27 14:48:20 UTC`
  (recriada após o sumiço relatado). `vast_api_key` sha16 `1a8a7f6f467938b7` (chave distinta).
- Perms estavam **0644** → corrigido para **0600** (ambas as chaves).
- **Causa-raiz provável do sumiço:** o próprio vast CLI apaga o arquivo — `vastai/cli/main.py:224-226`:
  em 401 "Invalid user key" / 404 "Session expired", faz `os.remove(TFAKEY_FILE)` e re-tenta com a API key
  (que não tem privilégio de destroy → 401 "requires Two Factor Authentication"). Qualquer chamada do CLI com
  sessão 2FA expirada apaga a key silenciosamente.
- Backup 0600: `/root/.config/vastai-backup/vast_tfa_key.20260928014814` (sha16 idêntico).
- Obs.: `GET /api/v0/tfa/status/` retorna `tfa_enabled=False, methods=[]`, mas o endpoint de destroy exige sessão 2FA
  para a API key — então a TFA key é, na prática, o que desbloqueia destroy.

## 2. Prova red→green (custo zero) + E2E real (aprovado pelo operator)
Sondagem somente-leitura via curl (não via CLI, para o CLI não apagar a key) — `DELETE /api/v0/instances/999999999999/`:
- `vast_api_key` → **HTTP 401** "Your key lacks proper privileges … requires … Two Factor Authentication" (**RED**)
- `vast_tfa_key` → **HTTP 404** `no_such_instance` (auth passou; **GREEN**)

**E2E destroy real** (`evidence/e2e-destroy-real.txt`, 2026-09-28T10:03Z, orçamento aprovado pelo operator):
- `PUT /api/v0/asks/49574209/` (P2000, US$0.0285/h, alpine:latest, label `tfa-fix-probe-disposable`) → **200**,
  contrato **53156403** criado (resposta continha `instance_api_key` — **redigido da evidência**, nunca impresso em log/chat).
- `GET /api/v0/instances/53156403/` → 200 (existe).
- `DELETE /api/v0/instances/53156403/` → **200 `{"success": true}`** — destroy desbloqueado pela TFA key.
- Pós-destroy: GET da 53156403 → lista vazia (**removida**); listagem `/api/v1/instances/` → **apenas 53056956
  `running` (guardian intacto, zero zumbis)**. Nota: `/api/v0/instances/` (lista) é deprecated → usar v1.
- Duração create→destroy **provada por mtime: 11,6 s** (create 10:03:52.7Z → destroy 10:04:04.4Z;
  ciclo completo com verificação pós: 19,8 s) — ambos < 2 min; custo real ≈ US$0,0005.
- Higiene verificada: nenhum remanescente do `instance_api_key` em evidência/relatório (única ocorrência
  é `[REDIGIDO]`); resposta crua em `/tmp` destruída (`rm`), confirmado zero remanescentes.
  **Destroy de instância está desbloqueado e provado E2E.**

## 3. Volume 52833471
`GET /volumes/?owner=me` → `status=in-use, machine_id=30492, instances=[53056956], label gpu_qwen_vol3, 30 GB`.
Host 30492 está **vivo** (é onde a 53056956 `guardian-compute-qwen-coder` roda, `running`, dph US$0,379, storage US$0,20/dia).
Premissa "host morto/volume órfão" desatualizada. Nota: a API **tem** delete de volume (`DELETE /api/v0/volumes/?id=`,
`vastai/api/storage.py:307`) — mas usar agora quebraria o guardian. Nenhuma ação.

## 4. Fix float-str (mission_close, custo engine:gpu)
O TypeError original (garfo `now - "…Z"` em `gpu-down.sh`) já foi corrigido em `1f6f7d7` e está live
(`epoch`/`num` presentes em `/opt/gpu-orchestrator/gpu-down.sh`). O buraco remanescente no plugin:
`notify.mission_gpu_cost_usd` fazia `float()` do agregado dentro de um único `try` → **um** `cost_usd` lixo/None ou
`readyAt` ISO zerava o custo inteiro para `None` (erro engolido; `mission_completed` saía sem `custo_gpu`), e
`mission_completed(cost_usd="lixo")` levantava `ValueError`.

Fix (adendo, sem reescrever arquivo): `cost_coerce.py` novo (`num`, `epoch` — ISO/num/str → float ou None);
`notify.py`: coerção por entrada no ledger, `readyAt` via `epoch`, `dph_usd` via `num`, e `mission_completed` omite custo inválido.

Teste novo `test_gpu_cost_coerce.py` (6 testes):
- RED (pré-fix): `FAILED (failures=1, errors=3)` → `evidence/red-test_gpu_cost_coerce.txt`
- GREEN: `Ran 6 tests … OK` → `evidence/green-test_gpu_cost_coerce.txt`

## 5. Regressão
`TestMissionCloseGpuStringCost.test_close_fake_gpu_mission_no_typeerror`: ledger fake `engine=gpu`, state com
custos string + lixo + readyAt ISO; `gpu-down.sh`, spool e GPU_STATE isolados por mock (zero chamada real).
Asserções: sem "TypeError"/"ValueError" na resposta, `notify_mission_completed.ok`, `gpu_down.ok`, `custo_gpu=US$x.xxxx` emitido.
Suíte do módulo novo: 6/6 OK (`evidence/green-test_gpu_cost_coerce.txt`; `suite-full.txt` cobre só esses 6).

Suíte completa do plugin (28/09): `TestDispatch` tem lentidão pré-existente pesada nesta sessão
(`test_start_timeout_records_state` = **224,3s sozinho**; relatório gpu-down-fix-01 já registrava
1169,9s p/ 110 testes). Prova por fatias — `evidence/suite-two-slices.txt`, **RESULTADO FINAL**:
(a) teste lento sozinho: **1 teste, 224,297s, OK**; (b) restante: **115 testes, 264,500s, OK**
(inclui os 6 novos). **Total 116/116 OK, 0 falha** — o fix não regrediu nada.

## Próximos passos (operator)
1. **Orçamento (opcional):** autorizar a prova de destroy real (~US$0,01): criar instância descartável e destruí-la
   por ID exato em <2 min. A prova de auth a custo zero acima já demonstra o desbloqueio.
2. Volume 52833471: nada a fazer enquanto o guardian estiver ONLINE. Quando a 53056956 for aposentada, destruir a
   instância e então `DELETE /volumes/?id=52833471` (poupa ~US$0,20/dia).
3. Evitar re-sumiço: sessões 2FA expiram e o CLI apaga a key. Se voltar a sumir, restaurar do backup só se ainda
   válida; senão o único passo é o operator rodar `! vastai tfa login --method-type <método> -c <CÓDIGO>`.
