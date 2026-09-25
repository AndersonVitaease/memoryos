# RUNBOOK — Mission Events (NOTIFY-ROBUST-01)

Atualizado: 2026-09-25

## O que é

Pipeline estrutural de notificação que substitui o screen-scraping do mission-watcher por hooks do claude-code + bus de eventos com entrega **verificada** ao supervisor Hermes:

```
claude-code hooks (Stop / Notification / SessionStart)
  → notify-hook.mjs (append no spool, timeout 5s, nunca muta missão)
    → /opt/mission-events/spool.jsonl          (append-only, fonte da verdade)
      → event_bus.py (systemd mission-event-bus.service)
        → POST gateway Hermes (stream=false)
          → state.db persiste a linha           ← tier 1: delivered SÓ com persistência
        → verify_persisted (SQL no state.db)    ← tier 1 determinístico
        → jev_ack (Jev, ≤10s, fail-open)        ← tier 2 semântico (ack/silêncio/re-alerta)
        → re-alerta se silente ≥ re_alert_after_s (máx 2)
```

## Arquitetura genérica (ADENDO 1)

Schema de evento: `{id, ts, source: 'claude-hook'|'hermes-gateway', kind, subject: {type: 'mission'|'agent-session', id}, payload}`.
O produtor de hoje são os hooks claude. O produtor de amanhã é o lifecycle do gateway
Hermes (turn leases, state.db) — escreve no MESMO spool; o bus entrega do mesmo jeito.
Nada no core muda.

Subscriber-as-data: cada consumidor é 1 entrada em `subscribers.json`
(`{name, enabled, channel, target_id, filters}` — filters vazio = recebe tudo).
O portal Wooba assina o MESMO bus amanhã.

**Adicionar consumidor novo = 1 linha de config, zero código.**
**Adicionar missão nova = ZERO config** — os hooks são genéricos (lêem pane/tab do env,
identificam a missão pelo ledger); nenhuma config por missão.

## Componentes

| Componente | Papel |
|---|---|
| `.claude/settings.json` (projeto eng-mcp) | hooks Stop/Notification/SessionStart → notify-hook.mjs |
| `/opt/memoryos/eng-mcp/.claude/hooks/notify-hook.mjs` | produtor: append no spool, timeout 5s, jamais muta missão |
| `/opt/mission-events/spool.jsonl` | append-only; TTL 24h; dedupe por id |
| `/opt/mission-events/event_bus.py` | bus: consome spool, POST, verify tier-1, ack_pass tier-2 (systemd `mission-event-bus.service`) |
| `/opt/mission-events/jev_ack.py` | tier-2 (Jev ≤10s, fail-open); CLI de teste: `python3 jev_ack.py <ev_id> "<linha>" <session> <ts_epoch>` |
| `/opt/mission-events/bus-state.json` | spool_offset, processed_ids, deliveries, stats (re_alerts, ev_usage) |
| `/opt/mission-events/config.json` | tunables; hot-reload a cada ciclo (`timeout_backoff_s: 180`) |
| `/opt/mission-events/subscribers.json` | consumidor(es) — subscriber-as-data |
| `/opt/mission-watcher/watcher.py` | LEGADO reduzido a `pane_lost-only` (topologia; detectores de conteúdo = hooks) |
| `/tmp/p6_unit_test.py` | P6 determinístico: 4 branches de re-alerta/ack, 14/14 PASS (stubs ack_check/enqueue) |

## Verificação em 3 andares (ADENDO 2)

- **Tier 1 — persistência determinística**: `verify_persisted` faz SQL read-only no
  state.db procurando o marcador do evento na sessão-alvo. Delivered só quando
  persistiu. HTTP 200 ≠ entregue.
- **Tier 2 — verificação semântica (Jev)**: `jev_ack.py` lê o contexto da sessão-alvo
  e pergunta ao Jev (`typesafe/jev-1.13`, endpoint decisions, mesmo contrato do judge):
  delivered? acknowledged? supervisor_acted? Timeout ≤10s, **fail-open**: Jev falhou →
  tier-1 persistido conta como entregue. delivered=true sem ack por ≥600s → re-alerta
  (máx 2). Custo ~$5.5e-05/verificação, contabilizado em `stats.ev_usage`.
- **Tier 3 — frontier SO em disputa** (não automatizado): humano decide; o juiz tria e
  explica, nunca decide.

## Provas

| Prova | O que valida |
|---|---|
| P1 | hook → spool → bus → POST → persistiu no state.db (Δ=1.42s, tier-2 resolved) |
| P2 | permission_request entregue com supervisor_acted=true |
| P3 | SIGKILL do bus → catch-up entrega 1x exato |
| P4 | catch-up re-entrega SEM duplicar (re-provado no real: backlog 1x cada, zero duplicata) |
| P5 | claude exit 0 com spool sabotado (hook não quebra claude) |
| P6 | 4 branches de re-alerta/ack (unit test 14/14; E2E-via-gateway com sessão fantasma impossível com supervisor vivo) |

## Operação

- `systemctl start|stop|restart mission-event-bus` (e `mission-watcher` para o legado)
- Estado do bus: `python3 -c "import json;s=json.load(open('/opt/mission-events/bus-state.json'));print(s['spool_offset'],s['stats'])"`
- Logs do bus: `/opt/mission-events/bus.log` (append direto)
- Heartbeat do watcher: `/opt/mission-watcher/state/heartbeat.json`
- Tier-2 CLI: `python3 /opt/mission-events/jev_ack.py <ev_id> "<linha>" <session> <ts_epoch>`

## Permissão `.claude/` permanente (pedido do operador)

Editar hooks em `.claude/` sem permissão causou 4 travamentos nesta sessão. O
`settings.json` do projeto eng-mcp agora concede a si mesmo `Edit/Write/Read` sobre
`.claude/**` — permissão permanente; sessões futuras não precisam pedir.

## Lições (não repetir)

1. **Âncora SQL = `timestamp` da linha role='user' no state.db, NUNCA posted_at** (fica ~3s depois e exclui a própria linha → falso "delivered=no").
2. **Credencial com prefixo duplicado**: `openrouter-judge` contém `sk-or-sk-or-v1-…`; a chave válida é a substring `sk-or-v1-…`. Regex: `sk-or-v1-[A-Za-z0-9]{20,}`. Enviar a string inteira dá 401.
3. **`pgrep -f` casa a PRÓPRIA shell** — para kill seguro do bus: `systemctl show -p MainPID mission-event-bus`.
4. **Buffering**: `bus.stdout.log` 0 bytes = buffering; logs reais em `bus.log`.
5. **POST stream=false com sessão ocupada ENFILEIRA e persiste só no fim do turno** → timeout vira cópia enfileirada; re-POST curto multiplica cópias. Fix: `timeout_backoff_s: 180` + guard anti-duplicata (attempts>0 → verify_persisted antes de re-POST).
6. **"POST 200 mas não persistiu" segue o MESMO padrão** — cópia enfileirada; mesmo backoff 180; o guard fecha sem re-POST quando a cópia persiste.
7. **Linha de evento/digest DEVE conter seu marcador** (`evt-…`/`dgt-…`) — o verify SQL é LIKE; sem marcador na linha o verify nunca casa → loop de re-POST. **Campo `verify_marker`** = override do marcador para jobs herdados (reconhece cópias já enfileiradas e fecha sem novo POST).
8. **2 ocorrências do marcador no state.db ≠ duplicata** — checar role/timestamp (linha do evento + assistant citando o id é fluxo normal).
9. **Monitor com until-loop** para esperar condições; Bash com `sleep N && cmd` é bloqueado pelo harness.
10. **Hook PostToolUseFailure é informativo** (classe/confiança da falha do último tool call), não é comando — não reenviar call negado.
11. **Watcher reduzido a pane_lost-only** — não re-adicionar patterns no watcher (seria recriar o screen-scraping que a missão removeu); detectores de conteúdo = hooks claude.
12. **Acentos em string literals TS quebram o build Vite** — sinais de matching em ASCII puro + NFD na entrada (regra geral do projeto).

## Re-alerta (tier 2)

- delivered=true, acknowledged=false ≥ `re_alert_after_s` (600s) → re-alerta: key
  `"{key}-re{N}"`, id `"{id}-r{N}"`, linha `"⚠ RE-ALERTA (N/max) — sem acuse há Xmin: <linha>"`,
  máx `re_alert_max` (2). acknowledged → resolved (re-checagem só após 24h).
- Custo: `stats.ev_usage` (prompt/completion/calls).

## Rotação/purge

- Durable trail do watcher: purge >7d de eventos notificados.
- Bus-state: `prune_delivered_keep: 500`, `event_ttl_s: 86400`.

## Prova E2E final (com operador assistindo nesta sessão)

evt-7f6a54a3e9 (turn_done real do hook Stop) → spool → bus → POST → persistiu no
state.db (tier 1, SQL) → tier-2 ack resolved. Zero duplicata nova desde a correção
(repetições visíveis são cópias históricas pré-fix de 18:33–18:34 UTC). Checklist do
supervisor fechado 3/3: spool_offset no fim do spool; notifybus-test disabled;
re-ligar validado com backlog 1x cada e digest fechado sem novo POST.

## Transição do screen-scraping (concluída)

`/opt/mission-watcher/watcher.py` não lê mais texto de pane nem classifica padrões
(`mode=pane_lost-only`). Sobrou só a vigilância de topologia (a pane da missão ainda
existe?). Detecção de conteúdo (erros de API, idle timeout, padrões) agora é
responsabilidade dos hooks estruturais. Se o watcher for aposentado, os hooks + bus
continuam cobrindo tudo — aposentar o watcher é decisão de produto futura.
