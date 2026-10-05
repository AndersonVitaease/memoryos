MISSION: trindade-herdr-01 — REVISÃO DE VERIFY (30/09, ordem do operator: supervisor NÃO executa; o worker entrega)

Contexto: o trabalho da missão está done (RELATORIO-trindade-herdr-01.md, provas E2E das 3 rotas /v1/advisor, /v1/judge, /v1/supervisor + MCP roles). O mission_verify falhou por causa ESTRUTURAL do manifesto: ele usa formato legado (checks/backups/pending) que o verify_author não entende (todos os checks viram "tipo de prova desconhecido").

SEU CONTRATO (um passo por vez, pare só com verify.json pass):
1. Reescreva /root/.hermes/plugins/mission-ops/verify-trindade-herdr-01.json no formato vigente do verify_author:
   { "missionId": "trindade-herdr-01", "checks": [ {"id": "...", "type": "cmd"|"file"|"owner", ...} ] }
   — consulte um manifesto que passou como modelo: /opt/memoryos/eng-mcp/verify-engmcp-govern-fix-01.json.
2. As provas cmd devem testar as rotas VIVAS de verdade:
   - curl /v1/advisor (espera resposta com content), curl /v1/judge "42 e par? SIM ou NAO" (espera "supported"), roles-mcp.mjs tools/list (espera ask_advisor), /health (espera ok), curl /v1/supervisor (espera content).
   - Uma prova file: RELATORIO-trindade-herdr-01.md existe com >= 1500 bytes.
3. Rode mission_verify (missionId=trindade-herdr-01). Ajuste até pass.
4. Se a rota /v1/judge falhar por credencial (401 — pendência conhecida: credencial openrouter-judge inválida), registre como finding no relatório e use a prova com o fallback já implementado na rota (o fallback deve responder). NÃO troque camada de modelo.
5. Após pass, PARE e reporte: "verify.json pass — aguardando close do supervisor". NÃO feche a missão.

Escopo: somente o manifesto e o verify. Sem deploy, sem systemd, sem tocar em artefatos GPU.
