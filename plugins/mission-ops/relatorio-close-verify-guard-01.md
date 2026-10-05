# Relatório — CLOSE-VERIFY-GUARD-01 (guarda de consequência no mission_close)

Data: 2026-09-27. Motivação: gpu-bridge-e2e-fix-01 mexeu em gpu-bridge.service e
hermes-health-sentinel.service e fechou sem verify.json, sem badge e sem rastro auditável.

## Decisão: HÍBRIDA — (b) para escopo declarado, (a) para escopo heurístico

| Origem do escopo | Sem verify.json | Com verify.json |
|---|---|---|
| **declarado** (`consequence` no dispatch, ou linha `consequence: true` no prompt) | **(b)** recusa + reabre: `status=interrupted`, nudge no pane, evento `verify_required` (ledger events + bus) + `mission_reopened` | fluxo DELIVER-VERIFY de hoje (VERDE → `verified_e2e`; VERMELHO → `deliver_verify_red`) |
| **só heurística** (regex no prompt) | **(a)** fecha, mas com evento `closed_unverified_consequence` (ledger + bus), `consequenceWarning` no ledger, `warnings` na resposta, veredito `unverified_consequence` no `mission_completed` | igual |
| nenhum | inalterado (verify.json continua opcional) | inalterado |

Escape auditável para o (b): `mission_close(acceptUnverified="<motivo>")` rebaixa para (a),
com o motivo gravado no evento. Se o runner falhar (fail-open, sem badge) numa missão de
consequência, também vale (a): a falha do runner não é culpa do worker, mas fica registrada.

**Por que híbrida:**
1. **Coerência com o design atual.** Os gates com prova (`deliver_verify_red`,
   `operator_channel_red`) reabrem: `interrupted` + nudge + evento no bus + `mission_reopened`.
   Os gates "declaração ausente" (`closeWarning` sem operatorChannel) só avisam. O `verify_required`
   declarado segue o primeiro molde e o heurístico segue o segundo.
2. **A heurística erra muito — medido nos ledgers reais.** Rodei uma varredura só-leitura em
   `/root/.hermes/mission-state`: **48 de 76** ledgers existentes casam o regex (muitos prompts
   dizem "zero deploy"/"sem restart" como RESTRIÇÃO). Se o close bloqueasse pela heurística,
   cerca de 63% das missões comuns ficariam presas. Isso quebraria o critério de backward-compat.
3. **Backward-compat estrito.** Ledgers antigos não têm o campo `consequence`. O close
   recalcula só a heurística a partir do promptFile, nunca o escopo declarado. Então **nenhuma
   missão existente passa a ser bloqueada**. As 3 ainda abertas que casam o regex fecham com warning.
   Com o incidente (gpu-bridge-e2e-fix-01: `.service, systemctl, restart, deploy`), hoje sairia
   `closed_unverified_consequence` no bus em vez de um close silencioso.

## Marcação na origem (dispatch/ledger)
- `mission_dispatch` aceita `consequence: bool`. `true` exige verify.json; `false` desliga a heurística.
- Sem a flag: a linha `consequence: true|false` no prompt vale como declaração (aceita markdown
  `- **consequence**: true`). Sem declaração, vale a heurística.
- O ledger grava `consequence`, `consequenceSource` (`dispatch|prompt|heuristic|none`) e
  `consequenceMatches` (até 10 padrões distintos, para auditoria).

## Detecção (mission_core, custo zero, sem LLM)
- `CONSEQUENCE_REGEX` (case-insensitive):
  `systemctl|\.service\b|systemd|/opt/|\bdeploy|produ[çc][ãa]o|\bproduction\b|\brestart`
  (o padrão do contrato mais `production`; `.service` com `\b`; "unit" ficou fora porque casa
  com "unit tests". Os units ficam cobertos por `systemd` e `.service`).
- `CONSEQUENCE_DECL_REGEX`: `(?im)^[\s>*_\-`#]*consequence[\s*_`]*[:=][\s*_`]*(true|false|yes|no|sim|n[ãa]o)\b`
- Leitura do prompt limitada a 256 KiB. `resolve_consequence`, `detect_consequence` e
  `ledger_consequence` nunca levantam exceção.

## Diff resumido
- `mission_core.py` (+~70, bloco novo no FIM do arquivo, sem tocar o loader da
  load-ledger-fix-01): regexes + `_consequence_bool`, `detect_consequence`,
  `resolve_consequence`, `ledger_consequence`.
- `__init__.py`:
  - dispatch: grava o escopo no ledger.
  - close: novo **passo 0.2** logo após o DELIVER-VERIFY; o passo 4 emite
    `closed_unverified_consequence` e o veredito `unverified_consequence`; a resposta ganha `warnings`.
  - schemas: `consequence` (dispatch), `acceptUnverified` (close), descrições e docstring.
- `test_mission_ops.py`: nova classe `TestConsequenceGuard` (7 casos):
  - (a) consequence=true sem verify.json → reabre com `verify_required`;
  - (b) consequence=true + verify.json VERDE → badge `verified_e2e`, sem guarda;
  - (c) missão comum sem verify.json → close inalterado, bus intocado;
  - override `acceptUnverified`; heurística em ledger legado → fecha com evento;
  - detecção/precedência; dispatch grava o escopo no ledger.
  Bus/notify mockados nos testes novos (não poluem o spool real).
- Backups: `*.bak-20260927-close-verify-guard` (os `.bak-20260927` que já existiam não foram tocados).

## Suíte
Baseline antes da mudança: `python3 test_mission_ops.py` → 94/94 OK.
Depois da mudança: **101/101 OK** (94 antigos + 7 novos), `Ran 101 tests in 389.462s — OK`, exit 0.
(`pytest` não coleta este plugin: `__init__.py` usa import relativo. O runner oficial é o
unittest, como está na docstring do arquivo de testes.)

## Coordenação com a load-ledger-fix-01
Às 14:11:33 a outra sessão sobrescreveu `test_mission_ops.py` por engano ao resolver o
conflito de merge. Ela avisou; eu reapliquei a classe por append e a `TestLoadLedgerFix` dela foi
preservada. **O merge pendente (MERGE_HEAD 5be7257) e o commit NÃO foram feitos.** Commit não
está no contrato e é decisão do supervisor/operator.
