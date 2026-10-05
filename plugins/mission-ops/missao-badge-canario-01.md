# BADGE-CANARIO-01 — prova E2E do badge de fechamento

Tarefa única, 1 turno:
1. Crie o arquivo /root/.hermes/plugins/mission-ops/RELATORIO-badge-canario-01.md com uma linha: "canario SCALE-01 ok".
2. Crie o arquivo /root/.hermes/plugins/mission-ops/verify.json EXATAMENTE assim (nome exato verify.json, no cwd):
{
  "mission": "badge-canario-01",
  "cmd": [],
  "file": [ { "path": "/root/.hermes/plugins/mission-ops/RELATORIO-badge-canario-01.md" } ]
}
3. Rode: python3 /opt/deliver-verify/verify.py --mission badge-canario-01  (deve dar verdict pass)
4. Termine o turno.
Nada além disso. Não edite código.
