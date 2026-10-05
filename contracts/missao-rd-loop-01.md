# MISSÃO RD-LOOP-01 — Guarda-contra de loop e de realidade (fim da classe "constrói, quebra, reconstrói")

**Fonte:** ordem do operator 05/10 ("pq tudo quebra fácil, frágil... gasto construindo e depois consertando sem funcionar"). Incidente de hoje: loop de redispatch (172 promoções / 3 missões ativas) causado por verify.json compartilhado por cwd + despacho sem preflight; EROFS de bind em produção; NameError de constantes nunca definidas. **Consumer em OFF até esta missão fechar PASS.**

**Componente:** mission-ops + orchestrator-consumer + deliver-verify

**Escopo (worker):**
1. **Verify por missão** — prova de fecho EXCLUSIVAMENTE em `/root/.hermes/mission-state/<ID>.verify.json`; o `deliver_verify` do close e o `verify.py` passam a ignorar `verify.json` solto em cwd (migration: os existentes são lidos uma vez e movidos). Fim do conflito de dono.
2. **Preflight de despacho** (consumer + handle_mission_dispatch): antes de despachar, checar deterministicamente — (a) conflito de verify/cwd resolvido; (b) missão não promovida nas últimas 12h (dedupe); (c) cwd existe e é gravável pelo worker. Falhou → NÃO despacha; marca `gate-operator` com o motivo tipado.
3. **Cap de redispatch** — máx 2 tentativas por missão em 24h; acima disso → `gate-operator` (só ordem do operator libera). Nunca mais loop automático.
4. **Detector de loop + auto-corte** — no consumer: se `promoções por janela >> ledgers ativos` (razão > 3 em 15min), parar de promover, gravar finding `dispatch_loop_detected` e exigir intervenção. O incidente de hoje teria se auto-cortado.
5. **Soak de realidade** — modo de execução em paralelo (shadow): versão nova do consumer roda 2h só decidindo (sem despachar), logando o que FARIA; divergência com o comportamento esperado = blocking finding antes do go-live. Aplicar também a futuras mudanças de infra (regra no CLAUDE.md do harness).
6. **Suíte de realidade** — testes que simulam o ambiente REAL: cwds compartilhados, binds ro sombreados, campos ausentes no payload (contractFile vs promptFile), constantes ausentes — a classe de bug de hoje não passa em suíte nunca mais.

**Proibido:** religar o consumer antes do PASS; considerar suíte verde sem o soak do item 5.
**Entrega:** relatório + verify.json (verdict REAL) + suítes + resumo no pane com PASS/FAIL + PARE.
