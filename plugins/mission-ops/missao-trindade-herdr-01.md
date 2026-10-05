# TRINDADE-HERDR-01 — ROTEADOR DE PAPÉIS + CONSULTA ADIVSOR/JUDGE PELO WORKER

## Problema
A divisão de papéis (advisor glm-5.3-flash / supervisor nex-n2.5-pro / worker OR / judge JEV)
existe como credenciais no OpenRouter (models-roles-01b), mas o ciclo de missão do herdr
SÓ fala com o worker. O advisor nunca é chamado; o judge só atua no close. O worker decide
escopo sozinho (fonte de "done" precoce e degeneração).

## Contrato (implementar exatamente isso)

### 1. Rotas de papel no or-worker-bridge (/opt/gpu-bridge/proxy.mjs)
Adicionar 2 rotas HTTP novas (o /v1/messages atual permanece INTACTO — não destruir):
- POST /v1/advisor → OpenRouter, modelo `z-ai/glm-5.3-flash`, max_tokens 4096,
  temperatura 0.3, eco simplificado (aceita {system?, messages:[{role,content}]},
  responde {content}). Reusa ORH/UPSTREAM existentes.
- POST /v1/judge → OpenRouter /alpha/decisions com a MESMA credencial/judge já usada
  por /opt/memoryos/eng-mcp/src/judge.ts (ler a chave do MESMO lugar que judge.ts lê;
  NUNCA imprimir a chave). Aceita {prompt} → {verdict, raw?}.
- Ambas: log no audit.jsonl com event "role_call", role, latência. Timeout 30s.
- ANTES de tocar no proxy.mjs: cp proxy.mjs proxy.mjs.bak-pretrindade-20260929.
- systemctl restart or-worker-bridge + curl de prova nas 3 rotas (worker/judge/advisor)
  + confirmar /v1/messages continua inteiro (health + request tool_use).

### 2. MCP de consulta para o worker (stdio)
Criar /opt/gpu-bridge/roles-mcp.mjs — servidor MCP stdio mínimo (JSON-RPC 2.0,
métodos initialize/tools/list/tools/call) com 2 tools:
- ask_advisor({question}) → POST http://127.0.0.1:8103/v1/advisor → devolve o content
- ask_judge({prompt}) → POST http://127.0.0.1:8103/v1/judge → devolve o verdict
Registrar em /root/.hermes/plugins/mission-ops/CLAUDE_CONFIG_DIR/config.json
(chave "mcpServers": {"roles": {"command": "node", "args": ["/opt/gpu-bridge/roles-mcp.mjs"]}})
com backup config.json.bak-pretrindade-20260929.

### 3. Regra no template de missão
Em /root/.hermes/plugins/mission-ops/missao-bus-delivery-guard-01.md e
missao-ledger-hygiene-02.md, na seção Protocolo de condução, acrescentar:
"- TRIAGEM: dúvida de ESCOPO/arquitetura → tool ask_advisor; verificação determinística
(fato no disco/estado) → tool ask_judge; consequência externa/credencial → pare e espere
o operator. Não decida sozinho o que tem dono."

### 4. Canário E2E (prova)
Despachar (via runMissionDispatch, cwd /root/.hermes/plugins/mission-ops) a missão
canario-trindade-01 com prompt que ORDENA: (a) chamar ask_judge com prompt
"42 e par? responda SIM ou NAO"; (b) chamar ask_advisor com "Em 1 frase: vale cache-boost
em proxy de LLM?"; (c) gravar as 2 respostas em /tmp/canario-trindade-prova.txt e
pousar RELATORIO-trindade-herdr-01.md com verify.json (comandos + expect_exit).

## Não destruir
- /v1/messages e tokenLimit INATOCADOS. GPU AS-IS. Nada de systemd além de restart do bridge.
- Backups obrigatórios: proxy.mjs.bak-pretrindade-20260929, config.json.bak-pretrindade-20260929.

## Aceite (operator)
3 rotas vivas + canário com as 2 respostas pousadas + relatório/verify.json + suíte npm do
eng-mcp intocada (não precisa rodar se não tocar em src/ do eng-mcp).