# BRIDGE-ROLES-AUDIT-01 — telemetria de papel na bridge (paralela, escopo /opt/gpu-bridge)

## Contrato
No /opt/gpu-bridge/proxy.mjs, enriquecer o audit para governança e escala:
1. Toda linha audit({event:'role_call'...}) ganha campo "model" (o ROLE_MODEL usado).
2. proxy_call (worker, /v1/messages) ganha "model" e "tools_n" (n de tools enviadas) e "native_history" (bool do flag).
3. proxy_call_classifier ganha "model".
4. NADA de comportamento muda — só telemetria. Sem retry, sem nova rota.
5. Prova:Bridge reiniciada (systemctl restart or-worker-bridge é permitido AQUI — escopo próprio), health 200, e uma chamada real por rota (advisor, supervisor, worker, classifier) com as novas linhas no audit.jsonl.

## Provas (verify-bridge-roles-audit-01.json no cwd /opt/gpu-bridge)
- cmd: python3 -c ler audit.jsonl últimas 10 linhas, assert existem events com campo model != null
- cmd: curl health 8103
- file: RELATORIO-bridge-roles-audit-01.md

## NÃO tocar
- /opt/memoryos/**, /opt/mission-events/**, systemd units além do restart do próprio serviço
- flags BRIDGE_NATIVE_HISTORY / BRIDGE_TOOLS_ALLOWED