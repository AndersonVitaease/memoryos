# HEALTH-SENTINEL-RED-01 — INVESTIGAR E CORRIGIR SONDA P1_LLM VERMELHA SUSTENTADA

## Problema (flagrado 29/09 14:15)
health-sentinel.state.json: verdict RED sustentado há 18764s (red_streak 176):
p1_llm FAIL — "chat FAIL 0 9ms http 0 '' | messages FAIL 0 9ms http 0 ''" —
respostas em 9ms com http 0 = a sonda provavelmente bate num endpoint/porta
que não existe mais (herança da era GPU/vLLM?) ou credencial/header errado.
p5_memory/p2_state/p3_crashloop/p4_barrier_noise: OK.

## Contrato
1. Ler /root/.hermes/runtime/health-sentinel.state.json + health-sentinel.log:
   identificar EXATAMENTE o que a sonda p1_llm chama (URL, headers, modelo).
2. Diagnóstico: o alvo da sonda existe? Responde? O que devolve em 9ms?
3. Fix (nesta ordem): (a) apontar a sonda para o alvo correto atual (a ponte
   8103 / health, ou o que fizer sentido SEM depender de worker de missão);
   (b) ou corrigir o teste da sonda (credencial/header/timeout);
   (c) se a sonda não faz mais sentido, documentar por quê e desligá-la
   (verdict passa a não considerar p1) — NUNCA esconder falha real.
4. Prova: state.json com verdict GREEN (ou p1 removida com justificativa) +
   RELATORIO-health-sentinel-red-01.md + verify.json (comandos + expect_exit)
   em /root/.hermes/plugins/mission-ops/.

## Não destruir
- NÃO tocar na ponte 8103, eng-mcp, systemd de missões, GPU (AS-IS).
- health-sentinel service: backup antes de mudar (config/state).
- Honestidade: se o problema for REAL (o chat do Hermes está mesmo doente),
  reporte como finding — não maquie a sonda.

## Protocolo de condução (obrigatório)
- TRIAGEM: escopo/arquitetura → ask_advisor; verificação determinística → ask_judge;
  travou/fim de passo → ask_supervisor; consequência externa → operator.
- PARALELISMO: ações independentes = tool calls na mesma resposta.
- Trabalho = entregáveis pousados. Narrar plano NÃO é trabalho.