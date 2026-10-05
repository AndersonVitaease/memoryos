# RELATORIO — trindade-herdr-01 (29/09, executada pelo SUPERVISOR por ordem do operator)

## Entregáveis (todos com prova)

1. ROTAS DE PAPEL no or-worker-bridge (proxy.mjs, /v1/messages e tokenLimit INTACTOS):
   - POST /v1/advisor → z-ai/glm-5.3-flash (max 4096, temp 0.3) — prova: 200,
     resposta correta sobre cache-boost, lat ~10s, audit role_call advisor 200.
   - POST /v1/judge → /alpha/decisions typesafe/jev-1.13 (contrato de judge.ts:
     {model, state, questions choice supported/contradicted/not_addressed}) —
     prova: veredicto correto "supported" 79% (42 é par), custo $0.0000157.
2. FALLBACK de credencial: /data/credentials/openrouter-judge (container) está
   INVÁLIDA (401 na /api/v1/key e no /alpha/decisions). A rota /v1/judge faz
   fallback transparente para a chave da ponte, com audit "judge-key 401, fallback ORH".
   PENDÊNCIA DECRETADA: judge.ts do eng-mcp está com credencial morta (silencioso —
   o smoke do deploy testava contrato, não chamada viva). Corrigir via rotacionar
   a credencial ou apontar fallback equivalente.
3. MCP do worker: /opt/gpu-bridge/roles-mcp.mjs (stdio, JSON-RPC 2.0, zero deps),
   tools ask_advisor + ask_judge. Registrado no config dourado
   (CLAUDE_CONFIG_DIR/config.json, mcpServers.roles) — panes FRESH herdam.
   Prova E2E: tools/list OK; tools/call ask_judge → "verdict: supported (0.78)".
4. Regra de TRIAGEM no template de condução (bus-delivery-guard-01 e
   ledger-hygiene-02): escopo → ask_advisor; verificação determinística →
   ask_judge; consequência externa → operator.

5. SUPERVISOR DA TRINDADE: POST /v1/supervisor → nex-n2.5-pro (system de orquestração,
   NÃO executa) — prova: decisão objetiva de próximo passo; MCP ask_supervisor no
   roles-mcp.mjs (3 tools: ask_advisor, ask_supervisor, ask_judge) — canário E2E:
   "Crie o relatório... gere verify.json". Regra de triagem atualizada nos templates.

## Backups (rollback em 1 passo)
- /opt/gpu-bridge/proxy.mjs.bak-pretrindade-20260929
- /opt/gpu-bridge/proxy.mjs.bak-presupervisor-20260929
- /root/.hermes/plugins/mission-ops/CLAUDE_CONFIG_DIR/config.json.bak-pretrindade-20260929

## Trilha
audit.jsonl: role_call advisor 200 (9.9s), judge 401→fallback, judge 200 (~1.3s, $0.0000157)
