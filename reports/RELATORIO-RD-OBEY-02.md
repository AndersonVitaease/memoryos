# RELATORIO-RD-OBEY-02 — OBEY-HARNESS: obediência do supervisor por MECANISMO

**Mission:** RD-OBEY-02 · **Data:** 2026-10-05 · **Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/`) + bus (`/opt/mission-events/spool.jsonl`)
**Fonte:** ordem do operator 05/10 ("proponha um desenho via missão herdr onde eu consiga fazer com que vc me obedeça... preciso que esse harness seja eficiente")

## Problema

A obediência do supervisor às ordens do operator (SUP-OBEY-01: `OBRIGACOES.md`, fonte
única versionada) vivia em TEXTO injetado no boot — morre com compressão de contexto.
Obrigação violada repetidamente = dor operacional. A obediência precisa viver em
mecanismo: gates que marcam, watchdog que compara, violação que vira missão automática.

## Entrega (escopo do contrato, item a item)

| # | Contrato | Entrega |
|---|---|---|
| 1 | Registry de obrigações | `obey_registry.py` (NOVO): `load_orders()` parseia as ordens numeradas de `OBRIGACOES.md` (fonte única mantida; ids **O1..O5**) + `obligations_hash` (sha256 16hex) |
| 2 | Gates de aplicação (fail-open) | `gate_close` (O1: close sem relatório entregável ao chat; O2: ship direto desta missão) + `gate_dispatch` (O3: despacho da fila fora do orquestrador — herda a semântica ORCH_DAEMON_APPROVED do SUP-OBEY-01). Warning tipado **`violates-obligation-<id>`** na resposta; **NUNCA bloqueia, SEMPRE marca**; `mission_batch` herda (chama dispatch) |
| 3 | SUP-ACK no boot | `register()` chama `sup_ack()` → evento **`sup_ack {orders, hash}`** no bus + ack file `obey-ack.json` no state; `check_stale()` roda no ciclo do watch (`all`) — ordem nova desde o último ack = finding **`obligation_stale`** no bus (1x por hash) até novo ack (novo boot re-acka) |
| 4 | Violação → missão automática | `_record_violation` → finding no bus + registro em `obedience.jsonl` (dedicado) + **dívida tipada `obedience`, prio 1, intent `dispatch_mission` na fila AUTOMATICAMENTE** (`mission_debts.obey_promote`, dedupe por ordem: 1 dívida por ordem violada, re-violação só soma origem). O supervisor desobedecendo gera a própria correção na fila |
| 5 | Score de obediência | Tool **`mission_obey`** action=`score` (read-only): % closes com chatIntegra, % ordens cumpridas e violações por ordem (janelas **hoje/7d**) + estado do ack/stale + `obligationsHash` — dado pronto para o painel. action=`stale` (comparação de hash) e action=`ack` (re-ack explícito) |
| 6 | E2E do aceite | `prova_rd_obey_02.py`: violação forçada (close sem resumo) → finding tipado → dívida P1 na fila → score desce (O1:1, 80%) → **9/9 checks**; caminho feliz: ack de sessão nova + zero violação = **score 100%** |

**Decisões de escopo (declaradas):**
- Fonte única permanece `OBRIGACOES.md` (o "obligations-operator.md" do contrato é o
  conceito; renomear quebraria o wiring vivo do SUP-OBEY-01).
- Violações gravadas em `obedience.jsonl` (arquivo dedicado) — NÃO em `events.jsonl`,
  para não poluir `last_event`/ordenação dos eventos por missão (regressão detectada
  e corrigida: `test_close_exits_tab_and_closes_ledger` virava `last_event=violation`).
- Fila do orquestrador derivada do `mc.STATE_DIR` (env > state desviado da suíte >
  fila real): a suíte usa fila tmp — gates de teste NUNCA leem/escrevem a fila REAL
  (não-determinismo e risco de poluição de produção eliminados).
- Cancelamento não é claim de entrega: O1 não se aplica a close cancelado (guarda
  `_cancel` — alinhado à doutrina deliver-verify skip-cancel).
- `classify(gate_bypass=)` em `mission_debts.py`: correção de obediência é
  worker-doable por definição (o gate regex de credencial não a retém).

**Proibidos respeitados:** nada bloqueia operação (fail-open em todos os gates);
zero LLM no caminho rápido (regex/regra pura); nenhuma ordem apagada.

## Provas executadas

- `python3 test_rd_obey_02.py` → **18/18 OK** (R1 registry/hash, R2 sup_ack idempotente,
  R3 stale 1x-por-hash até novo ack, R4 gates fail-open O1/O2/O3, R5 dívida automática
  + dedupe, R6 score, E2E da tool `mission_obey`).
- `python3 prova_rd_obey_02.py` → **9/9 checks, exit 0 REAL** (E2E item 6: violação →
  finding `violates-obligation-O1` no bus → dívida `DEBT-…` tipo `obedience` prio 1
  status `queued` → intent `dispatch_mission` priority 1 na fila → score 80%; caminho
  feliz com ack hash `90ac83209f5531c5` → score 100%).
- `python3 test_sup_obey_01.py` → **OK** (regressão da área de obediência: G1–G4 intactos).
- `python3 test_mission_ops.py` → **SUITE PARALELA: OK (2 shards)**.
- Bateria completa `python3 run_all_rd_mops_red_01.py` → **45/45 arquivos verdes, 0
  vermelhos (~84s)** (`rerun-RD-MOPS-RED-01.json`) — suíte integral do plugin incluindo
  as irmãs (RD-LOOP-01, RD-MOPS-RED-01, RD-DEBT-01).
- Runner determinístico `python3 /opt/deliver-verify/verify.py --mission RD-OBEY-02` →
  **verdict: pass REAL** (manifesto tipado `verify-RD-OBEY-02.json` no cwd, provas cmd
  re-executadas pelo runner).

## Dívidas / notas

1. **Editor concorrente (M1):** a missão foi pausada ordenadamente 17:10 BRT
   (edições concorrentes no mesmo plugin) e retomada após o fechamento de
   RD-MOPS-RED-01/RD-LOOP-01; estado da pausa em `ESTADO-RD-OBEY-02-PAUSA.md`.
   Falhas pré-existentes provadas no A/B (scratch) viraram verdes com as entregas
   das irmãs; nada meu ficou vermelho.
2. **Deploy:** o tree /opt está à frente da cópia runtime `/root/.hermes/plugins/mission-ops`
   (dívida herdada de RD-TESTBASE-01). Redeploy = host-side/consequência externa
   (aguarda operator/SHIP) — fora do escopo.
3. **Gates O4/O5:** as ordens 4 (tools eng-mcp primeiro) e 5 (pergunta conceitual) são
   restrições de CHAMADA, não de operação mutante — ficam na injeção de contexto
   (SUP-OBEY-01) e nas guardas existentes; gates tipados cobrem as violações
   observáveis em payload (close/dispatch/ship). Extensão natural se o operator quiser.
4. **Promoções RD-DEBT-01 na suíte:** `TempState` não redireciona a fila do orquestrador
   para o caminho debt_sweep do close (pré-existente, dona RD-DEBT-01); os gates DESTA
   missão derivam a fila do STATE_DIR e são imunes — o risco herdado ficou nomeado.

## Custo

custo não medido: tokens do turno não são expostos ao worker (sessão Claude Code sem
telemetria de uso no contexto) — o fecho do supervisor mede via mission_cost
(RD-OPS-03-SPEND-01) e grava no ledger/bus. FÓRMULA declarada para o modelo do turno
`z-ai/glm-5.3-flash` (tabela `/opt/mission-events/orchestrator-price-table.json`,
verificado 2026-10-01, USD/1M: in=0.15, out=0.5, cache_read=0.03):
custo = (in×0.15 + out×0.5 + cache_read×0.03)/1e6.

## Veredito

PASS — mecanismo completo (registry + hash + sup_ack + obligation_stale + gates
fail-open O1/O2/O3 + dívida obedience P1 automática + score read-only), 18/18 na
suíte própria, 9/9 no E2E do aceite, 45/45 na bateria do plugin, verdict pass REAL
no runner determinístico.

## Memória

memória: não aplicável — o mecanismo desta entrega vive em código (gates/watchdog/
registry no plugin); a regra operacional permanente já está em `OBRIGACOES.md` (fonte
única do operator) e o conhecimento de projeto novo (obey-registry, dívida obedience,
score mission_obey) é registrável pelo fluxo padrão de captura server-side no close.
