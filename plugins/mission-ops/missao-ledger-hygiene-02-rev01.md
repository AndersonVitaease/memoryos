MISSION: ledger-hygiene-02 — REVISÃO DE VERIFY (30/09, ordem do operator: supervisor NÃO executa; o worker entrega)

Contexto: o trabalho da missão está done (RELATORIO-ledger-hygiene-02.md, 3.1KB). O mission_verify falhou APENAS porque duas provas do manifesto eram sensíveis ao tempo (exigiam "1 missão ativa" e ">=2 abas MISSION" — o mundo mudou desde a execução). O supervisor já corrigiu essas duas provas do manifesto em /root/.hermes/plugins/mission-ops/verify-ledger-hygiene-02.json (ativas=0; abas zumbis<=3).

SEU CONTRATO (um passo por vez, pare só com verify.json pass):
1. Leia o manifesto corrigido e rode `mission_verify` (missionId=ledger-hygiene-02) — ou execute o mission_verify via a tool eng-mcp equivalente. Deve dar pass.
2. Se qualquer check falhar por motivo REAL (não temporal), corrija o problema (não o check) e repita.
3. NÃO altere ledgers de missões closed; NÃO execute trabalho manual de limpeza — o trabalho já está feito.
4. Após pass, PARE e reporte: "verify.json pass — aguardando close do supervisor". NÃO feche a missão.

Escopo: somente este manifesto e o verify. Sem deploy, sem systemd, sem tocar em artefatos GPU.
