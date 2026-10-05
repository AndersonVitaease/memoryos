---
name: supervisor-conduct
description: Use when answering mission queries or supervising missions.
---

# Conduta do supervisor (operator 05/10 — GRAVADA, obedecer sempre)

## Latência — 'verifique' responde em 1 chamada
- 'verifique mission X' / 'verifique as missões' = **resposta imediata em 1 chamada**: mission_watch/mission_list snapshot + estado já conhecido na sessão. NUNCA sleeps, polling, ou descida a pane nesse caso.
- Descer ao pane / rodar prova **apenas se**: (a) operator pediu detalhe/relatório integral; (b) é FECHO de missão; (c) trava detectada (input digitado sem Enter, menu aberto, >15min sem evento).
- Provas pesadas (npm test, verify runner, suítes) **nunca** em 'verificar' — só em fecho.
- Proibido: sequências de sleep + leitura de pane para 'verificar'. Se o snapshot diz working, reporte working.

## Presença
- Supervisor SEMPRE presente no chat; tool foreground <10s; esperas em background=true+notify; monitor por evento (mission_watch).

## Papéis (ROLES-09 v6 — fonte única /opt/gpu-bridge/roles.json)
- worker=advisor=classifier=glm-5.3-flash; **supervisor=nex-agi/nex-n2.5-pro** (sessão de SUPERVISÃO de missão deve nascer nesse modelo; chat corrente pode rodar glm-5.3-flash — decisão operator 05/10).
- judge=JEV jev-1.13. advisor≠judge. Não trocar camada sem ordem do operator.

## Supervisor usa tools governadas (operator 05/10)
- Toda ação que a superfície governada cobre (engineering.* do catálogo: shell.run, host.systemd, memory.*, judge.*, registry) **deve passar pela rota governada** (gate MCP → agente auditado) — nunca direto no host via terminal.
- Terminal host-side do supervisor SÓ para: (a) dívidas host-side com ORDEM EXPLÍCITA do operator (DEFER-HOST-SIDE); (b) diagnóstico/leitura; (c) operação do próprio plugin/gateway. Se usar terminal onde existia rota governada, declarar no relatório como finding (contorno manual = finding).
- Fail-closed: rota governada indisponível → reportar e aguardar ordem, nunca abrir contorno silencioso.

## Fechos (doutrina RELATÓRIO-INTEGRA v2 — operator 05/10)
- Relatório INTEGRAL = entregável DA MISSÃO no herdr (arquivo no cwd + verify.json) — nunca mais colado no chat.
- No chat, no fecho: **resumo em palavras simples** explicando exatamente o que a missão entregou (fácil de entender, sem jargão) + caminho do relatório + mission_report_ack com operatorOrder.
- Never fabricate verify results; verify red = reopen com nudge (nunca forçar close).
