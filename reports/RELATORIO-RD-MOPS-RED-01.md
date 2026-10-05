# RELATORIO-RD-MOPS-RED-01 — Suíte do mission-ops: vermelhos → 100% verde

**Missão:** RD-MOPS-RED-01 · **Data:** 2026-10-05 · **Veredito: PASS** (verdict REAL do runner `verify.py`, seção Provas)

## Sumário

A suíte do mission-ops nasceu vermelha (contrato: 6 falhas novas em
`python3 test_mission_ops.py` após os patches do dia). Este fechamento deixa a
suíte **100% verde em todos os ângulos**: 45/45 arquivos file-based, 165/165
testes serial, paralelo 2 shards 10/10 corridas, alvos do RD-TESTBASE-01 verdes,
fixes commitados na main (54899a8). As 10 falhas reais foram rastreadas a 3
causas raiz e corrigidas no lugar certo (teste ×9, fixture ×1; **zero** linhas
de código de produção tocadas por esta missão).

## Reconciliação dos "6 vermelhos" do contrato

O contrato citou `Ran 76 tests, FAILED (failures=6)` no fecho do
RD-TESTBASE-01 (~13:2x). O tree estava em edição concorrente durante toda a
janela desta missão:

- **RD-OBEY-02 (M2)** editava o plugin até ~13:58 e **pausou por ordem do
  supervisor** (ESTADO-RD-OBEY-02-PAUSA.md), citando esta missão como editor
  concorrente;
- **RD-LOOP-01 (M3)** commitou d95aba9 às 14:08:26 (preflight de despacho +
  **canônico do manifesto verify-<id>.json movido para o state dir**).

Evidência da instabilidade do tree na janela: a 1ª corrida desta missão
(~13:49) reproduziu 1 falha real (`test_close_common_mission_without_verify_unchanged`:
`'violates-obligation-O1' != 'mission_closed'`) que desapareceu após a pausa do
M2 — os arquivos mudaram sob a suíte em execução (mtimes 13:49–13:58). No
estado estável pós-pausa, a suíte principal ficou verde e os vermelhos
reais **migraram para as suítes irmãs**: 10 falhas em 4 arquivos, todas
reproduzidas, rastreadas e corrigidas (abaixo).

## Causa raiz e correção por item (10 falhas)

**Grupo A — test_rd_obey_02.py, 2 errors (R6 score).** Causa: reescrita do M2
tornou `score()` read-only (lê eventos via `_read_events`) mas o teste assumia
um escritor `obr._append_event` que não existe no módulo (em produção quem
escreve events.jsonl é o mission_core). Correção **no teste** (plumbing de
injeção, não contrato do módulo): writer local `self._append_event` com ts
epoch (formato aceito por `score._ts`).

**Grupo B — test_mission_debt.py, 1 failure (e2e debt_sweep).** Causa: o gate
O1 do RD-OBEY-02 (gate_close) promove dívida `obedience` automática em todo
close sem `chatDeliverable` — o e2e fechava sem RELATORIO e recebia 2 linhas no
registry (2 ≠ 1). Prova empírica: spy em `load_registry` (dbg) mostrou a 2ª
linha `tipo=obedience, origem=obey:<mid>, prio=1`. Correção **na fixture**:
fecho bem-comportado (`RELATORIO-<mid>.md` no cwd → chatDeliverable) — o e2e
testa o wiring do debt_sweep, não o gate de obediência; asserts originais
preservados.

**Grupo C — test_close_commit_guard.py (4), test_close_ship.py (2),
test_rd_close_timeout_01.py (1).** Causa única: commit d95aba9 (RD-LOOP-01)
tornou `verify-<missionId>.json` no **state dir** o canônico; `verify.json`
genérico no cwd passa a ser **ignorado** (`cwd_verify_ignored`) e close sem
manifesto canônico não roda o runner (fallback honesto — nunca prova
fabricada). Os testes usavam o fluxo antigo (runner sempre roda com o
`verify.json` genérico do cwd, mockado verde → badge). Correção **nos testes**,
atualizando-os ao contrato novo:

- `_ledger` do commit_guard e os closes afetados do close_ship gravam o
  canônico `verify-<mid>.json` no state dir (badge nasce via runner mockado,
  guard de commit/ship trava e libera como antes);
- `test_dirty_without_verify_manifest_still_warns` **remove** o canônico
  (escopo do teste é close SEM manifesto — badgeBlocked False preservado);
- `test_dryrun_reuse_does_not_run_runner`: o dryRun **migra** o manifesto do
  cwd para o canônico antes do reuso — a evidência do reuso passa a ser a cópia
  canônica (age 0) e o assert novo prova que o cwd foi **movido**, não copiado.
  O coração do teste (runner nunca re-executado) permanece intacto.

## Provas (todas executadas de verdade nesta sessão)

1. **File-based 45/45**: `python3 run_all_rd_mops_red_01.py` → `ARQUIVOS: 45 |
   VERMELHOS: 0` (rerun-RD-MOPS-RED-01.json). Inclui test_rd_obey_02 18/18 e
   test_mission_debt 22/22.
2. **Suíte principal serial**: `MISSION_OPS_SUITE_SHARDS=1 python3
   test_mission_ops.py` → `Ran 165 tests ... OK`.
3. **Paralelo (padrão do operator) 10/10**: `python3 test_mission_ops.py`
   ×10 → `SUITE PARALELA: OK` em todas.
4. **Alvos do RD-TESTBASE-01**: `test_proof_lint03_plugin.py` OK (37.4s) e
   `test_batch_e2e.py` OK (skip tipado CHAIN_DISPATCH_NOT_ALLOWED, exit 0) —
   ambos no run file-based.
5. **Não-regressão de produção**: esta missão **não editou linha nenhuma de
   código de produção** (só testes/fixture + runner) — diffs limitados a 5
   arquivos de teste; backups `.bak-RD-MOPS-RED-01` conferidos antes de editar.
6. **SHIP clause**: commits 54899a8 (fixes) + 83bb740 (relatório/verify) +
   commit de convergência do manifesto na main
   (`git log --oneline -1 main`).

### Divergência do manifesto verify (cwd 9 vs state 10 entradas) — ressa

A 1ª resolução do runner **move** o manifesto do cwd para o canônico do state
dir (read-once-and-move, `verify.py:876-891` — nunca reescreve), o que fez a
checagem de arquivo do cwd falhar (P16) no 1º run → verdict fail. Com as duas
pontas atualizadas (10 entradas, incluindo o path do canônico), o runner
fechou **pass 18/18**. A cópia do cwd foi então restaurada ao conteúdo EXATO
do commit 83bb740 (9 entradas) por agente fora desta sessão (janela
14:31:30–14:33 — o turno de auditoria morto do supervisor é o único
candidato). Consolidação determinística (commit de convergência na main):
cwd == state == 10 entradas, commitado na main — qualquer
re-migração/restore posterior converge para o mesmo conteúdo; verify re-rodado
pós-convergência: **pass 18/18**.

## Dívidas herdadas / nomeadas

1. **[RD-LOOP-01, herdada]** migração one-shot dos ~134 manifestos
   cwd→state-dir está em dry-run (dívida nomeada no d95aba9) — closes de
   missões com manifesto só no cwd continuam sem badge até a migração rodar.
2. **[RD-OBEY-02, retomada]** M2 pausado com itens 2–4 pendentes (asserts do
   gate no close, verify/relatório/commit próprios). O item 1 da retomada
   (re-rodar a suíte própria pós-rewrite) já ficou verde aqui (18/18).
3. **[processo]** edição concorrente no mesmo plugin produz observação falsa de
   regressão (o "6 vermelhos" nasceu disso) — o protocolo PAUSA
   (ESTADO-*-PAUSA.md + nudge do supervisor) é o remédio; nenhuma dívida aberta
   desta missão.

## Custo

custo não medido: tokens do turno não são expostos ao worker (sessão Claude
Code sem telemetria de uso no contexto) — o fecho do supervisor mede via
mission_cost (RD-OPS-03-SPEND-01) e grava no ledger/bus. FÓRMULA declarada para
o modelo do turno `z-ai/glm-5.3-flash` (tabela
`/opt/mission-events/orchestrator-price-table.json`, USD/1M: in=0.15, out=0.5,
cache_read=0.03): custo = (in×0.15 + out×0.5 + cache_read×0.03)/1e6.

## Estado da memória

memória gravada (fingerprint daa809b85ff3a4ff) —
`mission-ops-bateria-file-based.md` (suíte completa = 45 arquivos via runner
file-based; test_mission_ops.py verde não cobre os irmãos), indexada no
MEMORY.md.
