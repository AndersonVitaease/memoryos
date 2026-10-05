# RELATÓRIO — DISPATCH-FAST: DESPACHO RÁPIDO DE MISSÕES (1ª a 3ª sessão)

Data: 2026-09-27. Worktree `/root/.hermes/worktrees/dispatch-fast`, branch `dispatch-fast-01`.
Commits: d899bef (restauração do mission_core + config dourada + ready-dance + ready-regex + métrica), cf2f6e2 (suíte estendida, 92 testes) + o commit de fechamento desta sessão (provas P2/P3 reais de 27/09 + fix de mock).

## Resumo

O despacho de missões levava ~10 min do `pane_created` ao prompt entregue — quando não estourava `CLAUDE_START_TIMEOUT` (180s) e pedia intervenção humana. A série DISPATCH-FAST atacou isso com 4 peças determinísticas, zero LLM:

| Peça | O que entrega |
|---|---|
| **Config dourada** no `tab_create` | claude NASCE pronto: zero diálogos first-run no caminho feliz |
| **Ready-dance** dos diálogos | quando um diálogo aparece, é navegado por teclas mapeadas — sem relançar claude, sem humano |
| **Ready-regex** afiado | ready de verdade ≠ diálogo de dance (o prompt não é mais entregue na tela errada) |
| **Métrica despacho→working** | o ledger passa a PROVAR a velocidade: badge `dispatch_fast` <90s, finding `dispatch_slow` ≥90s |

## O número (antes/depois)

**Antes** (caso real `mission-notify-01`, 26/09 23:32, events.jsonl):
- `pane_created` 23:32:06 → `claude_start_timeout` 23:35:06 ("timed out waiting for output match") — 3 min de wait morto e o despacho FALHOU; intervenção manual seguiu até 23:58. A missão registra **~10 min** até o prompt estar de fato trabalhando.

**Depois** (prova real `df2p2e`, 27/09 00:46, ledger + events.jsonl):
- `pane_created` 00:46:31 → `prompt_sent` 00:46:34 → `mission_working` 00:46:40
- **despacho→working = 6000 ms, badge `dispatch_fast`** (ledger df2p2e.json: `dispatchToWorkingMs: 6000`).

De ~10 min (600 s) para 6 s — **100× mais rápido** no caminho feliz, e o caminho ruim (diálogo imprevisto) agora se auto-resolve ou falha determinístico em 180 s com pane registrado para `mission_recover`.

## Peça 1 — Config dourada (`mission_core.py`, prova P3)

Template de `CLAUDE_CONFIG_DIR` pré-aceito (trust dado, tema setado, welcome dispensado), versionado em `/root/.hermes/plugins/mission-ops/CLAUDE_CONFIG_DIR/` (config.json, security.json, theme.json). O `tab_create` copia para `<cwd>/.claude-config` (`golden_config_copy`, fail-open: erro de cópia é coberto pelo ready-dance) e o dispatch sobe o claude com esse env — `__init__.py:237-243`.

`golden_config_copy` é idempotente: copiar sobre um `.claude-config` existente com `config.json` é NO_OP (testado em `TestGoldenConfig`).

## Peça 2 — Ready-dance (`READY_DANCE`, provas P2/P3 reais 27/09)

Diálogos first-run conhecidos → teclas mapeadas, aplicadas 1 tecla por `send_keys` com 0,3 s entre elas (o claude precisa redesenhar o estado entre teclas), 2 s de pausa após a rodada (buffer acumulado = tela velha), máximo 10 danças (proteção contra tela presa):

1. "Do you want to use this API key?" → Enter
2. Trust de pasta ("Is this a project you created or one you trust" / "Yes, I trust this folder" / "No, exit") → Down + Enter (Yes)
3. Banner auto-mode / bypass → Enter
4. Welcome/theme ("Syntax theme") e "Security notes... Press Enter to continue" → Enter

A tela inteira decide (60 linhas via `read_output`), não a linha casada — o menu do trust fica em OUTRA linha da que o `wait_output` retorna (prova P2 real: o despacho tratava a linha casada como ready e entregava o prompt na tela errada, perdendo-o).

Provas reais no events.jsonl (27/09): `df2p2d` (`ready_dance` action="down enter"), `df2p3`/`df2p3b` (action="enter" no Welcome → "down enter" no trust).

## Peça 3 — Ready-regex e o loop por deadline

`ready_regex()` agora reconhece ready REAL (`? for shortcuts`, `❯ Try`, `accept edits on`, `bypass permissions on`, `auto mode on`, `auto-accept mode`) e NÃO trata diálogo de dance como ready. A tela "Syntax theme" virou diálogo (prova P2: tratá-la como ready entregava o prompt na tela errada).

O loop de espera é por DEADLINE de 180 s com waits curtos de 15 s (`__init__.py:245-...`): cada rodada espera o combined `ready|READY_ERROR|MCP_PROMPT|ready_dance_regex()`, decide pela tela inteira, dança quando vê diálogo conhecido, dispensa o intersticial de MCP, e segue dentro do deadline. `ready_dance_regex()` entra no combined para o wait retornar EM SEGUNDOS quando um diálogo aparece (prova P3: sem isso cada rodada esperava o timeout de 180 s inteiro).

Falha continua determinística: tela de erro → `READY_REGEX_ERROR` com recipe de `mission_recover`; 180 s sem ready → `CLAUDE_START_TIMEOUT` com pane registrado.

## Peça 4 — Métrica despacho→working com badge (`dispatch_metric`, P4)

No `mission_watch` (zero LLM): o 1º "working" (footer "esc to interrupt") marca `workingAt`; `dispatch_metric` calcula `dispatchedAt → workingAt` e grava no ledger:

- < 90 s (`DISPATCH_FAST_MS`): evento `mission_working` + badge `dispatch_fast`
- ≥ 90 s: evento `mission_working` com **FINDING automático** `dispatch_slow`

Prova real: `df2p2e` → evento `mission_working` "despacho→working 6000ms badge=dispatch_fast" (00:46:40Z).

## Provas — suíte e testes

- Suíte: `python3 -m unittest test_mission_ops -q` → **92 testes** (dance, config dourada, ready-regex estendido, métrica P4, template anti-stop-and-ask).
- Esta 3ª sessão achou 1 erro residual da 2ª (morte às 00:59): `StopIteration` em `TestMcpPromptRecipe.test_dispatch_dismisses_and_delivers` — o mock de `wait_output` tinha 2 retornos finitos e o novo loop por deadline chama 3× (rodada do loop + wait interno do `dismiss_mcp_prompt` + rodada seguinte). Fix cirúrgico: 3º retorno `(READY, None)` no `side_effect`. Classe 4/4 OK; suíte completa re-rodada (resultado no commit).
- Provas P2/P3 reais de 27/09 da 2ª sessão (trust dialog, "Security notes", loop por deadline, tecla-a-tecla) vieram não-commitadas e estão neste commit, com os testes ajustados ao contrato corrigido.

## Estado

- SÓ worktree; zero deploy/push. Ledger real tocado apenas em leitura.
- Próximo passo natural (fora do escopo): os números do badge alimentam o WATCHDOG/Golden-signal no ciclo de supervisão.
