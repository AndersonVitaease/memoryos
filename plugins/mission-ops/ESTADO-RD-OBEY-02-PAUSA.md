# ESTADO-RD-OBEY-02 — PAUSA ORDENADA (supervisor 17:10 BRT — editor concorrente M1)

Missão: RD-OBEY-02 (OBEY-HARNESS — obediência por mecanismo). Pausa às 2026-10-05 ~17:10 BRT
por edição concorrente no mesmo plugin (M1/RD-MOPS-RED-01). RETOMAR quando o supervisor
nudgar com "M1 fechou". Contrato: /opt/mission-events/missao-rd-obey-02.md

## FEITO (edits já aplicados no tree /opt/operator-harness/plugins/mission-ops)

1. **obey_registry.py (NOVO, completo)** — registry O1..O5 parseado de OBRIGACOES.md
   (`load_orders`), `obligations_hash` (sha256 16hex), `sup_ack` (bus + obey-ack.json,
   idempotente), `check_stale` (finding obligation_stale 1x por hash até novo ack),
   `gate_close` (O1: close sem chatDeliverable; O2: ship direto da missão), `gate_dispatch`
   (O3: fila pendente fora do orquestrador; ORCH_DAEMON_APPROVED isento), `_record_violation`
   (bus finding `violates-obligation-<id>` + registro em **obedience.jsonl** dedicado + dívida
   automática), `score` (read-only: % closes com chatIntegra, % ordens cumpridas, violações
   por ordem, janelas hoje/7d). Paths state-aware: fila derivada do mc.STATE_DIR (suíte usa
   tmp — sem tocar a fila REAL de produção).
2. **mission_debts.py** — `classify(gate_bypass=)` + `obey_promote()` público (dívida tipada
   `obedience`, prio 1, intent dispatch_mission na fila AUTOMÁTICO, dedupe por ordem).
3. **__init__.py** — import obr; gate_close no close (dentro do bloco SUP-OBEY-01, com guarda
   `_cancel` acrescentada pelo supervisor na pausa); gate_dispatch após o chain gate +
   `obeyWarnings` nos 3 returns de sucesso; `check_stale` no ciclo watch `all`;
   `register()`: `sup_ack` no boot + tool **mission_obey** (score|stale|ack) + handler
   `_handle_mission_obey`.
4. **test_rd_obey_02.py (NOVO)** — 18 testes (R1..R6 + e2e da tool), **verdes na 1ª rodada
   (18/18 OK)**; depois reescrito para o desenho obedience.jsonl (última edição APLICADA,
   porém **NÃO re-rodada** — pausa chegou antes).
5. **Backups**: `__init__.py.bak-RD-OBEY-02`, `mission_debts.py.bak-RD-OBEY-02`,
   `obedience.py.bak-RD-OBEY-02` (tamanhos conferidos).
6. **A/B de regressão (scratch /opt/operator-harness/plugins/mission-ops-ab-obey)**: provado
   que `test_lock_fd_released_after_reopen_and_reclose`,
   `test_close_consequence_with_green_verify_gets_badge`, `test_wrong_owner_verify_reopens`
   (flaky) e `test_terminal_status_re_dispatches` (DISPATCH_CAP_EXCEEDED — RD-LOOP-01)
   **falham NO PRÉ-edit** = pré-existentes/WIP das irmãs, não meus.

## FALTA (na retomada)

1. Rodar `python3 test_rd_obey_02.py` (18 testes) pós-rewrite obedience.jsonl.
2. Regressão `python3 test_mission_ops.py`: espera-se que restem SÓ as 3-4 falhas
   pré-existentes provadas no A/B; corrigir apenas falhas NOVAS minhas — pendência
   conhecida: asserts de lista exata de warnings que agora ganham `violates-obligation-O1`
   (ex.: `test_close_common_mission_without_verify_unchanged:1704`) precisam de atualização
   no teste (supervisor autorizará na retomada — pausa proibiu editar testes).
3. verify-RD-OBEY-02.json (formato tipado, provas cmd rodadas de verdade) + runner
   `python3 /opt/deliver-verify/verify.py --mission RD-OBEY-02` verdict pass REAL.
4. Commit do escopo (arquivos da missão only) + seção Custo (fórmula RD-OPS-03) +
   RELATORIO-RD-OBEY-02.md (pt-BR, estado da memória citado) + resumo no pane com
   PASS/FAIL + PARE.
