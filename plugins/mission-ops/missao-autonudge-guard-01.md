# AUTONUDGE-GUARD-01 — retomada automática de turno parado (camada 2 anti-parada)

## Contexto (29/09)
Worker (glm→gpt-oss via bridge 8103, tool calling nativo) ainda pode parar entre turnos.
O ciclo de retomada é provado (engineering.mission.nudge, E2E 4x hoje) mas é MANUAL.
Falta o automatizador determinístico.

## Contrato — NOVO serviço systemd, SEM tocar mission-supervisor antigo
1. Novo arquivo /opt/mission-events/autonudge.py (independente; NÃO editar supervisor.py).
2. Loop (intervalo 60s, systemd service or-autonudge.service):
   a. Leia os ledgers em /root/.hermes/mission-state/*.json (status != closed).
   b. Para cada missão com último evento turn_done (ou mission_nudged há >120s sem avanço)
      e SEM verified_e2e e SEM verify.json válido no cwd:
      → chamar a tool do eng-mcp via HTTP (as ferramentas JÁ EXISTEM — nada novo):
        engineering.mission.nudge {missionId, message fixo curto, sender "autonudge", verifySeconds 30}
   c. GUARDAS (obrigatórias, fail-closed):
      - lease 90s por missão (arquivo /opt/mission-events/autonudge.lease.json): nunca 2 nudges <90s
      - teto 3 nudges por episódio (episódio = intervalo entre turnos working reais)
      - teto esgotado → 1 chamada engineering.mission.recover (escada) e evento no spool
      - recover esgotado (2x) → evento autonudge_escalated no spool com missionId e PARE (escala humana)
      - NUNCA nudge em missão working de verdade (a tool já recusa; confie no resultado dela)
      - NUNCA chamar LLM diretamente — só as tools do eng-mcp (custo zero por ciclo)
3. HTTP do eng-mcp: POST http://127.0.0.1:8787/mcp com bearer lido de
   /run/credentials/eng-mcp-release-runner.service/release-bearer (0600; nunca logar o valor).
4. Unit systemd or-autonudge.service (After=network-online.target, Restart=always, RestartSec=10).
5. Eventos no spool: autonudge_sent, autonudge_skipped_lease, autonudge_escalated.

## Provas (verify-autonudge-guard-01.json no cwd /opt/mission-events)
- cmd: systemctl is-active --quiet or-autonudge.service && echo active
- cmd: python3 -c simular: missão idle de teste sem verify → 1 nudge emitida (checar spool), 2ª dentro de 90s → skipped_lease, e após 3 → recover + escalated (use uma missão canário REAL criada só para isso: badge-canario-04 fechada não serve; crie ledger de teste autonudge-test-01 EM /root/.hermes/mission-state e REMOVA no fim)
- cmd: grep spool últimas 20 linhas tem autonudge_sent
- file: RELATORIO-autonudge-guard-01.md

## NÃO tocar
- /opt/gpu-bridge/**, /opt/memoryos/**, mission-supervisor (rejeitado pelo operator),
  event_bus.py, subscribers.json (só LEITURA do spool), missões de verdade (só nudge via tool)