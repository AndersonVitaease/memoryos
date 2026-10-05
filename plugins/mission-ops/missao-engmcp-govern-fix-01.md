# ENG-MCP-GOVERN-FIX-01 — 2 findings de governança (escopo exclusivo: /opt/memoryos/eng-mcp + plugin)

## Findings (flagados 29/09)
A. engineering.mission.ledger_fix: a descrição promete correção de "paneId/tabId/status"
   mas o schema só aceita paneId/tabId (status → TOOL_INPUT_INVALID). Status é o campo
   que mais se precisa (reabrir missão fechada sem badge).
B. mission.close não é idempotente: se a aba já foi fechada numa tentativa anterior,
   tab_close falha ("tab_not_found") → ok:false MESMO com deliver_verify PASS.

## Contrato
A. Wrapper ledger_fix (eng-mcp src/missionOps.ts ou plugin mission_core/handler): aceitar
   campo status (validar contra conjunto: dispatched|working|interrupted|closed|done) e
   aplicar no ledger com auditoria (campo fixed_by=ledger_fix no ledger + evento no spool).
B. close: tab_not_found NÃO é falha — trata como já-fechada (step ok:true, note "tab já fechada").
C. Testes: adicionar casos nos testes do plugin (test_mission_ops.py) para ambos.
D. Prova E2E: criar ledger canário engmcp-govern-canary (em /root/.hermes/mission-state),
   fechar 2x seguidas → 2ª também ok:true; ledger_fix com status dispatched → applied.

## Provas (verify-engmcp-govern-fix-01.json no cwd /opt/memoryos/eng-mcp)
- cmd: python3 test_mission_ops.py (timeout 120) → exit 0
- cmd: python3 /opt/deliver-verify/verify.py --mission engmcp-govern-canary → pass (criar manifesto do canário)
- file: RELATORIO-engmcp-govern-fix-01.md
ATENÇÃO: alterar src/ requer pipeline governada — COMMIT os fontes e rode
scripts/eng-mcp-release.mjs test; NÃO faça deploy (supervisor fará o deploy).

## NÃO tocar
/opt/gpu-bridge/**, /opt/mission-events/autonudge.py, roles.json, missões em voo