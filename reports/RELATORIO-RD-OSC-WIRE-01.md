# RELATÓRIO RD-OSC-WIRE-01 — Wiring dos 2 difs do guard OSC no mission-ops

**Data:** 05/10/2026 · **Missão:** RD-OSC-WIRE-01 · **Painel:** w7:p6
**operator_channel:** {"url": "http://127.0.0.1:9119", "expect_status": 200} (dashboard hermes)
**Veredito:** **PASS**

---

## 1. Problema

Dívida herdada do fecho RD-HERDR-OSC-01 (PASS): o guard pty
`/opt/mission-supervisor/osc_guard.py` estava pronto e provado, mas o
mission-ops ainda lançava workers de missão com `claude` cru — workers novos
ficavam expostos à injeção de respostas OSC 4 como teclado (turno perdido).

## 2. Entrega

Os 2 difs da seção 5 do relatório RD-HERDR-OSC-01 aplicados em
`/opt/operator-harness/plugins/mission-ops/` (repo fonte; o espelho runtime
`/root/.hermes` fica por conta do supervisor/operator, como no fluxo de
commits anterior):

1. **`recipes.py` — `claude_launch_cmd` (linha 181):** launch do worker passa a
   ser `cd <cwd> && OSC_GUARD_PANE=${HERDR_PANE_ID:-unknown} python3
   /opt/mission-supervisor/osc_guard.py claude[ --resume <id>]` — o claude
   nasce atrás do guard (filtro pty anti-injeção OSC, com auditoria em
   `/data/audit/pane-writes/osc-injections.jsonl` + espelho
   `/opt/mission-events/osc-injections.jsonl`).
2. **`mission_core.py` — `foreground_agent_name` (linha 545):** carrier do
   guard (`python3` com `osc_guard.py` no cmdline) é classificado como
   `"claude"` — sem isso, todo worker guardado seria lido como `python3`
   (falso shell_fallback / `agent: unknown`); o guard se identifica pela API
   DESIGNED (`pane report-agent --source osc-guard`).

Backups pré-edição (padrão do repo, byte-idênticos conferidos):
`recipes.py.bak-RD-OSC-WIRE-01`, `mission_core.py.bak-RD-OSC-WIRE-01`,
`test_mission_ops.py.bak-RD-OSC-WIRE-01`. Edição por alteração pontual (2 difs
mínimos); nenhum arquivo reescrito integralmente.

**Commit na main:** `ddc850b1f86acb8a9d0f651693b369084896fbdf` ("RD-OSC-WIRE-01:
wiring do osc_guard no mission-ops") — branch `main`, prova em verify.json
(git log). `HERDR_PANE_ID` é o env de runtime do pane (usado pelo próprio
plugin em `__init__.py`), então `OSC_GUARD_PANE` resolve para o pane do worker.

## 3. Provas (todas executadas de verdade nesta sessão)

- **Unit dos 2 difs** — `python3 test_osc_wire_01.py` (novo, 6 testes): launch
  emite guard e preserva `cd`/`--resume`; carrier do guard = `claude`;
  `python3` sem guard segue `python3`; claude direto inalterado; shell vazio
  segue `None`. **PASS (6/6)**.
- **Prova comportamental do wiring (lab isolado, `prova_rd_osc_wire_01.py`,
  método do soak da OSC-01):** worker de teste (claude real) lançado na sessão
  isolada `osc-lab` com o comando GERADO por `claude_launch_cmd` (não ad-hoc);
  `foreground_agent_name` do mission_core contra o lab live = `('claude',
  None)`; 2 rajadas simuladas (16 respostas OSC + 2 fragmentos sem terminador)
  no pane do worker → **ZERO bytes OSC no stdin entregue ao worker** (tee do
  guard) e **4 injeções auditadas**. **PASS**.
- **Lab da OSC-01** — `python3 /opt/mission-supervisor/tests/test_osc_injection.py lab`:
  controle SEM guard vazou (`]4;227;rgb:` no stdin — prova de que o canal
  injeta); com guard, 22 bytes no stdin e ZERO OSC; 4 injeções auditadas.
  **PASS**.
- **Suíte existente do plugin** — `python3 test_mission_ops.py`: **SUITE
  PARALELA: OK em 5.5s (2 shards)**. Única alteração de teste:
  `test_shell_fallback_without_resume_id_starts_fresh` asseria o comando de
  launch antigo literal (`cd /opt/mission-x && claude`) — atualizada ao launch
  com guard (o comportamento novo é exatamente o objeto da missão).
- **Demais suítes do plugin** (39 arquivos `test_*.py`): 37 verdes; 2 vermelhos
  **pré-existentes** (falham no baseline sem minhas mudanças — confirmado via
  `git stash` + re-run): `test_proof_lint03_plugin.py` (2 falhas: timeout
  close 150 != 35; KeyError 'steps') e `test_batch_e2e.py` (exit 1).
- **Ship clause (REPORT-SHIP-02):** commit direto na `main` — `git log main`
  mostra `ddc850b RD-OSC-WIRE-01: wiring do osc_guard no mission-ops`. Nada
  pendente de merge/SHIP.

## 4. Dívidas

- **`recipes.py` linha ~409 (relaunch de `ready_regex_error`) lança `cd <cwd>
  && claude` SEM guard** — caminho pré-existente fora dos 2 difs do contrato;
  não toquei (fidelidade ao escopo). Recomendo migrar esse relaunch para
  `claude_launch_cmd` numa missão futura.
- `test_proof_lint03_plugin.py` e `test_batch_e2e.py` vermelhos pré-existentes
  (baseline, não desta missão).
- A memória de projeto da RD-HERDR-OSC-01
  (`/opt/mission-supervisor/.claude-config/projects/-opt-mission-supervisor/memory/herdr-osc-injection-guard.md`)
  registra "wiring pendente" — editada nesta sessão e **revertida** após
  intervenção do supervisor-watchdog (fora do escopo do contrato); a memória
  desta missão foi gravada só no projeto do mission-ops (abaixo). O texto
  "wiring pendente" lá segue desatualizado até o operator atualizá-lo.

## 5. Custo

**Fórmula (RD-OPS-03-SPEND-01):** `custo = (in×p_in + out×p_out +
cache_read×p_cache)/1e6`, preços do modelo do turno na
`/opt/mission-events/orchestrator-price-table.json` — **z-ai/glm-5.3-flash**:
p_in=0.15, p_out=0.5, p_cache_read=0.03 USD/1M tokens.

**custo não medido: o worker não tem acesso à contagem de tokens da própria
sessão** — não há ledger de spend exposto no estado da missão
(`/opt/mission-supervisor/state/RD-OSC-WIRE-01/`); a coleta de spend é feita
pelo supervisor no close. Nenhum número inventado.

## 6. Memória

Memória gravada (fingerprint md5 `970d3458429268ec`) —
`.claude-config/projects/-opt-operator-harness/memory/osc-wire-guard-ativo.md`
(wiring aplicado + como aplicar em caminhos novos de launch + dívida do
relaunch 409), indexada em `MEMORY.md`.

## 7. Veredito

**PASS** — wiring aplicado e commitado na main, provado por unit (6/6),
lab isolado (controle vazou / guard zerou / injeções auditadas), prova de
wiring live (worker real atrás do launch gerado pelo plugin) e suíte do plugin
verde.