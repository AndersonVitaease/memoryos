# RELATÓRIO WD-FP-01 — Watchdog não interrompe leitura dos próprios insumos da missão

## Causa-raiz (localizada)
- O detector D1 "lendo arquivo/prompt de missão alheia" fica em `/opt/gpu-watchdog/watchdog.py` (`detect_foreign`, chamado em `decide_actions`). O plugin mission-ops não tem esse guard (grep da string só acha esse arquivo). O contrato (item 1) manda corrigir "o caminho que emitiu" a mensagem, por isso a correção saiu do diretório do plugin. Não toca fast-router nem eng-mcp.
- `same_mission_name` diferenciava maiúsculas de minúsculas: ledger `SEC-FIX-01` / `WD-FP-01` × arquivo `missao-sec-fix-01.md` / `missao-wd-fp-01.md` → a missão via o PRÓPRIO contrato como "alheio". Reproduzido ao vivo nesta missão: o watchdog (código antigo em execução) interrompeu várias vezes com "missão alheia: wd-fp-01".
- Também não havia cruzamento com extraDirs/cwd/caminhos do prompt, nem teto de interrupções.

## Correção (backup `/opt/gpu-watchdog/watchdog.py.bak-WD-FP-01`, 147567 bytes, cmp idêntico; só edições pontuais)
1. `same_mission_name` case-insensitive.
2. `detect_foreign(..., ledger, active, contract_text)`: ANTES de virar violação, o caminho lido no pane é cruzado com (a) extraDirs, (b) caminhos citados no texto do promptFile (e o dir do promptFile), (c) cwd do ledger (caminho relativo resolvido contra o cwd). Insumo declarado da própria missão → não é violação.
3. Classificação honesta: `active_missions()` = ledgers vivos do ciclo (`_CYCLE_LIVE = live_ledgers()` no `run_cycle`) + abas `MISSION:<id>`. Arquivo de missão alheia ATIVA continua violação mesmo em extraDirs/cwd compartilhado.
4. Teto de 1 interrupção por turno: `deriva_turn_interrupted` vira True após a injeção de deriva e volta a False quando o worker sai de `working` (turno acabou). Uma deriva repetida no mesmo turno vira o evento `watchdog_deriva_repeat` no bus (dedupe por pane+motivo, sem flood) em vez de novo interrupt, e não avança a escada.
- As 2 edições do `run_cycle` (pontos 3 e 4) foram negadas pelo classificador de permissões na 1ª tentativa e aplicadas depois de AUTORIZAÇÃO explícita do supervisor.

## Testes — `/opt/gpu-watchdog/test_watchdog_wd_fp_01.py` (13)
- (i) `test_i_insumo_proprio_nao_interrompe` — run_cycle lendo o próprio promptFile + insumo em extraDirs → 0 interrupções.
- (ii) `test_ii_prompt_alheio_ativo_interrompe` (aba MISSION:) e `test_ii_b_alheia_ativa_so_por_ledger_vivo_interrompe` (só ledger vivo) → 1 interrupção.
- (iii) `test_iii_segunda_no_mesmo_turno_nao_reinterrompe` — 2ª/3ª deriva no mesmo turno: 0 interrupções novas, 1 evento `watchdog_deriva_repeat` (dedupe); novo turno (idle → working) reabre o direito a 1.
- Unitários: case-insensitive, extraDirs, cwd relativo, caminho citado no prompt, fora de tudo continua violação, alheia ativa em dir compartilhado.

## Provas executadas
- red (antes da correção): `/opt/gpu-watchdog/provas-wd-fp-01/red.txt` → failures=3 errors=8, com a mensagem real "missão alheia: wd-fp-01, ...".
- parcial (antes da autorização): `provas-wd-fp-01/parcial.txt` → 11/12, (iii) red.
- green: `provas/wd-fp-01-detector.txt` → Ran 13, OK.
- mission-ops: `python3 test_mission_ops.py` → Ran 139, OK (`provas/wd-fp-01-suite.txt`).
- watchdog (`run_suites.py watchdog`, `provas/wd-fp-01-watchdog-suites.txt`): 200 rodados, 2 falhas em `test_health_sentinel_02` (c1/c2), que já existiam — reproduzidas no código original do backup (ponte LLM ao vivo http 0). Zero regressão nova.
- Runner: `python3 /opt/deliver-verify/verify.py --mission WD-FP-01` → **verdict: pass** (manifest-owner ok, P1 suíte ok, P2 detector ok, P3–P5 arquivos ok) — `provas/wd-fp-01-runner.json`.

## Reabertura por DELIVER-VERIFY (manifest-owner)
- O `verify.json` do cwd era da `mission-ops-guard-01`. Guardei uma cópia em `verify.json.bak-WD-FP-01` (2956 bytes, cmp idêntico) e gravei o manifesto da WD-FP-01 (`mission`/`owner` = `WD-FP-01`), gerado por `provas/wd-fp-01-mkmanifest.py`, com tails reais.

## Avisos do supervisor de escopo
- "DESVIO DE ESCOPO" sobre `/opt/gpu-watchdog/watchdog.py` e `test_watchdog_wd_fp_01.py`: o contrato exige isso (o detector só existe ali) e o supervisor autorizou.
- "DESVIO DE ESCOPO" sobre `provas/wd-fp-01-mkmanifest.py`: falso positivo do guard de escopo — o arquivo está DENTRO de `/root/.hermes/plugins/mission-ops/`.

## Observações
- Sem push/deploy/restart. O watchdog em execução só passa a usar o código novo quando for recarregado (decisão do operator).
- `watchdog.py` já tinha modificações não commitadas antes desta missão; não commitei nada.

## Veredito
PASS
