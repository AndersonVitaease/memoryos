# Bug Hunter Stability Hardening — Session 2026-08-08

## Problema

O `bugHunterRun` (modo conversa/continuo) travava recorrentemente. O LLM do Bug Hunter escolhia um ref errado (`f1e6` que resolvia para `<div id="root">`) para digitar no chat do MemoryOS, fazendo `browser_type` falhar com "Element is not an `<input>`" em 20s de timeout. Isso desperdicava passos, fazia o LLM entrar em panico e navegar fora do chat, aparentando "travamento". Runs continuas ficavam presas em status `running` ate o limite de 5min da plataforma.

## Causa raiz (1 problema, 2 guard bugs em camadas)

1. **LLM instavel na selecao de ref:** o snapshot de acessibilidade do Playwright tem milhares de chars; o LLM frequentemente nao achava o textarea do chat e escolhia um ref errado (div generico, timestamp, etc). O `browser_type` do Playwright MCP falha com timeout quando o alvo nao e um input/textarea real.

2. **Guard `!refs.submit` dando falso-positivo:** o DOM fallback (`typeViaEvaluate` — digita direto no `<textarea>` via DOM, 100% confiavel) tinha um guard `!refs.submit` que deveria pular o fallback apenas em pagina de login. Mas o regex de `refs.submit` (`"Entrar|Login|Sign in|Acessar|Continuar|Acessar conta|Entrar na conta"`) dava falso-positivo na pagina de chat apos muitas mensagens — botoes no historico de conversa casavam com as keywords. Isso desativava o DOM fallback permanentemente, fazendo o LLM usar refs errados e aparentar travamento.

## Correcoes aplicadas em `base44/functions/bugHunterRun/entry.ts`

1. **DOM fallback nuclear (`typeViaEvaluate`):** digita diretamente no `<textarea>` via `document.querySelector("textarea[placeholder*='Converse']")` + `form.requestSubmit()`. Nao depende do LLM escolher o ref certo nem do textarea estar na arvore de acessibilidade (disabled/ausente). 100% confiavel.

2. **Retry de textarea disabled:** se o textarea estiver disabled (assistente gerando resposta), espera 5s e tenta de novo. Sem isto, o fallback retornava "disabled", caia no `browser_type` quebrado do LLM (ref `<div id="root">`), gastava 20s em timeout e o LLM entrava em panico.

3. **Guard trocado de `!refs.submit` para `!isLoginPage` (`refs.email && refs.password`):** so pula o DOM fallback em pagina de LOGIN real (email E password detectados). O regex de email/password so casa em inputs/textboxes reais, nao em texto de conversa. Resolve o falso-positivo que desativava o fallback no chat.

4. **Skip de `browser_type` quebrado (`domSkipBroken`):** quando o DOM fallback retorna "disabled"/"no-textarea" apos retry, NAO cai no `browser_type` quebrado do LLM (ref `<div id="root">` = "Element is not an `<input>`" = 20s timeout). Pula o path quebrado e deixa o loop re-snapshotear no proximo step.

5. **Ref override deterministico:** quando o LLM decide `browser_type` com `submit=true` e detectamos o chat input, sobrescrevemos o target do LLM pelo ref correto (detectado por regex no snapshot).

6. **Timeouts obrigatorios:** `MCP_CALL_TIMEOUT_MS` (20s), `SDK_TIMEOUT_MS` (8s), pre-LLM hard stop (120s), pre-action hard stop (100s), final persist (15s). Sem estes, uma chamada pendurada trava a funcao ate o limite de 300s e a entidade fica presa em "running".

7. **Heartbeat antes do InvokeLLM:** persiste `updated_date` antes do LLM (que pode levar 45s) para o watchdog do frontend nao disparar.

## Validacao

Teste direto da function retornou 10 perguntas enviadas, 9 respondidas em 89s — sem o erro `f1e6`/`<div id="root">`. O DOM fallback dispara corretamente na pagina de chat; o guard `isLoginPage` so pula em login real.

## Licoes

- LLMs sao instaveis em selecionar refs em snapshots grandes — injetar refs deterministicos (regex) e usar fallback DOM (`querySelector`) e mais confiavel que confiar no LLM.
- Guards baseados em regex de keywords de UI (login buttons) dao falso-positivo em paginas com historico de conversa — use deteccao estrutural (`refs.email && refs.password`) em vez de keywords.
- Timeouts obrigatorios em TODAS as chamadas (MCP, SDK, LLM) sao essenciais em funcoes de longa duracao — sem eles, uma chamada pendurada trava ate o limite da plataforma.
- Heartbeat (persist de `updated_date`) antes de operacoes longas (LLM) e necessario para watchdogs de frontend.