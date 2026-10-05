# HERDR-VERIFY-BADGE-02 — FECHAR O ÚLTIMO ELO: NOME DO MANIFESTO + JEV GATE

## Contexto (29/09 ~20:50)
A missão herdr-verify-template-01 entregou o verify.json TIPADO e o runner dela
deu verdict pass — mas o close do eng-mcp saiu fail-open: o deliver_verify do
close não achou o manifesto ("verify exit 2 sem provas reais parseáveis") porque
o arquivo foi gravado como verify-herdr-verify-template-01.json. O jevGate veio
"degraded" com erro: "Command failed: python3 /opt/memoryos/eng-mcp/scripts/
jev_gate.py herd..." (truncado — investigar a causa real).

## Contrato (2 itens)

### 1. Convenção do manifesto no template de dispatch (mission_core.py)
- No DISPATCH_TEMPLATE (que agora já tem a cláusula do formato tipado), definir
  EXATAMENTE onde gravar o manifesto para o close achar: descobrir qual path/nome
  o close do eng-mcp espera (ler o deliver_verify / handler mission_close do
  plugin e o fluxo do runner: verify.py resolve por cwd-mission ou --manifest;
  conferir também /root/.hermes/mission-state/<missionId>.verify.json) e mandar a
  worker gravar NESSE nome/path (candidatos: verify.json no cwd, ou
  <missionId>.verify.json no mission-state — o que o close realmente lê).
- Se o close aceitar mais de um caminho, padronizar UM no template.

### 2. jev_gate.py degradado — causa raiz
- Reproduzir: rodar python3 /opt/memoryos/eng-mcp/scripts/jev_gate.py
  <missionId> '<json>' com uma missão fechada de hoje e capturar o erro completo.
- Corrigir a causa (provável: caminho de estado/credencial/permissão no contexto
  do chamador) — mudança mínima no jev_gate.py ou no chamador.
- NÃO enfraquecer guardas: credencial nunca em stdout/log (só hash16), timeout 3s,
  fail→NAO honesto continuam valendo.

## Provas (verify.json tipado, gravado NO NOME/PATH que o close espera)
- cmd: python3 test_mission_ops.py → exit 0
- cmd: repro do jev_gate pós-fix → exit 0 com verdict SIM ou NAO (nunca crash)
- file: RELATORIO-herdr-verify-badge-02.md
- Prova final E2E: fechar uma missão canário cujo manifesto siga a convenção nova
  e o close SAIA COM BADGE (sem fail-open) — se a infra permitir, use o close da
  própria missão canário como prova.

## NÃO destruir
- Zero deploy/restart de serviço; só plugin mission-ops + scripts do eng-mcp (jev_gate.py).
- or-worker-bridge (:8103, glm) produção — não mexer.
- Não reabrir missões fechadas hoje.
