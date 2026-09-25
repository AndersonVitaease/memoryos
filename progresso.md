# AUTO-RUN-01B/C — Progresso da Missão

**Branch:** auto-run-01bc @ 3c933c0a (HEAD atual do worktree /opt/auto-run-01bc)
**Início:** 2026-09-25 (sessão retomada; sessão anterior morreu com transcript envenenada, ~11min de leituras)

## Mapa de arquivos-chave (Fase 0)

- `eng-mcp/src/harness/judgeGate.ts` (50.1KB) — gate client-side com bandas/denylist/allowlist
- `eng-mcp/src/harness/judgeGateCli.ts` (2.7KB)
- `eng-mcp/.claude/hooks/judge-hook.mjs` (10KB) — hooks PreToolUse/PostToolUse
- `eng-mcp/src/missionPreauth.ts` (10.4KB) — peça A (v108, já viva)
- `eng-mcp/src/notifyHermes.ts` (10.1KB) — C2 depende dele
- `eng-mcp/src/supervised.ts` (1.8KB)
- `eng-mcp/src/missionManifest.ts` (11.4KB) — runtime do manifesto
- `eng-mcp/src/judge.ts` (25KB) — judge.evaluate/verify
- `ALLOWLIST_VERSION` vive em judgeGate.ts (grep confirmou)

## Plano
1. Fase 0: inventário audit-first → relatório de gap
2. Design confirmação
3. Implementação B (assinatura gray-zone, candidatura, promoção 1-toque)
4. Implementação C (gate pré-execução, HOLD notify, IDS rules)
5. Red-then-green proofs, E2E, fechamento

## Log
- [2026-09-25] Sessão iniciada. Missão lida. Mapa de arquivos-chave confirmado (judgeGate 50KB, hooks em eng-mcp/.claude/hooks/, audit /data/audit/ host-side: git-merge.jsonl, memory-store.jsonl, ship-lock.jsonl, tool-errors.jsonl — judge.jsonl NÃO visto no host; vive dentro do container do MCP server).
## Fase 0 — achados principais (2026-09-25)
- Gate roda CLIENT-side no hook (judge-hook.mjs importa judgeGate.ts do repo DEPLOYADO /opt/memoryos/eng-mcp; mudanças só chegam a produção após release pipeline v110).
- Volume de audit REAL: /opt/eng-mcp-release-data/production/audit/ (= /data/audit no container). judge.jsonl 567KB ativo. manifests.jsonl tem eventos preauth create/refused + hook match (commandSha16, session).
- ALLOWLIST_VERSION='band1-allowlist-v1' (judgeGate.ts:305). Bandas preToolUse: band3 denylist (763) → CONSEQUENCE_AUTO policy (decisionForOperatorRoute 675: allow salvo JUDGE_CONSEQUENCE_POLICY=operator; unattended=deny) → manifest seam (786) → band1 (810) → band1 legacy (825) → band2 gray judge (837-887).
- Manifest seam JÁ existe (peça A) e JÁ audita matches em manifests.jsonl (hook buildManifestCheck). Banda 3 roda ANTES do manifesto (consequência nunca entra em manifesto) ✓.
- judge.jsonl server-side audita TODA engineering.judge.evaluate (verdict string com 4 q_* probs, cost, latency) — C1 pode só usar.
- notifyHermes: schema {summary≤500, status?}; dedupe 10min server-side por (status+summary); cooldown 60s; budget/hora.
- Registry: credencial do hook (operator-2026-09-20) NÃO tem engineering:notify:hermes → C2 gate→notify falha honesta até operador conceder scope (pendência de operador).
- Hooks de produção apontam para /opt/memoryos/eng-mcp (checkout deployado), server-url http://127.0.0.1:8787/mcp, timeout 5s, watchdog 4s.
- NÃO existe evidenceSink wired no hook de produção → decisões de rota do gate (band1/band3/manifest/band2) hoje NÃO deixam trilha client-side (manifests.jsonl match = única exceção). B1 precisará de trail writer próprio.
- GitNexus não indexa este worktree (sem .gitnexus em eng-mcp do worktree).

## DESIGN DECIDIDO (2026-09-25)
- **C1**: manifesto match → 1 judge.evaluate (mesmas BAND2_QUESTIONS); safeScore>=0.6 (JUDGE_ESCALATE_THRESHOLD) → allow `MANIFEST_PREAUTH_GO`; <0.6 OU erro do juiz → HOLD (ask/deny) — exceção fail-closed ESCOPADA ao caminho do manifesto (não é re-litigar CONSEQUENCE_AUTO, que governa só a rota de consequência/band-3). Suporte: missão exige "HOLD com escalada, MESMO pre-aprovado" + prova 2.
- **Out-of-manifest HOLD (prova 1 + E2E-2)**: novo seam `missionContext` (hook informa missão ativa via JUDGE_HOOK_MISSION + loadActiveManifests). Quando missão ativa e comando NÃO casou manifesto e NÃO é band-1: judge triagem só p/ contexto (score/reasons no notify) → HOLD incondicional (mesmo score 0.99 — plano aprovado é o manifesto; desvio escala). Band-1 inerte segue allow.
- **C2**: módulo `src/harness/holdNotifier.ts` — notify.hermes {summary<=500, status:'blocked'} em 3 tipos de HOLD (band-3 ask/deny, manifest NO-GO, out-of-manifest). Idempotente por holdKey=sha16(tipo|missão|commandSha16): re-notify máx 10min (HOLD_NOTIFY_MIN_INTERVAL_MS), estado persistido na própria trilha hold-notifications.jsonl. JudgeToolName ganha 'engineering.notify.hermes'. Scope gap (credencial do hook sem engineering:notify:hermes) → delivered:false honesto + pendência de operador; decisão de HOLD não depende do notify.
- **B1**: seam `signatureSink` no gate; grava em promotion-signatures.jsonl {at, key, commandSha16, fileScope, category, mission, session}. key = sha16(normCmd+'|'+fileScope+'|'+category); fileScope = tokens com '/' ordenados/dedup; category = BAND2_GRAY_AUTO|MEDIUM|LOW.
- **B2**: `promotionCandidates(dir)` scan determinístico (count>=3 && fontes distintas(mission??session)>=2); `scripts/promotion-candidates.mjs` para o fechamento listar. Promoção NUNCA automática.
- **B3**: promoção = edição em código (regra na allowlist + comentário PROMOTED: signature=<hash16> + ALLOWLIST_VERSION bump + contract test) + deploy. Prova estrutural: judgeGate.ts não tem primitiva de escrita em runtime (teste contrato).
- **Hook wiring**: evidenceSink → gate-routes.jsonl (trilha de rotas p/ C3-R1), signatureSink → promotion-signatures.jsonl, holdNotifier, missionContext — todos no judge-hook.mjs com fail-open.
- **C3 (securityIds)**: 3 features determinísticas ALARM-only: GATE_ROUTE_WITHOUT_JUDGE_AUDIT (route band2-gray-auto sem evaluate n_claims=4 no judge.jsonl da janela), MANIFEST_WINDOW_EXPIRED (match com expiresAt < at), MANIFEST_OPERATION_DIVERGENT (patternId fora do operationIds do create da missão).

## Log 2 (implementação)
- [2026-09-25] holdNotifier.ts (C2) completo; promotionSignatures.ts (B1/B2) completo (da sessão anterior).
- judgeGate.ts editado: seams missionContext/signatureSink/holdNotifier em JudgeGateConfig; HOLD out-of-manifest nas 2 ramificações band-2 (erro do juiz e pós-score) + band-3 notify; C1 GO/NO-GO no caminho do manifesto (MANIFEST_PREAUTH_GO / MANIFEST_HOLD_NOGO); recordSignature em AUTO/MEDIUM/LOW; session de input.session_id (12 chars).
- judge-hook.mjs wiring COMPLETO: manifest module load-once compartilhado (buildManifestCheck(env,base,mm) + expiresAt na linha de match p/ C3), buildGateExtras (evidenceSink→gate-routes.jsonl, signatureSink→promotion-signatures.jsonl, holdNotifier→hold-notifications.jsonl com notifyClient dedicado que NÃO empurra p/ failures[], missionContext via loadActiveManifests), seams passados ao buildJudgeGate. Tudo fail-open; códigos: MANIFEST_MODULE_LOAD_FAILED / PROMOTION_MODULE_LOAD_FAILED / HOLD_MODULE_LOAD_FAILED.
- Pendência imediata: typecheck + testes red-then-green (promotionSignatures.test.ts, holdNotifier.test.ts, judgeHooks.test.ts extensões C1/out-of-manifest, securityIds C3) contra baseline (40 typecheck errors, suite 1392/1386/0F).

## Log 3 (testes red-then-green — 2026-09-25)
- test/holdNotifier.test.ts REESCRITO do zero (draft quebrado substituído): 8 testes, GREEN 8/8. Prova 5: 2 HOLDs do mesmo evento = 1 única notificação (calls.length==1); dedupe sobrevive a reinício de processo (estado = trilha); expiração de intervalo → re-notify; erro de notify → delivered:false + outcome 'error:<código>' + linha na trilha; eventos distintos (comando/kind/missão) notificam cada um.
- test/promotionSignatures.test.ts CRIADO: 15 testes, GREEN 15/15. Prova 3: 2 reps → NÃO listado; 3 reps 1 fonte → NÃO listado; 3 reps × 2 missões → LISTADO (count/sources/window); fallback session; janela 30d; MEDIUM também assina; linhas corruptas toleradas. B3 estrutural: judgeGate.ts SEM primitiva de escrita em disco (appendFileSync/writeFileSync/mkdirSync/rmSync/openSync = zero hits) e sem import de promotionSignatures.
- RED-THEN-GREEN provado: mutações mínimas (missionCtx branch desligado; MANIFEST_HOLD_NOGO→DISABLED; MIN_REPEATS=2; idempotência do hold desligada) → judgeHooks 35/4 RED, promotionSignatures 14/1 RED, holdNotifier 6/2 RED; restauração byte-idêntica (cmp OK) → GREEN 39/0, 15/0, 8/0.
- Pendência seguinte: C3 (securityIds — verificar operationIds do create em missionPreauth.ts), suite completa vs baseline, B2 CLI, commit+pipeline+E2E.

## Log 4 (C3 + B2 CLI — 2026-09-25)
- **C3 IMPLEMENTADO** em src/securityIds.ts: `computeManifestAlarms(windowStartMs, nowMs)` standalone/determinístico/sensor-only sobre gate-routes.jsonl + manifests.jsonl + judge.jsonl (auditDir(), ENG_MCP_IDS_AUDIT_DIR). R1 GATE_ROUTE_WITHOUT_JUDGE_AUDIT: routes band-2 route=allow no gate-routes vs evaluates gate-shaped no judge.jsonl (verdict contém "q_destructive"; ERROR não conta) — alarme quando allowCount > evaluates (cobre 0 e parcial). R2 MANIFEST_WINDOW_EXPIRED: match com expMs <= atMs (borda = expirado, fail-closed). R3 MANIFEST_OPERATION_DIVERGENT: patternId do match (line.mission ?? line.manifest) fora do operationIds do create mais recente da missão. Judge NUNCA chamado; fail-open com alarmsNote; cap 50 amostras; alarmId = sha16(code|at|key).
- Wired em runSecurityIds: SecurityIdsResult ganha alarms/alarmCount/alarmsNote; out-audit ids.jsonl carrega alarms/alarmCount/alarmsNote/alarmsAdvisory. NÃO registrado em IDS_TRAILS (linhas do gate usam `at`, extractEvent exige `ts`; enum de 6 trilhas estável).
- test/securityIdsManifestAlarms.test.ts: 17 testes GREEN 17/17 (advisory, R1×6, R2×3, R3×3, corrupt lines, cap 60→50, alarmId determinístico, e2e runSecurityIds + out-audit). Fix inicial: matemática do fixture R2 invertida (expiresAt depois de at = não expirado) → NOW-3H; 4 falhas → 17/0.
- RED-THEN-GREEN provado p/ C3: mutações (R1 `if(false)`, R2 `if(false)`, R3 condição enfraquecida) → 8 pass/9 fail RED; restauração /tmp/ids.keep byte-idêntica (cmp OK) → 17/0 GREEN.
- **B2 CLI** scripts/promotion-candidates.mjs reescrito e validado: bug de redeclaração (const trailFile + hoisted function trailFile = SyntaxError latente) eliminado; campo correto `commandPreview` (interface PromotionCandidate confirmada em src/harness/promotionSignatures.ts:124: key/commandPreview/fileScope/category/count/sources/firstAt/lastAt); pretty não é mais JSON-stringified. Smoke: 3 reps × 3 missões → 1 candidato listado; 2 reps × 2 missões → 0; trilha inexistente → lista vazia exit 0 (fail-open); --json OK.
- Typecheck: 41 erros = paridade com main (zero em securityIds.ts, zero novos).
- Suite completa (1ª rodada): 1426 pass / **11 fail** — INESPERADO (baseline 0F). Re-run capturando "not ok" em andamento; investigar antes do commit.
- Pendências de operador: scope engineering:notify:hermes na credencial do hook (operator-2026-09-20); push pós-merge.

## Log 5 (tríage da suite — 2026-09-25)
- **Bug REAL do wiring anterior: judge-hook.mjs linha 289 SyntaxError** — `env.JUDGE_HOOK_MISSION || loaded.active[0]?.mission ?? null` mistura `||` e `??` sem parênteses (SyntaxError em Node). O hook INTEIRO morria no load (exit 1) → 8 subtestes HOOKS-VPS-01 + teste child-process do AUTO-RUN-01A vermelhos. Fix: `env.JUDGE_HOOK_MISSION || (loaded.active[0]?.mission ?? null)`. grep confirma único ponto.
- **Assertions stale no missionPreauth.test.ts** (pré-C1): label `MANIFEST_PREAUTH:` → `MANIFEST_PREAUTH_GO:`/`MANIFEST_HOLD_NOGO:` (3 pontos + retitulados); child-process agora prova o fail-closed C1 no nível do hook (juiz morto → 'ask' + MANIFEST_HOLD_NOGO); assertion de evidence (linha 122) ainda filtrava prefixo morto `judge_gate:manifest:<mission>:` → C1 grava `judge_gate:manifest-go:<mission>:<patternId>` → fix p/ novo prefixo (3 entradas, todas route=allow). Debug /tmp/dbg-c1.mts provou que o caminho do judge está OK (3 calls) — a falha era só o filtro de evidência.
- **zz-proxy-live "LIVE /mcp-proxy" = falha pré-existente de ambiente** (não causada pela missão): 403 "Forbidden" na chamada read-only — idêntico no checkout MAIN (/opt/memoryos/eng-mcp), mesmo código, secret local `/data/credentials/hermes-proxy-secret` não bate com o server live agora. Teste é probe live zz-convention (skips em container). Não é regressão.
- Estado após fixes: missionPreauth + hooksPortable + securityIdsManifestAlarms = 42 pass / 0 fail.

## Log 6 (commit + merge + pipeline + E2E — 2026-09-25)
- **Commit da missão:** `b8fd622f999b26f50e594fed776898fd9cebd6fb` (12 arquivos, +1814/−26; Co-Authored-By: Claude Code). Excluídos do commit: tsconfig.json (cópia local), .glgpd/, release-state.json, *.token.json.
- **Governed merge:** engineering.git.merge PLAN → layer AUTO_FF (main estritamente atrás por 1 commit) → execute: main fast-forwarded 3c933c0a → b8fd622f, zero mutation reportado (porcelain byte-idêntico).
- **Pipeline:** primeira invocação pós-merge por timeout do cliente, mas o runner continuou (ship lock do holder operator-2026-09-20) e convergiu; re-invocação devolveu testSourceHash `f8c36be6c01e…` com TEST SKIPPED (suite inputs idênticos já gravados), build/candidate PASS, deploy job `bf03632e-c6e5-4bfc-8b38-707dfb8838f6` → SUCCESS + smoke PASS; release final `eng-mcp-candidate:candidate-20260925024015147-f8c36be6c01e`, `converged:true`, catálogo v109/109 tools.
- **Main HEAD verificado:** `b8fd622f999b` em /opt/memoryos (mesmo SHA do worktree) — produção roda o código da missão.
- **E2E-1 (op dentro do manifesto auto-executa com audit):** manifesto `AUTO-RUN-01BC-E2E` (hash16 `88830941ebfff8ee`, 1 op `node -e "console.log(1)"`, expira 03:11) criado via engineering.mission.preauth (PLAN → CREATED 0600). Comando em-manifesto executou (output `1`); audit: match line em manifests.jsonl (patternId e2e-node-eval, commandSha16 21faed43279c012e, session fad82569-bd4) + `judge_gate:manifest-go:AUTO-RUN-01BC-E2E:e2e-node-eval` route=allow safeScore=0.9 em gate-routes.jsonl (juiz LIVE).
- **E2E-2 (comando fora do manifesto → HOLD + notify):** `node -e "console.log(2)"` → route `manifest_out_of_scope` route=hold com safeScore 0.91 (HOLD mesmo com score alto — plano aprovado É o manifesto) + hold-notifications.jsonl `hold_notify` kind=manifest_out_of_scope mission=AUTO-RUN-01BC-E2E holdKey `b90f4e95aed4c0c2` delivered:false outcome `error:AUTHORIZATION_SCOPE_REQUIRED` (honesto — credencial do hook sem engineering:notify:hermes = pendência do operador; decisão de HOLD independente do notify).
- **Prova 5 em produção (idempotência):** segundo HOLD do mesmo comando → `outcome:"idempotent"`, zero novos envios (holdKey b90f4e95aed4c0c2 aparece 2x na trilha, só 1ª com tentativa de send).
- Manifesto E2E revogado às 02:41:40 (status REVOKED).
- Pendências de operador (reportadas no fechamento): (1) scope engineering:notify:hermes na credencial do hook (operator-2026-09-20) até lá C2 entrega delivered:false honesto; (2) push origin/main (tier-3).

## Log 7 (fechamento/VERIFY-01 — 2026-09-25)
- **Pipeline re-convergiu** em main HEAD d6c2905a (docs-only): release `eng-mcp-candidate:candidate-20260925024222699-f8c36be6c01e`, deploy job `4dd7b813-4e2a-42a6-8d7f-b36b72aebaf6` SUCCESS 02:42:40, smoke PASS, `converged:true`, catálogo v109/109 tools, mesmo sourceHash `f8c36be6c01e…` (test SKIPPED — suite inputs idênticos já gravados).
- **registrySha16 = `7cc1313621a4ffd0`** — sha256 dos BYTES de /opt/eng-mcp-release-data/production/tokens.json (7cc1313621a4ffd0a755ce7f8a3bc9df1f524c4461545c29ea03758a563aa83f), cross-confirmado via registry.entry.revoke PLAN em goose-eng-mcp-2 (`registrySha16Before` idêntico). Zero mutation. Nota: /data/tokens.json do host (360B, Sep 9) é vestígio, NÃO o registry vivo. Self-grant PLAN para operator-2026-09-20 → REGISTRY_SELF_GRANT_REFUSED (identidade da sessão = alvo — grant de scope é rota de operador fora da tool).
- **Camada 0 (judge.verify):** 1ª rodada HAS_CONTRADICTIONS (c1-commit, c4-tests contraditados) → spot-checks layer-1: git.inspect_commit b8fd622f stat CONFIRMOU c1 (parent 3c933c0a, 12 files +1814/−26); c4 reformulada com aritmética fechada (1438 = 1432P + 0F + 6skip) → 2ª rodada: MIXED, 3 supported / 0 contradicted / 1 not_addressed. c8 fechada por leitura direta da trilha: hold-notifications.jsonl tem 17 linhas delivered:false; holdKey b90f4e95aed4c0c2 = exatamente 2 linhas (1ª send com AUTHORIZATION_SCOPE_REQUIRED, 2ª outcome idempotent).
- **Release FINAL da produção:** `eng-mcp-candidate:candidate-20260925024735563-f8c36be6c01e`, deploy job `f8d1232b-c940-4c34-bab3-b452a6bac771` SUCCESS, smoke PASS, `converged:true` (supercede a release intermediária candidate-20260925024222699 do main d6c2905a; mesmo sourceHash — docs-only não altera suiteInputsHash 75df02a93f19).
- **engineering.memory.capture** OK: projectId `memoryos`, memoryId `6c74aea6-65bd-4d79-a61f-fa4b71e1f464`, FINGERPRINT no summary, gate admit 0.83.
- Missão FECHADA. Reporte final entregue ao operador (pt-BR) com vereditos, 5 provas e pendências.
