# RELATÓRIO — missão RD-LOOP-01

**Missão:** RD-LOOP-01 — Guarda-contra de loop e de realidade
**Data:** 05/10/2026 · **Contrato:** `/opt/mission-events/missao-rd-loop-01.md`
**Componente:** mission-ops + orchestrator-consumer + deliver-verify

## Problema (o que quebrou em 05/10)

Incidente do operator: loop de redispatch — **172 promoções / 3 missões ativas**
(RD-DEBT-01 sozinha: 145 `chain_dispatch_accepted`, 96 `dispatch_no_op`, 138
promoções no dia; último attempt **16:37:40Z**, parado sem intervenção externa).
Mecanismo: despacho sem preflight (verify.json solto no cwd compartilhado por
várias missões), EROFS de bind em produção, NameError de constantes nunca
definidas (`subprocess` sem import no consumer), no_op do re-despacho de missão
ativa contado como sucesso a cada varredura, e fila que nunca consumia entradas.

## Entregas (por item do contrato)

### Item 1 — Verify por missão (`/opt/deliver-verify/verify.py` + plugin)
- `resolve_manifest_with_owner` reescrita: canônico `verify-<missionId>.json` em
  `/root/.hermes/mission-state` (DEFAULT_LEDGER_DIR); explicit-arg > state-dir >
  migração read-once-and-move do cwd (owner provado) > verify.json estrangeiro/
  sem owner **ignorado** com warning `cwd_verify_ignored`.
- Manifesto migrado via `shutil.move` + warning `manifest_migrated`; falha de
  move → usa in place (fail-open honesto).
- Plugin: `_resolve_close_manifest` passa `ledger_dir=str(mc.STATE_DIR)`,
  fallback `fallback-state-dir`; `_dv_close_timeout` inclui o state dir;
  `_fresh_verify_manifest` testa canônico primeiro.
- O nome `<missionId>.verify.json` fica reservado ao RELATÓRIO do runner
  (convenção CLOSE-VERIFY-PATH-01) — sem colisão com `verify-<missionId>.json`.
- Migração one-shot: `prova_migration_rd_loop_01.py` (dry-run REAL: **134
  manifestos móveis, 128 conflitos de dono**). Execução real negada pelo
  classifier (mutação de estado compartilhado) → **dívida nomeada**, o preflight
  2a faz o gate dos conflitos enquanto isso.

### Item 2 — Preflight de despacho (plugin + consumer)
- Plugin (`handle_mission_dispatch`, source + runtime sincronizado): (a)
  `VERIFY_CWD_CONFLICT` — verify.json no cwd com dono de missão ATIVA diferente;
  (c) `CWD_NOT_WRITABLE` — inexistente, sem W_OK, ou statvfs `ST_RDONLY`
  (classe EROFS). Recusa tipada via `_err` + `_gate_mark` (spool
  `orch_gate_operator` + evento `dispatch_gate_operator`).
- Consumer: mesmos gates (a/c) + (b) dedupe 12h (`DISPATCH_DEDUPE_12H`,
  fonte = ledger `dispatchedAt/createdAt` + `state.promotions`) ANTES de
  despachar; cwd só é julgado quando o consumer o conhece (payload/ledger) —
  cwd desconhecido é decisão do plugin (INVALID_CWD), gate às cegas bloquearia
  a fila inteira (provado na suíte).
- Anti-spam: mesma entrada + mesmo código não re-marca o gate
  (`state.gatedEntries`); gate resolvido limpa a memória.

### Item 3 — Cap de redispatch
- Máx **2 tentativas/24h** por missão, contando `chain_dispatch_accepted`
  (inclusive tentativas que caem em no_op) — snapshot ANTES do append da
  tentativa corrente (não se auto-envenena). Acima → `DISPATCH_CAP_EXCEEDED` +
  gate-operator. Liberação: payload `operatorOrder` não vazio.
- Aplica a TODOS os caminhos do plugin, inclusive o no_op de missão ativa —
  exatamente o loop vivo de 05/10.

### Item 4 — Detector de loop + auto-corte (consumer)
- `promoções/15min ÷ ledgers ativos > 3` (janela 15min) → para de promover,
  grava finding **`dispatch_loop_detected`** no bus, exige intervenção.
- Liberação: `python3 orchestrator-consumer.py reset-loop-breaker` (só
  operator; registra `orch_loop_breaker_reset` no bus).
- Correções estruturais no `consume_queue`: fila **consome de verdade**
  (reescrita por fingerprint id+enqueuedAt+payload, preservando entradas novas
  chegadas durante a varredura); requeue substitui a entrada em vez de
  duplicá-la; no_op → skipped `already_dispatched` (não é promoção);
  `dispatch_mission` parseia o JSON tipado do plugin (gate/no_op deixam de ser
  `{ok: True}` às cegas); erros tipados de gate do plugin → gated (sem requeue/
  dead-letter); NameError corrigido (`import subprocess` no topo — classe do
  incidente).

### Item 5 — Soak de realidade (shadow)
- `python3 orchestrator-consumer.py shadow`: varreduras só decidindo, decisões
  em `/opt/mission-events/orchestrator-consumer.shadow.jsonl`; **nunca
  despacha, nunca muta produção** (deep-copy do estado; fila intacta; provado
  na suíte).
- Soak executado: iniciado 14:07 (local), `timeout 7200`. Resultado da análise
  (`prova_soak_rd_loop_01.py`, invariantes I1–I4): **SOAK: SEM DIVERGÊNCIA**
  (10.242 decisões; números finais na seção "Resultado final do soak" abaixo).
- Decisões observadas durante o soak: entradas RD-DEBT-01 → gate
  `DISPATCH_DEDUPE_12H` (promovida 16:37:40Z < 12h) — exatamente o que cortaria
  o loop de hoje.
- Regra de infra gravada: `/opt/operator-harness/CLAUDE.md` (criado — não
  existia) — toda mudança de infra de despacho exige shadow ≥2h + suíte de
  realidade antes de go-live; divergência = blocking finding.

### Item 6 — Suíte de realidade
- `test_rd_loop_01.py`: **23 testes, OK** — classes reais do incidente: fila
  re-lida eternamente (entradas que não saem), no_op contado como sucesso,
  requeue que duplica, verify.json compartilhado com dono ativo, bind RO
  sombreado (statvfs mock), payload sem prompt/promptFile/contractFile,
  `contractFile` sozinho, stdout tipado do plugin, NameError de import
  ausente, espelho ACTIVE_STATUSES sincronizado, shadow imune.
- Suíte do plugin `test_mission_ops.py`: **89 testes, SUITE PARALELA OK (2
  shards, 5,2s)**; `test_close_verify_path.py`: **9/9 OK**; smoke do consumer
  (`prova_consumer_smoke_rd_loop_01.py`): **9/9 OK**.

### Runtime sincronizado (corte do loop vivo em produção)
- Backup ANTES (REGRA DE BACKUP): `/root/.hermes/plugins/mission-ops/__init__.py.bak-RD-LOOP-01`
  (194.341 bytes, md5 conferido igual ao pré-edit).
- Porte PONTUAL (nunca arquivo inteiro) das regiões RD-LOOP-01: gates de
  despacho (preflight/cap/dedupe) + item 1 (close/verify state-dir) no runtime
  que o daemon eng-mcp executa (`missionOps.ts callHandler` →
  `handle_mission_dispatch`). O daemon continua ciclando, mas toda tentativa
  acima do cap agora devolve erro tipado → sem pane, sem prompt, sem no_op
  "promovido".
- **Não portado** (trabalho em voo de outras missões, fora do escopo):
  RD-DEBT-01 (mission_debts) e RD-OBEY-02 (obey_registry) permanecem só no
  source.

### Registrado para o operator (watchdog de escopo)
Mid-turn o mission-supervisor marcou DESVIO DE ESCOPO por eu editar
`/opt/mission-events/orchestrator-consumer.py`. **Não era engano**: o contrato
cita `orchestrator-consumer` como componente (linha 5) e os itens 2, 4 e 5
exigem mudanças nele ("no consumer", "versão nova do consumer"). Registro
feito conforme a própria instrução do watchdog ("se o contrato realmente
exige isso, registre no relatório e siga").

### Achados novos (fora do escopo direto, para o operator)
- Estado do daemon eng-mcp (`/tmp/orchestrator-consumer.daemon.state.json`):
  **59,9 MB** — algo sem cap cresce ali (promotedIds tem cap 200; suspeita:
  outra estrutura). Dívida nomeada (eng-mcp é caminho vivo; mudança exige o
  soak do item 5 primeiro).
- Dedupe do daemon vive em `os.tmpdir()` (morre em reboot/cleanup de tmp) —
  fragilidade de dedupe no caminho vivo; coberta pelos gates do plugin em
  produção.

## Memória
memória gravada (fingerprint `rd-loop-01-guards`, `soak-de-realidade-regra`
indexados no MEMORY.md do harness).

## Dívidas nomeadas
1. **manifest-migration-sweep-pending-operator** — 134 manifestos móveis +
   128 conflitos; `prova_migration_rd_loop_01.py` pronto (dry-run provado);
   execução real precisa de ordem do operator (classifier nega auto).
2. **eng-mcp-daemon-state-bloat** — 59,9 MB no estado do daemon; investigar
   estrutura sem cap; mudança no caminho vivo exige soak (regra do CLAUDE.md).
3. **eng-mcp-no_op-promoted-no-caminho-vivo** — o daemon conta
   `dispatchResult.ok` (inclui no_op) como promoção e dedupe em tmpdir;
   mitigado pelos gates do plugin, correção estrutural fica para missão
   própria com soak.

## Resultado
- Itens 1–6 entregues; consumer permanece **OFF** (proibição respeitada:
  `orchestrator-consumer.service` disabled+inactive durante toda a missão).
- operator_channel: despacho da missão no canal real (pane `w7:pC`); resumo
  final devolvido no mesmo pane; validação de verificação é do supervisor.

- **Resultado final do soak (16:07 local, `prova_soak_rd_loop_01.py`)**:
  **SOAK: SEM DIVERGÊNCIA** — **10.242 decisões** registradas em janela de
  119,0 min de decisões (processo vivo 120,0 min: lançamento 17:07:20Z,
  corte `timeout 7200` às 19:07:20Z, última varredura 19:06:20Z — a decisão
  pode terminar até `INTERVAL`=60s antes do corte, tolerância declarada na
  própria invariante I4). Invariantes I1 (shadow-only, nenhuma mutação em
  produção), I2 (nenhum `would_dispatch` para missão promovida < 12h — as
  entradas RD-DEBT-01 receberam gate `DISPATCH_DEDUPE_12H` durante todo o
  soak), I3 (breaker calibrado, nenhum acionamento simulado) — **zero
  divergências**. Fila de produção intacta (95 entradas antes e depois);
  `orchestrator-consumer.service` disabled+inactive o tempo todo.

### Prova viva do item 1 (14:36 local)
Runner real executado com o manifesto em cwd: `verify-RD-LOOP-01.json` foi
**migrado** para `/root/.hermes/mission-state/verify-RD-LOOP-01.json` e o owner
check passou com `resolved_by: "state-dir"`. Único check vermelho na corrida:
o do soak (invariante I4, duração 31 min < 120 min) — vermelho honesto que
vira verde no fecho.

## Custo
- Medição real por parse do `usage` no transcript da sessão
  (`prova_custo_rd_loop_01.py`, 459 msgs com usage no fecho):
  **input 3.394.473 tok · output 337.844 tok · cache_read 41.176.064 tok**
  (cache_creation 0).
- Preços (`/opt/mission-events/orchestrator-price-table.json`,
  `z-ai/glm-5.3-flash`: in 0,15 / out 0,50 / cache_read 0,03 USD por 1M):
  **custo = (in×p_in + out×p_out + cache_read×p_cache)/1e6 =
  (3.394.473×0,15 + 337.844×0,50 + 41.176.064×0,03)/1e6 = USD 1,9134**
  (fórmula declarada; medição real via `prova_custo_rd_loop_01.py`).