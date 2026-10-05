# MISSÃO RD-SHIPGATE-FIX-01 — Corrigir a 1 falha estável do estágio test do release runner (destrava a SHIP-ENG-MCP-8D9EC634-01)

**Contexto (05/10, SHIP-ENG-MCP-8D9EC634-01):** pipeline oficial (script `/opt/mission-events/ship-8d9ec634-pipeline.sh`, via socket do runner) aborta na etapa test: **1 falha em 1966 (1958 pass), estável em 2 execuções**. Suspeita apontada pelo supervisor: suíte `test/git-push-governed.test.ts` / `test/git-fetch-governed.test.ts` (credential precheck, PLAN, resolução GitHub App). A App está saudável (installation token minted OK, contents:write) e a falha TAMBÉM ocorre no commit de produção `357ad749` — **não é regressão dos commits shippados** (HEAD `8d9ec634`).

**Escopo (worker):**
1. Reproduzir o estágio test NO AMBIENTE DO RUNNER (mesmo env/isolamento do `engineering.release.test`) e identificar com precisão o teste que falha (o stdout do runner trunca em 100KB — capture o log completo no seu env).
2. Causa raiz: env faltante? estado pré-existente? teste dependente de rede/App/tmpdir? Corrigir no lugar certo (código de teste OU setup do runner OU estado) — sem mascarar falha real.
3. Prova: estágio test verde (1966/1966 ou a falha real corrigida) via o MESMO caminho do runner.
4. NÃO executar deploy (isso é da SHIP-ENG-MCP-8D9EC634-01, que retoma o pipeline após o seu PASS).

**Proibido:** retry-until-green; skip de teste sem justificativa tipada no relatório; tocar no container de produção.
**Entrega:** relatório `/opt/mission-events/relatorio-rd-shipgate-fix-01.md` + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
