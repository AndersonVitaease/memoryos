# BADGE-CANARIO-03 — prova E2E do badge
1. Crie /root/.hermes/plugins/mission-ops/RELATORIO-badge-canario-03.md com: "canario SCALE-02 ok".
2. Crie /root/.hermes/plugins/mission-ops/verify.json exatamente:
{"mission":"badge-canario-03","cmd":[],"file":[{"path":"/root/.hermes/plugins/mission-ops/RELATORIO-badge-canario-03.md"}]}
3. Rode python3 /opt/deliver-verify/verify.py --mission badge-canario-03 (verdict pass) e termine.
