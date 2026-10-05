# RELATÓRIO — DISPATCH-FAST-03 (29/09)

**Estado:** regressão verde (236/236). Durante a regressão achei e corrigi um falso-positivo no fail-fast. A prova E2E do canário está **PENDENTE**: o gate de cadeia bloqueia o despacho a partir deste pane (§4). O patch do operator **não foi revertido**, só endurecido.

## 1. Achado: o fail-fast de 29/09 não disparava na era sem-GPU
O patch sondava só `GET 8102/health`. Hoje, com o vast desligado:
- o proxy `node /opt/gpu-bridge/proxy.mjs` (pid 1325107, subido 08:23) continua vivo;
- o túnel `ssh` continua escutando na 8101.

Resultado: `/health` responde `{"ok":true,"upstream":"http://127.0.0.1:8101"}`, mas `8101/v1/models` dá **ECONNRESET**. A sonda antiga dizia *viva*, então **não pulava o gpu-up**: 720s de `gpu-up.sh` (search + **create vast**), e o claude nascia na 8102 morta. É o mesmo caminho morto da models-roles-01b.

Prova ao vivo em `provas/dispatch-fast-03/probe-live.txt`: sonda antiga = `True`, sonda nova = `False`, em 0,157s.

**Correção (no patch, sem reverter):**
- `__init__.py` ganhou `_qwen_bridge_alive()`. É uma sonda E2E: `8102/health` 200 **e** o `upstream` que o próprio `/health` declara precisa responder `/v1/models` 200, os dois com timeout de 2s. Qualquer erro conta como morta.
- O bloco do dispatch agora chama esse helper. O resto do patch ficou igual: evento `gpu_up_skipped`, `engine=openrouter-fallback`, claude no 8103, worker_model lido da unit.

## 2. Outras correções no mesmo escopo
| Arquivo | O que mudou | Por quê |
|---|---|---|
| `relaunch.py` `claude_command` | `engine` `openrouter` ou `openrouter-fallback` agora relança com `ANTHROPIC_BASE_URL=8103` | Antes, o recover de uma missão do fallback voltava para o claude caro direto (fugia do item 2 do fix) |
| `__init__.py` `_spool_gpu_event` | Grava no `_MISSION_SPOOL` (mesmo arquivo, resolvido na chamada) | Antes o caminho era fixo e os testes sujavam o bus real |
| `test_mission_ops.py` loader | `_qwen_bridge_alive` virou mock (a real fica em `_qwen_bridge_alive_real`) | A suíte fazia urlopen real na 8102 e só passava porque o proxy estava vivo |
| `test_dispatch_fast03.py` (novo, 8 testes) | Sonda: upstream morto, upstream 5xx, health≠200, ponte fora, cadeia viva. Dispatch: ponte morta pula o gpu-up e usa o 8103; ponte viva faz gpu-up normal. Relaunch no 8103 | Prova red→green |
| `test_mission_resume.py` (untracked, pré-existente) | Reescrito: importável no discover, 4 testes coerentes com injeção de dependências | Antes nem importava (import relativo) e os 3 testes se contradiziam. O `mission_resume.py` é um stub que nenhum handler chama; tem guarda para isso |

Suíte: `python3 -m unittest discover -p 'test_*.py'` → **Ran 236 tests, OK** (scope MemoryMax=2G). Saída em `provas/dispatch-fast-03/suite-full.txt`; testes novos em `tests-new.txt` (12/12).

## 3. Tempos de despacho {caminho, antes, depois}
| Caminho | Antes (patch só /health, ou sem patch) | Depois (sonda E2E) |
|---|---|---|
| GPU off, proxy 8102 vivo, upstream morto (**estado de hoje**) | /health diz viva: gpu-up até 720s (+ create vast), depois ready até 180s na 8102 morta. Pane morre, despacho perdido | Sonda 0,16s: `gpu_up_skipped`, claude no 8103, depois ready normal. **Meta <60s: medição pendente do canário (§4)** |
| GPU off, proxy 8102 fora | Patch já pulava (urlopen falha): 8103 | Igual (sonda falha em ms) |
| GPU viva (8102 e upstream 200) | gpu-up (reuse, sem create) e claude na 8102 | **Igual**: sonda positiva segue para o gpu-up normal (teste `test_live_bridge_runs_gpu_up_normally`) |
| `engine=openrouter` declarado | 8103, sem gpu-up | Igual |

## 4. Canário E2E: BLOQUEADO pela governança, handoff pronto
`chain_gate('dispatch-fast03-canario-01', pane w6:p5)` → **`CHAIN_DISPATCH_NOT_ALLOWED`**. Este pane é a missão `dispatch-fast-03`, e o prompt dela não traz `allow_chain_dispatch: true`. Não contornei o gate:
- não removi `HERDR_PANE_ID`;
- não editei o prompt depois do despacho.

Contornar seria burlar a governança do operator.

**Pronto para quem tem autoridade:**
- Prompt: `/root/.hermes/test-missions/dispatch-fast03-canario-01/prompt.md` (só `date -Is > /tmp/dispatch-fast03-prova.txt`).
- Coletor: `python3 provas/dispatch-fast-03/collect_canary.py`. Checa (a) `gpu_up_skipped` no spool sem gpu_up/gpu_up_failed, (b) `engine=openrouter-fallback`, (c) `dispatchedAt − createdAt < 60s`, (d) arquivo criado. Grava `canary-proof.json`, exit 0 = verde. Essa é a linha vermelha do `verify.json`.
- Despacho **sem engine**: o código do disco precisa estar carregado (veja o ⚠ abaixo). Pode ser em um shell do operator fora de pane de missão:
  ```
  cd /root/.hermes/plugins/mission-ops && python3 -c "import sys,importlib.util,json;s=importlib.util.spec_from_file_location('mission_ops','__init__.py',submodule_search_locations=['.']);m=importlib.util.module_from_spec(s);sys.modules['mission_ops']=m;s.loader.exec_module(m);print(m.handle_mission_dispatch({'missionId':'dispatch-fast03-canario-01','promptFile':'/root/.hermes/test-missions/dispatch-fast03-canario-01/prompt.md','spawnedBy':'operator'}))"
  ```
  Depois: `collect_canary.py`, e fechar com `mission_close acceptUnverified` apontando para `canary-proof.json`.

**⚠ RISCO DE CUSTO ATIVO:** o gateway Hermes (pid 617318) roda desde **28/09 12:50**, com código **anterior** a este fail-fast. Um despacho pelo gateway sem `engine=openrouter` roda o `gpu-up.sh`, que faz **search + create de instância vast**. Até o supervisor reiniciar o gateway (não fiz, consequência externa), todo despacho pelo gateway precisa declarar `engine=openrouter`. O canário **não** pode sair pelo gateway antigo.

## 5. Quando a GPU voltar
- Nada a mudar no código. Com o vast up, `8102/health` = 200 e `8101/v1/models` = 200: a sonda fica positiva e o dispatch volta ao gpu-up normal (reuse, sem create) com o claude na 8102.
- Checagem rápida: a linha "COERENTE" do `verify.json` (sonda == estado real do upstream).
- Se a sonda der falso-negativo com a GPU viva (vLLM lento para `/v1/models` em mais de 2s), o sintoma é `gpu_up_skipped` com a ponte saudável. A correção é subir o `timeout` do `_qwen_bridge_alive`, não remover a sonda.
- Recover/relaunch: missões `engine=gpu` continuam na 8102; as do fallback continuam no 8103.

## 6. Guardas e custos
- `or-worker-bridge` ativo, sem nenhum stop/restart.
- Zero create/destroy vast; gpu-recover e gpu-watchdog intocados; nenhum toque em /opt/memoryos/eng-mcp nem no judge JEV.
- Sem push e sem deploy; gateway **não** reiniciado.
- Créditos OR: usage **$998.2272 antes** (08:30) → **$998.8080 depois** (08:33), para total 1026. O delta de $0,58 é da conta toda (outros workers no 8103). Esta missão fez **zero** chamadas OR (as sondas não tocam o 8103). Arquivos em `provas/dispatch-fast-03/credits-{before,after}.json`.
- O `verify.json` anterior (supervisor, missão mission-list-compact-default-01, não commitado) foi preservado em `provas/mission-list-compact-default-01/verify.json.supervisor-29-09.bak`. Também existe `verify-dispatch-fast-03.json`.
