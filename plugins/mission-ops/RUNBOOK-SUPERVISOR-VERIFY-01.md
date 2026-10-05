# RUNBOOK — Verificação de entrega + operator_channel (SUPERVISOR-VERIFY-01 / DELIVER-VERIFY-01)

Como provar que uma missão do supervisor está pronta **na mão de quem pediu** — sem LLM, sem confiar no "relatório bonito".

## 1. Regra de ouro

> **Pronto só é pronto quando funciona no canal real do operator.** Motor provado no canal interno do supervisor ≠ pronto (âncora: photopea 25/09 — operator levou 403 no canal real).

## 2. Declarar o canal no dispatch

```json
mission_dispatch({
  "missionId": "minha-missao-01",
  "cwd": "/opt/...",
  "promptFile": "/opt/.../prompt.md",
  "operatorChannel": "https://meu-app.exemplo.com/"          // ou:
  "operatorChannel": { "url": "https://meu-app.exemplo.com/", "expect_status": 200 }
})
```

O campo é opcional, mas **recomendado**. Sem ele, o `mission_close` fecha com `closeWarning`.

## 3. O que acontece no mission_close

1. **Passo 0 (DELIVER-VERIFY):** se `verify.json` existe no cwd da missão → roda `/opt/deliver-verify/verify.py`. Vermelho → missão **reaberta** (`deliver_verify_red` no spool), fechamento recusado.
2. **Passo 0.5 (operator_channel):** canal declarado → `run_channel_proof()` (curl GET, max 10s). Canal morto (`HTTP 0`/5xx) → missão reaberta (`status: "interrupted"`), nudge no pane do claude, evento `operator_channel_red` no spool, resposta `ok:false` + `reopenedByOperatorChannel: true`. Canal vivo → passo `operator_channel_proof ok:true` e fechamento prossegue (exit → tab_close → worktree_remove → ledger `closed`).
3. Sem canal: fechamento segue com `closeWarning` "fechada SEM operator_channel declarado".

## 4. Verificar uma entrega sem fechar: `mission_verify`

```json
mission_verify({ "missionId": "minha-missao-01" })
```

Resolução de manifesto: `--manifest` explícito > `verify.json` no cwd da missão > bateria **inferida** pelo tipo de entrega (`service` → relatório → código → web → arquivo → `inconclusivo`).

## 5. Escrever um `verify.json`

Cada chave é um tipo de prova; cada valor, lista de specs. Tipos: `http`, `pixels`, `ocr`, `cmd`, `file`, `service`, `bus`. Exemplo completo funcional: `/opt/deliver-verify/examples/verify.example.json`.

```json
{
  "http":    [{ "id": "canal", "url": "https://app/", "expect_status": 200 }],
  "cmd":     [{ "id": "e2e", "run": "curl -s https://app/ | grep -q ok", "expect_exit": 0 }],
  "service": [{ "id": "unit", "unit": "foo.service", "expect": "active", "expect_enabled": true }],
  "bus":     [{ "id": "spool", "event_kind": "session_start", "since_minutes": 60 }]
}
```

Lições embutidas nos tipos: `pixels` exige pixels não-brancos na região (texto-branco-em-fundo-branco); `ocr` usa tesseract `por+eng` com matching NFD+casefold (acento não falha); `file` de imagem também exige pixels não-vazios; `basic_auth.password_env` lê a senha **só do env** — nunca escrever senha em arquivo.

## 6. Saída do runner

```json
{ "missionId": "...", "source": "manifest|inferred:<tipo>", "verdict": "pass|fail",
  "llm_calls": 0, "checks": [{ "id": "P1-http-1", "type": "http", "ok": true, "evidence": {...} }],
  "ts": "...", "durationMs": 392 }
```

Exit: 0 = pass, 2 = fail, 1 = uso errado. Cap anti-crash de 10KB por prova.

## 7. Código (manutenção)

- `verify_gate.py` — primitivos: `run_channel_proof`, `run_verify`, `emit_bus_event`. A **lógica do gate vive inline em `__init__.py`** (passos 0/0.5 do `handle_mission_close`) — não existe `gate_before_close` (trim: era dead code).
- Testes: `cd /root/.hermes/plugins/mission-ops && python3 test_mission_ops.py` (unittest; hoje 69 testes).
- Runner: `/opt/deliver-verify/verify.py` (compartilhado com DELIVER-VERIFY-01 — **dedupe > duplicação**; se for mexer, confira os testes dos dois lados).

## 8. Armadilhas conhecidas

- `deliver_prompt` retorna `Tuple[bool, Optional[str]]` — **nunca** walrus-capture (`if err := f(...)` captura a tupla, sempre truthy). Unpack.
- Cwd não-confiável no dispatch → claude para na tela de trust (READY_REGEX_ERROR); use cwd já confiável (ex.: `/opt/memoryos/eng-mcp`).
- Teste com `code: 'teste'` falso só prova que a function responde — credenciais/estado real só se revelam num fluxo real.