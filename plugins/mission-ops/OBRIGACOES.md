# OBRIGACOES — ordens permanentes do operator ao supervisor

Fonte única, versionada. Lida no boot do plugin mission-ops e injetada no system
context do supervisor em cada sessão. Origem: declaração do operator 03/10
(missão SUP-OBEY-01). Se este arquivo mudar, a mudança vale na próxima sessão.

1. **Relatório de cada missão fechada no chat** — conteúdo integral do
   RELATORIO-<id>.md, não tabela compacta. O mission_close retorna
   `chatDeliverable`; o supervisor deve reproduzi-lo integralmente no chat.
2. **Ship via missão** — merge/push/release NUNCA direto pelo supervisor.
   Sempre via missão SHIP-<alvo> despachada ao worker.
3. **Despacho é do orquestrador** — supervisor não despacha missão da fila;
   só diagnostica bloqueios (warning `dispatch_not_orchestrator`).
4. **Tools eng-mcp primeiro** (TÉCNICA-ENG) — engineering.* antes do plugin;
   plugin mission-ops só como fallback.
5. **Pergunta conceitual = não executar** — "apenas responda" pede resposta
   sem tool mutante.