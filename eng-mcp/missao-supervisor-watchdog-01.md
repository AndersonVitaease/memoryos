# MISSÃO: SUPERVISOR-WATCHDOG-01 — DETECTA DERIVA/LOOP NO MEIO E ACONSELHA O WORKER EM TEMPO REAL

Despacho autorizado pelo operator 26/09 ~16:2xZ ("vamos fazer isso" + "já conseguimos enviar em paralelo essa última missão, supervisor watchdog"). Lição-âncora: a madrugada 26/09 — photopea com 9 deriva de contexto (turnos de 2h19 lendo contrato alheio), loops improdutivos; os resets de foco eram MANUAIS do supervisor Hermes. Esta tool torna o aconselhamento contínuo e barato.

## O QUE CONSTRUIR
1. **watchdog.sh/py em /opt/gpu-watchdog/**: ciclo de vigilância (a cada 60-90s):
   - Lê o estado do mission-ops (missões vivas + seus panes e contratos)
   - Lê o CONTEÚDO do pane de cada missão viva (herdr pane read) + eventos recentes do bus (/opt/mission-events/spool.jsonl)
   - Julga ATIVIDADE vs CONTRATO da missão: deriva = lendo arquivo/tema fora do escopo do contrato; turno longo (>20min) sem arquivo pousado no cwd; repetição do mesmo comando/padrão 3+ vezes; idle em bloco pós-crash (esperando "continue" — lição 26/09)
2. **Escada de intervenção (o coração do pedido do operator: "aconselhar o qwen para sair do loop e continuar no caminho correto")**:
   - 1ª detecção → **nudge de foco** injetado no pane (herdr pane send-text): "SUPERVISOR-WATCHDOG: [atividade X] está fora do seu contrato [Y]. Retorne ao alvo: [primeiro entregável pendente]."
   - 2ª detecção (persiste em 2 ciclos) → **reset forte** com o contrato citado verbatim e a lista do que JÁ está no disco (pra não refazer)
   - 3ª → **desiste de aconselhar**: encerra por supervisão é prerrogativa do supervisor Hermes — watchdog REABRE com finding? NÃO: ele para de injetar, grava finding em /opt/gpu-watchdog/findings.jsonl + evento bus kind=watchdog_escalation pro supervisor Hermes decidir (encerrar/resetar é decisão de supervisor, não de watchdog)
3. **Julgamento**: determinístico primeiro (regex/keywords do contrato vs conteúdo do pane — custo zero, pega 80% dos casos: nome de arquivo alheio, prompt de outra missão); só o cinza vai pro LLM (advisor leve — glm-5.3-flash como interim até a GPU do ORCHESTRATOR estar pronta; depois troca pro Qwen via endpoint config)
4. **Cooldown por missão** (mín. 5min entre injestões — anti-spam); só fala com missões VIVAS do state; liveness honesta (parado=parado: status em /opt/gpu-watchdog/state.json + heartbeat no bus a cada ciclo)
5. **Integração**: consome o bus existente; usa supervisor.mjs da TRINITY (/opt/gpu-bridge/supervisor.mjs) como núcleo quando LLM-judge for necessário; quando GPU-ORCHESTRATOR-01 fechar o ciclo, o watchdog aponta pro endpoint Qwen (config: /opt/gpu-watchdog/config.json com "judge_endpoint" — troca de flash pro Qwen = editar config, zero código)

## PROVAS red-then-green
- P1 red: deriva SIMULADA — pane de teste com conteúdo alheio (ler missao-gws numa missão de teste) → watchdog detecta <2 ciclos
- P2: nudge injetado no pane de teste <2min da detecção (ler o pane e ver o texto injetado)
- P3: persistência → reset forte com contrato citado no pane
- P4: 3ª → NADA injetado, finding em findings.jsonl + evento watchdog_escalation no bus
- P5: cooldown respeitado (2ª detecção dentro do cooldown NÃO injeta de novo)
- P6: detecção do idle-em-bloco pós-crash (reproduzir: pane com claude parado sem prompt) → nudge "continue"
- P7: custo medido: ciclos/hora, chamadas LLM/ciclo (target: maioria determinística, <5% LLM), latência do ciclo completo
- P8: judge 2 rodadas + capture + relatório pt-BR + RUNBOOK

## GUARDS
- Watchdog NUNCA autoriza consequência (deploy/push/dinheiro) — ele só INJETA TEXTO e ESCALA; barreira intocável
- NUNCA encerra missão por conta própria (decisão de supervisor Hermes; ele só reporta)
- Não injeta em pane que não seja missão viva listada no state do mission-ops
- Texto de injestão SEMPRE com prefixo "SUPERVISOR-WATCHDOG:" (auditoria do que veio dele)
- Anti-crash 10KB; cwd: /opt/gpu-watchdog; transcript-400 → parar e reportar
- NÃO testar injestão nas missões de obra reais (deliver-verify/supervisor-verify/gpu-orchestrator) — usar panes de teste próprios até P1-P6 verdes; só depois ligar watchdog nas missões reais (e avisar o supervisor Hermes ao ligar)
