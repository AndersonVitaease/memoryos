# Relatório — NOTIFY-ROBUST-01

**Missão:** Notificação estrutural missão→supervisor via hooks claude-code + bus de eventos com entrega verificada (tier-1 persistência, tier-2 semântica Jev, tier-3 frontier).
**Data:** 2026-09-25 · **Resultado:** CONCLUÍDA (provas P1–P6, E2E real com operador assistindo, checklist do supervisor fechado 3/3).

## 1. O que foi entregue

### Pipeline (substitui screen-scraping)
```
hooks claude-code (Stop/Notification/SessionStart, .claude/settings.json do projeto eng-mcp)
  → .claude/hooks/notify-hook.mjs (append-only no spool, timeout 5s, jamais muta missão; exit 0 sempre — P5)
    → /opt/mission-events/spool.jsonl
      → event_bus.py (systemd mission-event-bus.service)
        → POST gateway Hermes (stream=false)
          → tier 1: verify_persisted (SQL read-only no state.db) — delivered SÓ com persistência
          → tier 2: jev_ack.py (Jev typesafe/jev-1.13, ≤10s, fail-open) — delivered/acknowledged/supervisor_acted
          → re-alerta se silente ≥600s (máx 2), resolved por 24h no ack
```

### ADENDO 1 — tecido genérico
- Schema `{id, ts, source, kind, subject:{type,id}, payload}` com `source: 'claude-hook'|'hermes-gateway'` — o gateway Hermes pode produzir amanhã no MESMO spool, zero mudança no core.
- Subscriber-as-data: consumidor = 1 entrada em `subscribers.json` (`supervisor` ativo; `notifybus-test` desabilitado após P6). **Adicionar consumidor = 1 linha de config, zero código** (RUNBOOK §Arquitetura genérica).
- Adicionar missão nova = zero config (hooks genéricos).

### ADENDO 2 — 3 andares
- **Tier 1** (determinístico): SQL no state.db; HTTP 200 ≠ entregue.
- **Tier 2** (`jev_ack.py`, módulo separado): Jev ≤10s fail-open; custo medido ~$5.5e-05/verificação, contabilizado em `stats.ev_usage` (136 calls, 63k+5.8k tokens).
- **Tier 3**: frontier só em disputa (juiz tria/explica, nunca decide).

### Redução do watcher (transição)
`/opt/mission-watcher/watcher.py` reduzido a **pane_lost-only** (topologia): removedas recipes/WATCH_PATTERNS/classify_text/leitura de pane. Startup log `mode=pane_lost-only [NOTIFY-ROBUST-01]`, ciclo verde (missions=4, new_events=0). Detectores de conteúdo agora são os hooks.

### Permissão `.claude/` permanente (pedido do operador)
`settings.json` do projeto concede a si mesma `Edit/Write/Read .claude/**` (4 travamentos hoje motivaram o pedido). Documentado no RUNBOOK.

### RUNBOOK
`/opt/mission-events/RUNBOOK.md` (130 linhas): arquitetura, ADENDO 1/2, componentes, provas, operação, permissão `.claude/`, 12 lições, re-alerta, purge, transição do screen-scraping.

## 2. Provas

| Prova | Resultado |
|---|---|
| P1 | hook→spool→bus→POST→persistido no state.db; Δ=1.42s; tier-2 resolved |
| P2 | permission_request entregue, supervisor_acted=true (0.93) |
| P3 | SIGKILL do bus → catch-up entrega 1x exato |
| P4 | catch-up SEM duplicar — re-provado no real (backlog 6 eventos 1x cada) |
| P5 | claude exit 0 com spool sabotado |
| P6 | unit test 14/14 PASS (4 branches re-alerta/ack; E2E-via-gateway com sessão fantasma impossível — supervisor vivo) |

**E2E real (operador assistindo):** evt-7f6a54a3e9 (turn_done real do hook Stop) → spool → bus → POST → persistiu (tier 1) → ack acted(0.98) (tier 2). Estado final: 69 deliveries, **todas delivered, 1 tentativa cada pós-fix**, re_alerts=0, zero duplicata nova (repetições visíveis = cópias históricas pré-fix 18:33–18:34 UTC).

**Checklist do supervisor 3/3:** (1) spool_offset 13962 = fim do spool; (2) notifybus-test enabled=false; (3) re-ligar validado — backlog 1x cada, digest fechado com "já persistido (re-POST evitado)", zero POST novo.

## 3. Bugs de produção corrigidos (com lições no RUNBOOK)

1. **Digest sem marcador** → verify LIKE nunca casava → re-POST infinito. Fix: marcador `dgt-…` na linha + campo `verify_marker` (override p/ jobs herdados) + backoff 180 no verify-exhausted.
2. **POST stream=false com sessão ocupada** enfileira e persiste só no fim do turno → timeout virava cópia + re-POST multiplicava. Fix: `timeout_backoff_s: 180` + guard anti-duplicata (attempts>0 → verify antes de re-POST).
3. **"POST 200 mas não persistiu"** — mesmo padrão, mesmo backoff; guard fecha sem re-POST quando a cópia persiste.
4. **Âncora SQL** = `timestamp` da linha role='user' (não posted_at, ~3s depois).
5. **Credencial openrouter-judge com prefixo duplicado** (`sk-or-sk-or-v1-…`) → substring via regex `sk-or-v1-[A-Za-z0-9]{20,}`.

## 4. Arquivos

**Pipeline (produção, fora do repo):** `/opt/mission-events/{event_bus.py, jev_ack.py, config.json, subscribers.json, bus-state.json, spool.jsonl, bus.log, RUNBOOK.md}`; `/opt/mission-watcher/watcher.py`; `/etc/systemd/system/{mission-event-bus,mission-watcher}.service`; `/opt/memoryos/eng-mcp/.claude/{settings.json, hooks/notify-hook.mjs}`.

**Repo (commit):** `evidence/notify-robust-01/` (cópia de event_bus.py, jev_ack.py, config.json, subscribers.json, RUNBOOK.md, notify-hook.mjs, watcher.py, p6_unit_test.py), `missao-notify-robust-01.md`, este relatório.

## 5. Verificação

- Tier-1/tier-2 validados ao vivo (log do bus: "ENTREGUE+PERSISTIDO … (1 tentativas)" + "ack positivo …" em sequência).
- `engineering.judge.verify` 2 rodadas (claims × artefatos) — ver FINGERPRINT no memory.capture.
- Testes P6 determinísticos 14/14.

## 6. Limites / próxima fronteira

- E2E do re-alerta (P6) via gateway real com sessão fantasma não é possível com o supervisor vivo (seria auto-engano); o unit test 14/14 cobre os branches.
- Produtor hermes-gateway é slot declarado no schema, não implementado (nada produz por ele hoje).
- Watcher aposentável por decisão de produto (hooks + bus já cobrem tudo).
