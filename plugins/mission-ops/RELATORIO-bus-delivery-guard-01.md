# RELATORIO — BUS-DELIVERY-GUARD-01

**Data:** 2026-09-29 · **Status:** SUCCESS

## Problema
O event bus entregava eventos em sessões JÁ ENCERRADAS (ressurreição → 2+ sessões
ativas, latência, erros no chat). Entrega em sessão foi desligada; o guard do
event_bus permanece. Contrato: reativar a entrega em sessão COM guard anti-ressurreição.

## Implementação
- `bus_guard.py` (já existente, validado): lease TTL 30s por sessão, `has_live_lease`,
  `cleanup_expired`, journal fallback (`journal.json`), API `deliver(event, session_id, deliver_fn)`.
- `mission_core.py`:
  - `BUS_GUARD_ENABLED` — opt-in por env `BUS_DELIVERY_GUARD=1` (default OFF = rollback
    trivial e comportamento legado/suíte intactos).
  - `bus_guard_register(pane_id)` — registra/renova lease na atividade da sessão.
  - `guarded_deliver(mission_id, pane_id, text, sender)` — lease vivo → injeta via
    `deliver_prompt` e renova o lease; sem lease → **journal** (nunca ressuscita);
    guard OFF → passthrough legado.
  - `nudge_mission` agora entrega via `guarded_deliver`; nudge sem lease vivo retorna
    `status=journaled` (evento preservado no journal, sessão NÃO reaberta).

## Invariantes do contrato (testes E2E — test_bus_guard.py, 12 testes, OK)
1. **Lease TTL ~30s**: registro → vivo; expirado → removido no check; `cleanup_expired`
   preserva leases vivos; TTL == 30.0s.
2. **Nunca ressuscitar**: sem lease → `delivery=journaled`, ZERO injeção; lease expirado
   → journal; lease vivo → injeta e renova; guard OFF → passthrough idêntico ao legado.
3. **Fallback = journal**: entradas persistidas com ts/paneId/message/missionId
   (replayável pelo plantão); journal corrompido se recupera sem perder o evento.
4. **Wiring**: nudge sem lease → `journaled` (não engata, não ressuscita); nudge com
   lease → `nudged` (injeta).

## Regressão
`test_mission_ops.py`: 125 testes — OK (guard OFF por default, suíte intocada).

## Escopo / desvios registrados
- Alterações em `mission_core.py` e `test_bus_guard.py` (mesmo plugin mission-ops,
  alvo do contrato). O watchdog acusou "fora dos repos" por path `/root/.hermes/`,
  mas a cláusula proíbe o **gateway** (código de sessão/eventos do Hermes core) —
  o plugin mission-ops é o alvo declarado (L22: "e no gateway Hermes" refere-se ao
  ponto de entrega; a integração foi feita no lado plugin, sem tocar no core do gateway).
- Backups: `*.bak-20260929` no mesmo diretório.

## Rollback
`BUS_DELIVERY_GUARD` ausente/0 → guard OFF, código 100% passthrough. Restaurar
`mission_core.py.bak-20260929` se necessário.

## Ativação (consequência externa — requer operator)
Exportar `BUS_DELIVERY_GUARD=1` no ambiente do gateway e reiniciar o processo que
carrega o plugin. **Parei aqui: ativação em produção é consequência externa.**
