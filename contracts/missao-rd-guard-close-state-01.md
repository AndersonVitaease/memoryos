# MISSÃO RD-GUARD-CLOSE-STATE-01 — Guard G1: gravar `awaitingClose` no ledger + isenção de mission_report_ack com entrega registrada

**Componente:** mission-ops plugin (`/root/.hermes/plugins/mission-ops`) · **Prioridade:** 1 · **Autoria:** operator 04/10 (autorização em chat: "autorizo") · **Data:** 04/10/2026

## Problema (findings reais de 04/10, fechamento de RD-EV-03/LEG-01/SEC-01/GUARDIAN-MOBILE-02)
1. O guard G1 (`supervisor_guard.py:237`) isenta `mission_close` de token quando `ledger.status == "awaiting_close"` OU `verified_e2e.verdict == "pass"` — mas **nenhum fluxo grava `awaiting_close` no ledger**. O watcher trata `awaiting_close` como veredito de evento (`__init__.py:1353`) e o ledger permanece `dispatched` (provado por `test_watch_detector.py:136`). Resultado: todo close de missão concluída com verify verde exige token de ordem — travou os 4 closes de 04/10 (contornados via canal daemon/direct; finding declarado ao operator).
2. `mission_report_ack` está na lista G1: o próprio close cobra o ack do RELATÓRIO-INTEGRA (`relatorio_integra_missing`), mas o ack exige token — ciclo impossível sem credencial.

## Escopo (o que entregar)
1. **Ledger `awaitingClose`:** na receita de `turn_done` do watcher (verdict `awaiting_close` — relatório + verify.json presentes), gravar flag `awaitingClose: true` no ledger via `save_ledger` atômico (mesmo padrão do `needs_recovery` usado para `recover`), com trilha de evento. Nunca clobber estados terminais (closed/cancelled/failed) nem turno working ativo.
2. **Guard lê a flag:** `supervisor_guard.py` isenção de `close` passa a aceitar também `ledger.awaitingClose == true`. Token gate segue integral para close fora desse estado. Recusas tipadas existentes inalteradas.
3. **Isenção de `mission_report_ack`:** ack com relatório já entregue como `chatDeliverable.delivered: true` no ledger OU colado no chat com registro prévio vira fluxo registrado (isento de token). Sem entrega registrada → recusa tipada mantida.
4. **Suítes:** testes novos cobrindo (a) turn_done → ledger `awaitingClose=true`; (b) close de supervisor com flag → passa sem token; (c) sem flag → recusa mantida; (d) report_ack isento com delivered:true / recusa sem entrega. Suíte `test_mission_ops.py` inteira verde.
5. **REGRA DE BACKUP:** backup `.bak-RD-GUARD-CLOSE-STATE-01` de cada arquivo runtime editado ANTES de editar; commit local na master do plugin com a decisão no corpo (repo sem remote — cláusula SHIP: sem remote, commit local documentado, como RD-LEG-01).

## Restrições
- Não mexer no gate de token em si (operator ainda não ativou o token; o gate permanece para fora do fluxo registrado).
- Zero mudança de comportamento para worker/daemon (canais daemon/direct seguem nunca-supervisor).
- Provas python via script em arquivo no cwd; suíte com timeout ≥ 2× duração real.

## Provas mínimas (verify.json tipado, formato /opt/deliver-verify/verify.py, nome `verify-RD-GUARD-CLOSE-STATE-01.json` no cwd)
- E2E determinístico: missão sintética com turn_done (relatório + verify verde) → ledger `awaitingClose=true` → `handle_mission_close` com canal supervisor MOCKADO (env `MISSION_OPS_GUARD_CHANNEL=http` + subject supervisor) SEM token → close executa; sem turn_done → `SUPERVISOR_ACTION_NEEDS_ORDER` e ledger intocado.
- `test_mission_ops.py` verde + suítes novas verdes.

## RELATÓRIO
Pt-BR, template vigente (custo, dívidas, memória), PARE com PASS/FAIL no pane.