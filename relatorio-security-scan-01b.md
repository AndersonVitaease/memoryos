# RELATÓRIO — SECURITY-SCAN-01b (fase de provas P1–P7)

Data: 2026-09-26 · Worktree `/opt/memoryos/security-scan-wt` (branch `security-scan-01`)
Base já entregue: tool `engineering.security.scan` (tool 107) implementada, commitada no main (`cbfaa288`) e deployada em sessão anterior.
Esta fase: **provas ao vivo contra a VPS real + correção de 1 vazamento descoberto pelas provas**.

> **Aviso de integridade:** um PAT real do GitHub foi materializado no output/audit durante a rodada 1 do scan `vps` (classe de leak documentada na §P5). O valor não é reproduzido neste relatório — referencio por `findingId`/hash16 apenas.

---

## 1. Continuidade

- Sessão anterior: implementação completa M1–M4, catálogo SEC-001…SEC-043, triagem Jev, drift por target, card, audit hash16-only, suíte do arquivo 15/15 — commit `cbfaa288` no main, deploy tool 107.
- Worktree `/opt/memoryos/security-scan-wt` continuado em `33b70388` (= main), zero commits pendentes (confirmado com `git worktree list` + `git diff main` vazio).
- Esta sessão: provas P1–P7 ao vivo **encontraram 1 vazamento real** (§P5) → fix implementado, testado (15/15 + 2 regressões novas) e commitado no worktree (`bafbd2f6`), pendente de deploy governado (contrato: zero deploy/push nesta sessão).

## 2. Provas

### P1 — baseline dos 6 achados reais: 3/6 detectados ao vivo, 3 ausências documentadas com prova

| # | Achado da baseline | Check | Estado | Evidência |
|---|---|---|---|---|
| 1 | Caddyfile 3 keys | SEC-009 | ✅ detectado (linhas 11/22/33 + 1 high-entropy na linha 110; judge real p 0.60–0.71) | scan `vps` r1/r2 |
| 2 | Token Notion via ps aux | SEC-008 | ⚠️ ausente — exposição encerrada: nenhum processo com token Notion em cmdline (prova: loop sobre `/proc/*/cmdline` sem hits; único hit era o próprio comando grep da sessão) | host-side |
| 3 | `/data/tokens.json` legado | SEC-010 | ✅ detectado (2 achados: inventário + host file, hash16 27e4c08fd4d88efd / 2655b039037d4013) | scan `vps` |
| 4 | PAT no filename `/opt/eng-mcp-secrets/` | SEC-004 | ✅ detectado — e expôs o PAT bruto no campo `local` (§P5) | scan `vps` r1/r2 |
| 5 | senha dashboard via 422 (transcripts) | SEC-011 | ⚡ exposição real persiste host-side (grep host encontra a senha em transcript jsonl), mas o sensor está cego: o runner tem `ProtectHome=true` e `/root/.claude/projects` é invisível ao probe (readError ENOENT nas r1/r2) | readError + grep host |
| 6 | Token LibreChat fora do registry | SEC-008/011 | ⚠️ ausente — sem processo vivo e sem arquivo; referências apenas dentro de exports `.json` de migração de dados | host-side |

Nenhuma ausência é tratada como "ambiente limpo": cada uma tem prova documentada (processo encerrado; sensor blindado pelo próprio hardening do runner; artefato sem vestígio vivo).

### P2 — falso-positivo plantado em sandbox → triado como FP/benigno ✅

- Dummy plantado em `fp-sandbox/dummy-test-token-not-real.txt` (sob o worktree, único local /opt/* visível ao container do servidor): `api_key = "sk-DUMMY0123456789abcdefghijNOTAREALKEYzz"`.
- Scan live com target `path`: SEC-001 + SEC-003 dispararam (detector ok) e o **judge triou ambos como `noise` com p=0.09** — calibração viva provada.
- Guard de allowlist: `target "/tmp"` → recusa tipada (`TARGET_NOT_ALLOWED`) com **zero LLM** (judgeCalls=0).

### P3 — target parametrizado, mesmo motor ✅ (com limitação documentada)

- Scan live com target `path` `/opt/memoryos/security-scan-wt/eng-mcp` (resultado de 67.7 KB: SEC-002/003/004/031/033…), mesmo motor, zero mutação.
- **Limitação registrada:** o container do servidor monta apenas `/opt/memoryos`, `/data` e o run-dir — apps em outros `/opt/*` (ex.: `/opt/gpu-orchestrator`) não são visíveis ao motor path-target (ENOENT honesto, como o sandbox fora de /opt). Scan de outros apps requer mount adicional no container ou probe runner-side para paths (follow-up, §5).

### P4 — zero mutação ✅

sha256 de `/data/tokens.json`, `/etc/caddy/Caddyfile`, `/opt/memoryos/eng-mcp/src/securityScan.ts`, `/opt/memoryos/eng-mcp/package.json` e listing de `/data/credentials` idênticos antes/depois de 4 scans live — evidência em `/opt/security-scan/evidence/p4-hashes-before.txt` e `p4-hashes-after.txt`.

### P5 — nunca emitir valor de secret — RED ao vivo → fix commitado, pendente deploy

- **RED (ao vivo):** rodada 1 do scan `vps` materializou o PAT bruto no campo `local` do achado SEC-030 `9612379a8ad0d6ee`: o arquivo `/opt/eng-mcp-secrets/github-pat<RAW-PAT>` carrega o token **no nome do arquivo**; o guard antigo exigia `\b` inicial, e entre o prefixo `github-pat` e o token embutido não existe word boundary.
- **Causa raiz:** regexes do `SEC_OUTPUT_GUARD` com `\b` inicial (a junção `...github-pat` + `github_pat_...` não tem boundary entre `t` e `g`).
- **Green (worktree, commit `bafbd2f6`):** (1) guard sem `\b` inicial — bias fail-closed, over-match é seguro; (2) redação `[sec-redacted:<kind>]` sobre `local`/`reasons`/`checksRun.note`/`readErrors`/argv0 dos processos/target root **antes** de drift/judge/audit; (3) argv0 (cmdline raw do probe) redigido na origem em `mapHostProbe`.
- **Testes:** 2 regressões novas + suíte 15/15 verde + tsc limpo (worktree).
- **Grep adversarial quantificado:** 0 hits nos outputs P2/P3; **2 linhas do audit de produção + 1 ocorrência no drift snapshot `/data/security-scan/vps.json` carregam o PAT bruto** (artefatos 0600 do scanner — leak real documentado, não reproduzido neste texto).
- **Pendente:** deploy governado (fora desta sessão por contrato). Até lá, scans live `vps` continuam materializando o valor no `local` do SEC-030 e nos artefatos drift/audit. Recomendação: não rodar o módulo secrets no scan `vps` antes do deploy do fix — ou rotacionar/purgar o arquivo-fonte (missão de operator).

### P6 — zero LLM no caminho determinístico ✅

- `classifyText`/walk/scans são puros; o único ponto LLM é a triagem (1 evaluate batched por scan, fail-open, audit metadata-only); modo `plan` roda com judgeCalls=0 (contrato testado); recusa `/tmp` com zero LLM.
- Live: judgeCalls=1 por scan; custo total das 4 chamadas live ≈ **US$ 0.0005**.

### P7 — 2 rodadas + capture + relatório ✅

- 2 rodadas `vps` com judge: r1 (44 findings, drift `new`) → r2 (**44 recurring / 2 new**, `previousAt` set, closed=0). Judge re-triou em r2 (probabilidades migraram — ex. 0.27→0.20, 0.57→0.62; threshold 0.6 estável: mesmos 4 achados "judged real" nas duas rodadas).
- FP scan e path scan (P2/P3) com judge; memory capture + este relatório.

## 3. Card da VPS (r2, estado atual)

**Score 0/100** — 7 critical · 33 warn · 6 info · delta 2 new / 44 recurring / 0 closed · registry 24 entradas (17 ativas).

"Judged real" (p≥0.6): **4 hits no Caddyfile** (3 headers inline + 1 basic_auth high-entropy, p 0.60–0.71). Críticos extra-judge: UFW desabilitado (SEC-020), PAT filename mode 644, systemd env secret (guardian-mvp, p 0.55). Registry: 4 entradas expiradas não-revogadas + 2 privilege creep (scope fora do catálogo) + 5 sinais IDS degraded (fail-open).

## 4. Remediation priorizada (relatório — NUNCA aplicada por esta tool/sessão)

1. **PAT real em filename (mode 644) em `/opt/eng-mcp-secrets/`** — rotate + purgar o arquivo cujo nome É o secret. Operator mission.
2. **Caddyfile: 3 keys inline + 1 basic_auth high-entropy** (judge real) — mover para import de arquivo 0600/LoadCredential.
3. **UFW desabilitado** (`ufw.conf ENABLED=no`) — enable com allows explícitos, ou documentar security group como exceção.
4. **4 registry entries expiradas não-revogadas** (`candidate`, `operator-publish-e2e`, `experimento-a`, `operator-systemd-uc-2026-09-19`) — revoke via tool governada.
5. **2 privilege creep** (scope `grant` em não-operator e scope `write` fora do catálogo) — alinhar catálogo ou revogar.
6. **Transcripts gap** — decisão de operator: drop-in ReadWritePaths para `/root/.claude/projects` no runner (trade-off documentado) ou ponto cego aceito com registro.
7. Pós-deploy do fix P5: re-scan reescreverá o drift snapshot sanitizado; as 2 linhas de audit append-only com leak permanecem (documentar retenção).

## 5. Pendências para a próxima missão

1. **Deploy governado** do worktree `security-scan-01` @ `bafbd2f6` (fix P5) — até lá o scan live `vps` segue vazando o PAT no output/audit/drift (ver §P5).
2. Probe path-target runner-side (apps `/opt/*` não montados no container) — completa o P3 (ex.: `/opt/gpu-orchestrator`).
3. Decisão operator sobre transcripts (ReadWritePaths vs ponto cego).
4. M5 (CVEs de lockfile) — fase 2 opcional, não iniciada.
5. IDS correlation composta (secret exposto + uso anômalo) — cross-check SEC-043 existe (info); correlação composta não implementada nesta fase.

## 6. Contrato respeitado

- READ-ONLY absoluto — P4 prova zero mutação por hash before/after.
- Sem tocar pipeline/deploy/registry: 0 deploys, 0 push, 0 revoke; remediation é texto.
- Audit metadata-only (/data/audit/security-scan.jsonl hash16-only, exceto as 2 linhas com leak via campo `local` — documentado na §P5; o fix sanitiza a origem).
- Envelope de erro canônico (recusa `/tmp` tipada).
- transcript-400 → não ocorreu.
- Judge: 4 calls live, custo total ≈ US$ 0.0005, fail-open documentado.

---

## 7. STATUS FINAL DAS PROVAS P1–P7 (honesto)

| Prova | Status | O que rodou / o que não rodou |
|---|---|---|
| P1 baseline 6 achados | **PARCIAL — 3/6 + 3 ausências documentadas** | Detectados: Caddyfile 3 keys (SEC-009), /data/tokens.json (SEC-010 ×2), PAT filename (SEC-004). Não detectados com prova: Notion (processo encerrado — ps sem hits); senha 422 (exposição REAL persiste host-side, sensor cego por ProtectHome=true do runner); LibreChat (sem processo/arquivo vivo). **O item 5 é exposição real não detectável pelo sensor hoje.** |
| P2 FP plantado → noise | **VERDE** | Dummy plantado e scanado ao vivo: SEC-001+SEC-003 dispararam, judge noise p=0.09. Recusa /tmp tipada, zero LLM. |
| P3 target parametrizado | **VERDE COM LIMITAÇÃO** | Path target (worktree eng-mcp) rodou com o mesmo motor. NÃO rodou: /opt/gpu-orchestrator (não montado no container do servidor — follow-up runner-side). |
| P4 zero mutação | **VERDE** | Hashes sha256 idênticos antes/depois de 4 scans live (evidence/p4-hashes-before/after). |
| P5 sem valor de secret | **RED AO VIVO → FIX PRONTO, PENDENTE DEPLOY** | Scan vps r1 materializou o PAT bruto no campo local (token está no NOME do arquivo; guard antigo exigia \b inicial inexistente na junção). Grep adversarial: 0 hits nos outputs P2/P3, 2 linhas no audit de produção + 1 no drift snapshot carregam o valor (artefatos 0600). Fix commitado (bafbd2f6): guard sem leading-\b + redação sec-redacted em local/reasons/notes/readErrors/argv0/root. 15/15 testes + 2 regressões novas. **NÃO deployado nesta sessão (contrato: zero deploy/push) — scan vps com secrets segue vazando até o deploy.** |
| P6 zero LLM determinístico | **VERDE** | Único ponto LLM é a triagem (fail-open, audit metadata-only); /tmp recusado com judgeCalls=0; modo plan sem judge (contrato testado). 4 judge calls live (~US$0.0005). |
| P7 2 rodadas + capture + relatório | **VERDE** | 2 rodadas vps (r1: 44 new; r2: 44 recurring/2 new, previousAt set); judge re-triou nas 2 (4 Caddyfile "judged real" p 0.60–0.71 em ambas). Memory capture admitido (gate 0.88). Este relatório. |

**Não rodou / não feito nesta sessão:** deploy do fix P5 (contrato); M5 CVEs de lockfile (fase 2 opcional); correlação IDS composta; probe path-target runner-side (apps /opt/* externos); ingest de transcripts (decisão de operator).

**Findings reais atuais da VPS (card r2): score 0/100 — 7 critical / 33 warn / 6 info; registry 24 entradas (17 ativas).**
Top findings reais para o operator (NUNCA aplicados por esta tool/sessão — remediation é relatório):
1. PAT GitHub real como NOME de arquivo em /opt/eng-mcp-secrets/ (mode 644) — rotate + purgar.
2. Caddyfile: 3 keys inline + 1 basic_auth high-entropy (judge real p 0.60–0.71).
3. UFW desabilitado (ufw.conf ENABLED=no) — habilitar ou documentar security group.
4. 4 registry entries expiradas NÃO revogadas: candidate, operator-publish-e2e, experimento-a, operator-systemd-uc-2026-09-19.
5. 2 privilege creep: scope grant em não-operator (release-runner-2026-09-19) + scope "write" fora do catálogo.
6. Transcripts: senha de dashboard real persiste em transcript host-side; sensor cego por ProtectHome=true do runner — ReadWritePaths (com trade-off) ou ponto cego assumido.
