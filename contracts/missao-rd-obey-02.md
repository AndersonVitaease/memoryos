# MISSÃO RD-OBEY-02 — OBEY-HARNESS: obediência do supervisor por MECANISMO (não por memória)

**Fonte:** ordem do operator 05/10 ("proponha um desenho via missão herdr onde eu consiga fazer com que vc me obedeça... preciso que esse harness seja eficiente"). Antecedente: SUP-OBEY-01 criou `obrigacoes-operator.md` versionado (fonte única) — mas a injeção no boot é texto; o supervisor falha em cumprir (compressão de contexto). Obrigação violada repetidamente = dor operacional.

**Problema central:** obediência gravada na memória/sessão do supervisor morre com compressão. Obediência tem que viver em mecanismo: gates que recusam, watchdogs que alertam, violação que vira missão automática.

**Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/`) + bus (`/opt/mission-events/spool.jsonl`)

**Escopo (worker) — zero LLM no caminho rápido, regex/regra pura:**
1. **Registry de obrigações** — `obligations-operator.md` permanece fonte única; o plugin parseia as ordens numeradas (O1, O2, …) num registry em memória do processo + hash de versão (`obligationsHash`).
2. **Gates de aplicação** — as tools mutantes (mission_close, mission_dispatch, orchestrate) consultam o registry: violação clara de ordem → warning tipado `violates-obligation-<id>` na resposta (fail-open: nunca bloqueia operação, SEMPRE marca). Ex.: close sem `chatIntegra` preenchido → marca violação de O1.
3. **SUP-ACK no boot** — ao carregar o plugin, gravar no bus um evento `sup_ack {orders: [ids], hash}`; watchdog (mission_watcher já existe) compara hash: ordem nova desde o último ack = finding `obligation_stale` até novo ack.
4. **Violação → missão automática** — findings `violates-obligation` alimentam o `mission_debt` (DEBT-SWEEP-01): dívida tipada `obedience`, prio 1, intent na fila AUTOMATICAMENTE (missão de correção com o texto da ordem violada). O supervisor desobedecendo gera a própria correção na fila — o operator nunca mais repete ordem.
5. **Score de obediência** — `mission_debt`/bus estatística: % closes com chatIntegra, % ordens cumpridas por janela (hoje/7d), violações por ordem (O1: 3, O2: 0, …). Superfície: `mission_obey action=score` (read-only) — dado pronto para o painel do operator.
6. **E2E do operator como aceite:** forçar uma violação (close sem resumo) → finding tipado → dívida P1 na fila → score desce → correção automática. E o caminho feliz: sessão nova com ack + zero violação = score 100%.

**Proibido:** bloquear operação por obediência (fail-open); LLM no caminho rápido; apagar ordens sem ordem do operator.
**Entrega:** relatório + verify.json (verdict REAL) + suítes + resumo no pane com PASS/FAIL + PARE.
