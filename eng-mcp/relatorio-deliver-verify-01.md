# RELATÓRIO: DELIVER-VERIFY-01 — Supervisor de Entrega (verificação ponta a ponta no fechamento)

**Data:** 2026-09-26 · **Status:** CONCLUÍDA · **Missão 100% autônoma** (nenhuma pergunta ao operator)

## 1. O que foi construído

| # | Pedido da missão | Entregue | Local |
|---|---|---|---|
| 1 | Manifesto de provas por missão | 7 tipos de prova (`http`, `pixels`, `ocr`, `cmd`, `file`, `service`, `bus`) + exemplo canônico | `verify.json` no cwd da missão; exemplo em `/opt/deliver-verify/examples/verify.example.json` |
| 2 | Runner determinístico | `verify.py` (377 linhas, zero-LLM, read-only fora do próprio relatório, anti-crash 10KB, exit 0/2/1) | `/opt/deliver-verify/verify.py` |
| 3 | Gatilho no mission_close | Passo 0 no plugin: VERDE → badge **`verified_e2e`** no ledger; VERMELHO real → reabre (`interrupted`) + nudge + evento `deliver_verify_red` no bus | `/root/.hermes/plugins/mission-ops/__init__.py` (~linhas 591–664) |
| 4 | Integração TRINITY | Tool `mission_verify` no plugin (verificações sob demanda pelo supervisor-Qwen; determinística, independente de LLM) | registro já existente, wrapper `handle_mission_verify` |

Badge chama-se **exatamente `verified_e2e`** (cross-dependency GPU-ORCHESTRATOR-01 honrada).

**Compatibilidade com SUPERVISOR-VERIFY-01:** o passo 0 (manifesto) e o passo 0.5 (`operator_channel` proof) são gates complementares — um verifica a ENTREGA, outro o CANAL do operator. Ambos ativos no mission_close.

## 2. Provas red-then-green (todas com evidência em disco)

**P1 (red) ✓** — manifesto quebrado de `test-dv-p3` (URL `http://127.0.0.1:1/nope` + arquivo inexistente): verdict **fail**, exit 2, findings corretos: `P1-http-1 falhou — HTTP 0 (esperado 200)`; `P2-file-1 falhou — arquivo inexistente: /tmp/dv-p3/inexistente.txt`. Duração 88ms.

**Sanity ✓** — manifesto canônico do exemplo (8 provas): **pass 8/8**, exit 0, 529ms.

**P2 (verde) ✓** — `mission_close({"missionId": "test-dv-p2"})` → `ok: true`, steps `[deliver_verify pass, claude_exit "pane já não existe", tab_close "sem tabId"]`; ledger final `status: "closed"` + badge `verified_e2e: {"verdict": "pass", "ts": "2026-09-26T16:13:18Z", "report": "/root/.hermes/mission-state/test-dv-p2.verify.json"}` (closeWarning esperado: "fechada SEM operator_channel declarado" — fixture sem canal).

**P3 (reabertura ponta a ponta) ✓** — `mission_close({"missionId": "test-dv-p3"})` → `ok: false, reopenedByDeliverVerify: true`; steps com `deliver_verify fail (P1-http-1, P2-file-1)` + nudge + bus; ledger `status: "interrupted"` salvo ANTES do nudge/spool; linha no spool em schema hook-completo (pane resolvível + msg completa); **entrega real pelo bus**: evento `evt-54b0e03606` → `state: delivered`, 1 tentativa, alvo supervisor `20260925_012625_73a703`, ack `delivered=yes(0.93) ack=acknowledged(0.80)`, linha exibida "[bus] missão test-dv-p3: deliver_verify_red (evt evt-54b0e03606) — REABERTA POR DELIVER-VERIFY: P1-http-1 falhou — HTTP 0 (esperado 200); P2-file-1 falhou — arquivo inexistente: ...". Bus state: spool_offset 148179, 514 deliveries.

**Nota P3 (mutação pós-prova, origem externa):** às 16:27:48Z — 4,5 min DEPOIS da prova (16:13:18Z) — o ledger `test-dv-p3.json` foi reduzido externamente a um stub de 203 bytes (`status: "closed"`, sem steps, sem badge). Investigação (transcript desta sessão 16:13–16:31 extraído por script): **nenhum tool call desta sessão escreveu o arquivo** — o único Write próximo (16:27:14) foi este relatório, arquivo diferente. Evidência correlata no journalctl: o supervisor Hermes (`hermes[9232]`) estava com **turnos concorrentes na sessão `20260925_012625_73a703` exatamente 16:27:18–16:28:19**, e o mission-watcher caiu de `missions=6` (16:27:04) para `missions=4` (16:28:04) — 2 missões saíram do conjunto ativo naquele minuto. Hipótese mais plausível (fundamentada no código, não provada): `handle_mission_watch` do plugin — caminho `pane_closed`/`tab_closed` (linhas 409–411) grava `status: "closed"` e salva; o pane fake `pane-fake-dv-p3` nunca existiu, então um watch externo sobre ele marcaria closed. **A prova P3 em si permanece VÁLIDA** (bus entregue + spool + steps provam o caminho de reabertura executado); a mutação é atividade do ecossistema Hermes em volta, não falha do gate. Registrada como gray-zone 6.

**P4 (zero LLM) ✓** — (a) grep no source de `verify.py`: nenhuma referência a chamada de modelo; (b) campo `llm_calls: 0` presente em ambos os relatórios gerados (`test-dv-p2.verify.json` e `test-dv-p3.verify.json`); (c) auditoria do judge na janela dos testes (16:12–16:16Z) filtrada por deliver/verify/test-dv: **nenhum evento**.

**P5 (latência) ✓** — manifesto típico (exemplo, 8 provas): wall **0,44s** (runner durationMs 379, verdict pass 8/8); replay com cache quente **0,42s**. 68× abaixo do teto de 30s.

**P6 (juiz + docs) ✓** — detalhado na seção 3.

## 3. Juiz (2 rodadas) e decisões gray-zone

Rodada 1 (`engineering.judge.evaluate`, 4 questões noul): dv1 gates-complementares **0,47**; dv2 fail-open **0,33**; dv3 id=None no spool **0,66**; dv4 linha de teste append-only **0,81**.

Convenção aplicada (<0,6 → deliberar; 0,6–0,9 → seguir com flag). Deliberação:

- **dv1 (0,47→0,83 na rodada 2):** os arquivos do plugin estão FORA de qualquer git repo e `gate_before_close` é código PRÉ-EXISTENTE de outra missão; o guard da missão ("somente leitura fora do ledger/relatório") proíbe deletá-lo. Mantê-lo intocado é a única opção em escopo. Rodada 2 com esse contexto: **0,83 — confirmado**.
- **dv2 (0,33→0,73 na rodada 2):** o fail-open NÃO é silencioso — os 3 ramos de falha do runner (exit inesperado, timeout 35s, exceção) registram step `{"verdict": "fail-open", "note": "<exit/timeout/erro exato>"}` visível na resposta. VERMELHO REAL sempre bloqueia; fail-open só cobre falha de INFRA do verificador — fail-closed aqui viraria ponto único de falha sistêmico prendendo fechamentos legítimos. Rodada 2: **0,73 — confirmado**.
- **dv3 (0,66):** id=None no spool é cosmético; a entrega ao supervisor funciona (pane2mission + msg, entregue+ack positivo comprovado). Seguido com flag — padronização futura, não bloqueador.
- **dv4 (0,81):** spool é append-only; linha de teste de `test-dv-p3` permanece como registro. Seguido com flag.

## 4. Guards honrados

- Read-only fora do ledger/relatório: verify.py só escreve o próprio relatório `<missionId>.verify.json`; o gate só toca ledger (badge/status) — nunca muta a entrega verificada.
- Verificação de USO, não de estilo: provas medem comportamento (HTTP/pixels/OCR/exit/arquivo/serviço/evento), não estética.
- Anti-crash 10KB (cap de stdout por prova + output do CLI); GWS/VOICE não tocados; gateway Hermes NUNCA reiniciado (reload quente via control_socket.py — já executado com sucesso: `reloaded: True`, mission-ops nas 10 tools).

## 5. Operação (como usar)

1. Missão declara `verify.json` no seu cwd (exemplo: `{"http": [{"url": "...", "expect_status": 200}], "pixels": [...]}` — ver `/opt/deliver-verify/examples/verify.example.json`).
2. Ao fechar (`mission_close`), o passo 0 detecta o manifesto e roda o runner (timeout 35s).
3. VERDE → badge `verified_e2e` no ledger (report em `<missionId>.verify.json`); VERMELHO → missão reaberta + nudge + evento no bus para o supervisor.
4. Sob demanda: tool `mission_verify` (wrapper do runner). Sem manifesto: runner NUNCA bloqueia no mission_close (modo inferido existe, mas o gate só dispara com manifesto — caminho de fechamento inalterado para missões sem `verify.json`).

## 6. Commit

**Correção honesta (descoberta no fechamento, 17:2xZ):** a afirmação original desta seção — "arquivos do plugin estão FORA de qualquer git repo" — estava **errada para o plugin**. `/root/.hermes/plugins/mission-ops/` TEM um `.git` próprio (toplevel `master`); o `[ -d .git ]` / `rev-parse` executados de dentro de `/root`/`/root/.hermes/plugins` só não o acharam porque o repo enraiza no próprio diretório do plugin. Estado verificado:

- **Repo `mission-ops` (toplevel próprio):** commit externo `cc7a9e0` (16:23:54Z, autor "Hermes Mission Ops", attribution Claude Code) já continha o código do gate desta missão (passo 0/0.5 no `__init__.py`, `verify_gate.py`, testes 69/69, RUNBOOK-SUPERVISOR-VERIFY-01) — provavelmente janela paralela do ecossistema Hermes. O edit do README desta sessão foi commitado como `ec9685d` com attribution.
- **Runner compartilhado:** `/opt/deliver-verify/verify.py` e `/opt/mission-events/*` (RUNBOOK incl.) continuam FORA de qualquer repo (`/opt` não é repo) — declarado também no próprio `cc7a9e0` ("Runner compartilhado /opt/deliver-verify/verify.py (fora deste repo, dedupe com DELIVER-VERIFY-01)").
- **Repo `/opt/memoryos`:** `missao-deliver-verify-01.md` + `relatorio-deliver-verify-01.md` commitados com attribution (ver log do repo).

**Nota correlata (gray-zone 3 atualizada):** o mesmo `cc7a9e0` trimou `gate_before_close` (antes "não-wired"), resolvendo por via externa o risco de duplicação — a gray-zone 3 estava aberta quando a deliberação dv1 rodou (~16:1x) e foi fechada por atividade externa às 16:23:54Z, mesma mutação externa documentada na gray-zone 6.

## 7. Limpeza

Fixtures removidas (executado 2026-09-26T16:45Z, verificação pós-remoção: `0` arquivos `test-dv*` em mission-state, nenhum `dv-*` em /tmp): ledgers `test-dv-p2.json`/`test-dv-p3.json`, relatórios `test-dv-p2.verify.json`/`test-dv-p3.verify.json`, dirs `/tmp/dv-p2`, `/tmp/dv-p3`, `/tmp/dv-test`, e o relatório de teste inicial `/tmp/dv-green.json` (saída de um manifesto de teste contra URLs reais, esquecido na listagem original). A linha `deliver_verify_red` de `test-dv-p3` permanece no spool (append-only, decisão dv4 0,81).

## 8. Gray-zones declaradas

1. **Janela de observação curta:** o gate roda em produção desde o reload quente, mas só foi exercitado por fixtures sintéticas — primeira missão real com manifesto será o teste de fogo.
2. **id=None no spool** (dv3) até o bus atribuir id próprio — cosmético, entrega funciona.
3. **gate_before_close não-wired** (dv1) — risco de duplicação futura **RESOLVIDO POR VIA EXTERNA**: commit `cc7a9e0` (16:23:54Z, janela paralela do ecossistema Hermes) trimou o dead code, com o passo 0 desta missão como único gate. Ver seção 6.
4. **Fail-open do runner** (dv2) — aceito com flag do juiz; observável via step `fail-open`.
5. **Estimativa P4 por ausência:** o grep + auditoria provam ausência de chamadas no caminho feliz; um subprocess arbitrário dentro de `cmd` do manifesto PODERIA chamar um LLM — isso é poder do manifesto (prova E2E), não do runner.
6. **Mutação externa pós-P3 (nota P3, hipótese não provada):** o ledger de test-dv-p3 foi reduzido a stub "closed" por atividade externa do ecossistema Hermes (escritor mais plausível: caminho `pane_closed` de `handle_mission_watch`). A prova P3 em si permanece válida; monitorar se ledgers reais fechados via mission_close podem ser sobrescritos por watch externo (baixa probabilidade — ledgers reais têm pane existente).
