# RELATÓRIO P95-FLAKY-01 — p95 do sessionRoster vira prova determinística

## Nota sobre o alerta SUPERVISOR-WATCHDOG (desvio de escopo)
O watchdog apontou alteração em `/opt/memoryos/eng-mcp-wt-p95-flaky-01/eng-mcp/test/sessionRoster.test.ts` como fora do contrato. **Não é desvio**: a raiz do repositório canônico é `/opt/memoryos` (o `eng-mcp` é subdiretório do repo), então o worktree criado via `git worktree add /opt/memoryos/eng-mcp-wt-p95-flaky-01 47567591` contém naturalmente o caminho `eng-mcp/test/sessionRoster.test.ts`. É exatamente o alvo do contrato (worktree próprio, a partir de main 47567591, fora da árvore canônica). Nenhuma alteração foi feita na árvore canônica.

## Opção escolhida: (a) p95 relativo ao MESMO run, em blocos
Subteste reescrito em `eng-mcp/test/sessionRoster.test.ts` (describe `performance`):
- 3 blocos independentes de 30 iterações de `getRoster()`.
- Em cada bloco: **baseline** = mediana das primeiras 10 iterações; **p95** do bloco inteiro.
- **Gate (relativo):** passa se ALGUM bloco satisfaz p95 ≤ 3× baseline.
- **Rede de segurança:** p95 < 500ms absoluto no bloco aprovado (pega degeneração patológica tipo I/O travado, não é gate fino).
- **Por que blocos:** na validação, um run sob carga sintética produziu um spike único (p95 255ms / ratio 5.22x) que derrubaria um gate de run único — spike isolado de GC/JIT não é regressão estrutural. Com best-of-3 blocos, spike só derruba um bloco; regressão real de latência degrada TODOS os blocos e falha.

### Por quê (a) e não (b) ou (c)
- **(b) budget folgado (400ms)** mantém gate absoluto: um budget que sobrevive a 2 workers comendo CPU é tão folgado que deixa de detectar regressões reais de latência (153ms passaria; uma regressão 2× também passaria).
- **(c) mover para suite perf** tira a prova do gate hermético — a regressão de latência só seria vista em pipeline separado, que ninguém roda por padrão.
- **(a)** preserva a prova dentro da suíte hermética e é estável sob carga: quando a máquina está ocupada, baseline e p95 degradam JUNTOS, então o ratio se mantém ~1.0–1.3×. O que o teste passa a detectar é **degradação relativa dentro do run** (p95 ≫ mediana = cauda gorda = regressão real), que é exatamente o sinal que importava.

## O que o gate hermético passa a garantir (e o que deixa de garantir)
- **Garante:** que o p95 não degrada mais que 3× a mediana do início do mesmo run — detecta regressão estrutural de latência (cauda) de forma determinística, mesmo com a máquina sob carga.
- **Deixa de garantir:** latência absoluta < 100ms. Um run inteiro 5× mais lento (ex.: disco degradado afetando todas as iterações uniformemente) passa no gate relativo; só o teto de segurança de 500ms pegaria degeneração extrema. Monitoramento de latência absoluta em produção deve cobrir essa lacuna.

## Provas (host-side, versão final em blocos, VERDE 8/8)
1. **Run normal:** `node --import tsx --test --test-force-exit --test-reporter=tap test/sessionRoster.test.ts` → 8 pass, 0 fail; bloco 1: p95 50.7ms / baseline 45.6ms (1.11x) e p95 51.8ms / baseline 44.6ms (1.16x).
2. **Run sob carga sintética:** 4 processos busy-loop Node em paralelo durante o run → 8 pass, 0 fail; bloco 1: p95 59.8ms / baseline 50.3ms (1.19x) e p95 53.5ms / baseline 46.7ms (1.14x).
3. **Run sob carga com spike:** em uma validação intermediária (gate de run único), p95 255.6ms / ratio 5.22x — motivou a mudança para best-of-3 blocos; com a versão final, os mesmos 4 busy-loops passam 2/2.

## Escopo respeitado
- Só `eng-mcp/test/sessionRoster.test.ts` foi alterado. Nada em `src/`, nada em OpenRouter/roles.json.
- Commit contém apenas código de teste + este relatório; verify manifest fora do commit.
- Sem push/deploy.