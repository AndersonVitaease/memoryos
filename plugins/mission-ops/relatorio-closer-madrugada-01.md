# Relatório — closer-madrugada-01

Data: 2026-09-28 · Contrato: `/opt/memoryos/eng-mcp/missao-closer-madrugada-01.md`

## §1 Recon — entrega do cron em gateway

**Canal de mensagens conectado: NENHUM.** Pelo contrato, a missão para aqui e passa a decisão ao operator.

Evidência:
- `~/.hermes/gateway_state.json` (gateway PID 434134, `running`, atualizado 12:22Z): `platforms` tem só
  `api_server` (`connected`, `http://127.0.0.1:8642`). Não há telegram, discord, slack, whatsapp nem signal.
- `~/.hermes/channel_directory.json`: `"platforms": {}` (nenhum chat/canal descoberto).
- `config.yaml`: `platform_toolsets` lista telegram/discord/… mas isso só mapeia toolsets. Não conecta nada.
- Os jobs cron que já existiram usaram `deliver: local` e `deliver: origin` (`origin: null`). Nenhum tinha destino de mensagem.
- Não li `.env` (o classificador de permissão negou; também não era necessário, porque o estado do gateway já é a fonte autoritativa de "conectado").

### Bloqueio 2 (achado do recon): o worker externo do cron está quebrado

Os dois últimos jobs (`lembrete-revisar-relatorio` 27/09 09:00, `p4-sentinel-check-gpu-bridge` 27/09 14:06) terminaram `last_status: error`:

```
Restart-safe cron worker dispatch failed: cron external worker exited before ownership acknowledgement (exit 1)
  … hermes_yaml.py line 10: from ruamel.yaml import YAML
ModuleNotFoundError: No module named 'ruamel'
```

Reproduzi agora com o mesmo ambiente do worker (`sys.executable` = python 3.14.7 do tools, `PYTHONPATH=/usr/local/lib/hermes-agent`, sem bootstrap):
`import cron.jobs` → `ModuleNotFoundError: No module named 'ruamel'`. Pelo caminho com `hermes_bootstrap`, o mesmo import funciona
(o `ruamel` fica no venv `~/.hermes/installs/76f6…/environments/3bbd…/venv/lib/python3.14/site-packages`).

Causa: `cron/scheduler.py:3452` sobe o worker como `sys.executable -m cron.scheduler`. O sanitizer de env
(`build_subprocess_env`) remove o site-packages do runtime, e `pin_hermes_tree_on_pythonpath`
(`cron/scheduler_worker_env.py`) repõe só a árvore do hermes, não o venv. **Nenhum job cron roda hoje, com ou sem canal.**
`hermes cron status/doctor` dão verde porque só olham o ticker, não o worker.

Isso é código do engine (`/usr/local/lib/hermes-agent`), não do plugin. Não mexi.

## Decisões do operator (passos exatos)

1. **Conectar um canal de mensagens** (é credencial, então é decisão sua). Telegram, por exemplo:
   - criar o bot no @BotFather e pegar o token;
   - `hermes gateway setup` → escolher Telegram → colar `TELEGRAM_BOT_TOKEN` e o seu user id em allowed users;
   - `hermes gateway restart`;
   - para confirmar: `gateway_state.json` precisa mostrar `platforms.telegram.state == "connected"`. Depois mande uma mensagem ao bot para
     que `channel_directory.json` registre o chat (é esse registro que o `deliver: telegram` / home channel usa).
2. **Worker do cron** (escolha uma opção):
   - (a) corrigir o engine (upstream/update do hermes-agent) para o worker herdar o site-packages do venv; ou
   - (b) autorizar o closer a rodar como timer systemd/crontab do sistema chamando um script do plugin (fora do cron do Hermes).
     Aí a notificação continua dependendo do item 1.

Quando 1 e 2 estiverem resolvidos, os §2–§5 seguem como está no contrato, sem mudança de escopo.

## §2–§5

Não executados. O contrato manda parar no §1 quando não há canal. Não houve nenhuma ação sobre missões, instâncias vast nem o bus.

RESULT: PARADO no §1 — nenhum canal de mensagens conectado (gateway só tem `api_server`). Além disso, o worker externo do cron
está quebrado (`ModuleNotFoundError: ruamel`, reproduzido; nenhum job cron roda hoje). Decisão do operator: conectar um canal
(`hermes gateway setup` + restart) e escolher entre corrigir o worker no engine ou autorizar um timer do sistema. Zero efeitos colaterais.

---

# MUDANÇA DE CONTRATO (28/09, operator: "quero que funcione AQUI no chat") + ADENDO (zero sessão fantasma)

## Resultado do §5: o bus NÃO consegue entrar na sessão viva. PARADO antes de implementar

Sessão supervisor viva: `20260928_040356_c1c339` (source `tui`, sem `ended_at`, lease única em
`runtime/active_sessions.json`: pid 403143 = `tui_gateway.entry`, `live_session_id` 2b2c09f2,
`bot_live_delivery_consumer: true`). Hoje o `state.db` tem 42 sessões.

### Por que o caminho atual do bus não serve

O bus (`/opt/mission-events/event_bus.py:post_to_gateway`) faz `POST /v1/chat/completions` com `X-Hermes-Session-Id`.
No engine (`gateway/platforms/api_server_openai_routes.py:_handle_chat_completions`, linhas ~659-713):
- **id desconhecido → cria sessão nova.** Evidência: `notifybus-test-01` (source `api_server`, 25/09 18:25, 28 msgs)
  e `test-phase23` (26/09) são fantasmas criados exatamente assim. É o anti-exemplo do adendo.
- **id da TUI viva → o gateway carrega o histórico do state.db e roda o turno ELE MESMO, como segundo writer.**
  Não há handoff para a TUI nesse endpoint. A docstring do próprio engine (`api_server.py:_answer_through_live_bot_chat`)
  diz: *"Running the turn here would make this process a second writer beside the lease holder: the open chat never
  shows the message or the reply, its live context never learns of them, and the two transcripts interleave in state.db."*
  Evidência: a sessão supervisor antiga `20260925_012625_73a703` acumulou **2502** linhas `[bus]` "ENTREGUE+PERSISTIDO"
  (1577 no bus.log). Cada uma foi um turno inteiro do gateway sobre ~172k de histórico, invisível para o chat vivo. É o custo/OOM da madrugada.

Conclusão: só trocar o guard por allowlist e reabilitar o subscriber **reencarnaria o bug**. O custo é o mesmo por evento, o operator
não vê nada e a transcrição fica intercalada. O guard, o `subscribers.json` e o `event_bus.py` estão intactos (zero mudança).

### Proposta (a mais barata, nativa do engine): mailbox `bot_live_delivery`

O único caminho do engine que **entra no turno da sessão viva** é o mailbox `tools/bot_live_delivery.py`:
- O bus grava um ticket (arquivo, `runtime/bot_live_delivery/<id>.json`) fixado em `session_id` + `lease_id` + `live_session_id` do dono vivo.
- O poller da própria TUI (`tui_gateway/session_notifications.py:_poll_bot_live_delivery_once`, a cada ≤5s) pega o ticket
  **só no limite idle** (sem turno rodando e sem prompt na fila) e roda como turno normal da sessão viva. O operator vê a
  mensagem e a resposta, e o contexto vivo aprende.
- **Não cria sessão**: `find_canonical_live_owner` devolve `None` se não houver lease viva. Nesse caso o ticket nem é
  admitido e o evento fica só no journal. O `claim` exige casar lease + live id, então outra sessão não rouba o ticket. Receipt at-most-once.
- Não passa pelo gateway HTTP, então não existe segundo writer nem turno cobrado fora do chat.

**Restrição do engine (é a decisão do operator):** o mailbox só serve a sessão cujo título é **"Bot Chat"** (sessão canônica,
`find_canonical_owner` → `get_session_by_title("Bot Chat")`; hoje não existe nenhuma). Para usar, a sessão
`20260928_040356_c1c339` precisa ser renomeada para "Bot Chat". Efeito colateral: DMs de peer (`hermes peer dm`) e
relays do Desktop que miram o Bot Chat também caem nesta sessão (hoje não há nenhum em uso aqui).

Implementação proposta, depois do OK:
1. `event_bus.py`: guard trocado por allowlist. Só o subscriber `supervisor`, com `target_id` fixo `20260928_040356_c1c339`,
   kinds `{mission_stalled, needs_operator, gpu_incident, mission_reopened, pane_lost, budget_alert}`, digest em batch de ≥10min
   (1 entrega por janela, no máximo). Qualquer outro kind (heartbeat/rotina) vai só para o journal. Entrega por um novo
   `deliver_live_mailbox` (subprocess curto no python do Hermes que chama `find_canonical_live_owner` + `deliver_to_live_owner`),
   **nunca** `/v1/chat/completions`. Pré-check duro: o compression tip de "Bot Chat" tem que ser o `target_id` fixo. Se não for, nada é entregue e o evento vai para o journal.
2. Vigília: `closer-madrugada.timer` (systemd, 10min) → script do plugin, com regras a/b/c do contrato original, eventos no spool.
3. Supersessão registrada no RUNBOOK e no `subscribers.json` (data, motivo, custo por entrega = 1 turno).
4. Provas: evento alto-sinal sintético → aparece na sessão viva, com **Δ sessões = 0** (`count(*) from sessions` antes/depois) e
   receipt `settled`. Heartbeat sintético → só journal, sem ticket, Δ = 0.

Alternativa B (pior): assinatura kanban `platform=tui` (o poller também entrega na sessão viva). Exige uma task kanban
sintética por evento. É mais frágil e desvirtua o kanban.

RESULT (adendo): PARADO no §5 antes de implementar. O caminho do bus (`/v1/chat/completions`) cria sessão fantasma para id
desconhecido e roda o turno fora do chat vivo para a sessão viva (evidência: notifybus-test-01, test-phase23, 2502 linhas
[bus] invisíveis em 73a703, docstring do engine). Proposta: mailbox nativo `bot_live_delivery` (entra no turno vivo, Δ sessões = 0
por construção). Requer o OK do operator para renomear a sessão `20260928_040356_c1c339` para "Bot Chat". Nada foi alterado no sistema.
