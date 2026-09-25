# MISSÃO: NOTIFY-ROBUST-01 — SUBSTITUIR VIGILÂNCIA-POR-TELA POR EVENTOS ESTRUTURAIS (hooks claude-code)

Você está na VPS, repo /opt/memoryos/eng-mcp. Contexto: hoje o supervisor recebe notificações de missões via mission-watcher (/opt/mission-watcher) que lê a TELA do pane e classifica por regex. O operador flagrou 5 vazamentos em UM dia (turn_done, janela de restart, monitor_wait, permission_prompt, wedge síncrono) e decretou: "está muito frágil, precisamos de uma solução mais robusta, dessa forma não dá pra confiar". Band-aids em regex de tela NÃO são a resposta.

## OBJETIVO
Substituir a fonte de eventos: em vez de ler tela renderizada, capturar eventos ESTRUTURAIS direto do claude-code via HOOKS — determinístico, push, zero parsing de tela.

## DESENHO
1. **Hooks no settings compartilhado** (/opt/memoryos/eng-mcp/.claude/settings.json — vale para toda missão no cwd): `Stop` (fim exato de turno), `Notification` (permission_request, idle, auto-compact), `SessionStart` (mapear session_id→transcript). Cada hook APPEND em um spool durable ANTES de qualquer entrega: `/opt/mission-events/spool.jsonl` (json: ts, event, session_id, cwd, payload curtinho; hook falha nunca quebra o claude — best-effort, trilha é o verdadeiro).
2. **Consumidor** (novo serviço systemd `mission-event-bus`): tail/inotify do spool → mapear session→missão via ledger (mission-state/*.json) → notificar a sessão do supervisor (gateway 127.0.0.1:8642, X-Hermes-Session-Id 20260925_012625_73a703, mesma API key do watcher em /opt/eng-mcp-release-data/credentials/hermes-notify-api-key).
3. **Entrega CONFIÁVEL (a falha de hoje não pode existir):** fila durable própria (spool não consumido + tentativas); POST assíncrono em thread; RETRY com backoff; **verificação de persistência** — depois do POST 200, confirmar que a mensagem chegou de verdade (ex.: consultar o state.db do gateway pela última mensagem da sessão-alvo) antes de marcar entregue; gateway em restart → re-entrega no boot seguinte. "Notified" só quando persistido, não quando HTTP 200 (lição do dia: sucesso do motor ≠ sucesso real).
4. **Fallback secundário:** manter o pane-polling do mission-watcher SÓ para pane_lost (pane morreu) — o resto dos eventos vem dos hooks. mission-watcher reduzido, não deletado.
5. Dedupe (event id = hash ts+session+event), rate-limit por minuto (digest quando estourar), 1 linha por evento no formato `[bus] missão X: evento`.

## PROVAS red-then-green (E2E do operador é o aceite)
- P1: missão de teste (claude real no cwd) termina turno → hook Stop → linha `[bus] ... turn_done` no chat do supervisor em ≤10s (medição cronometrada).
- P2: permission prompt simulado → hook Notification → linha ≤10s.
- P3: kill -9 no event-bus → systemd reergue → catch-up entrega TUDO que perdeu (spool durable).
- P4: restart do gateway no meio da entrega → fila sobrevive → entrega após o boot (prova da janela de restart morta).
- P5: hook sabotado (spool removido) → claude NÃO quebra; fallback pane-polling ainda reporta pane_lost.
- E2E final: o operador assiste uma missão parar e a linha chega sem ele perguntar (cronometrado).

## GUARDS
- Hooks jamais mutam estado de missão; somente append no spool.
- Secret NUNCA em log/spool; bearer só lido do credentials file.
- Se os hooks não existirem na versão do claude CLI (v2.1.282 — VERIFICAR), documentar a limitação e propor alternativa estrutural (ex.: tail direto dos transcripts jsonl em ~/.claude/projects — evento de fim de turno é estrutural lá), NÃO voltar pra regex de tela.
- Relatório pt-BR + judge 2 rodadas + capture + runbook (adicionar missão nova = zero config, hooks do cwd compartilhado pegam automático).
- REGRA ANTI-CRASH: leituras max 10KB por janela. 100% autônomo.