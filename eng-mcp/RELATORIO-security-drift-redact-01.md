# RELATÓRIO security-drift-redact-01: redaction no `drift.closed` (SECURITY-SCAN)

**RESULT: PASS.** O fix está em produção via pipeline oficial, com prova E2E. Duas ressalvas declaradas: o falso-positivo do juiz no controle c6 (§6) e a limpeza de whitespace que desbloqueou o pipeline (§3).

## 1. Defeito e fix
- Em `src/securityScan.ts`, `applyDrift`, a linha 758 original montava `drift.closed` copiando `findingId/checkId/severity/local` direto do snapshot ANTERIOR. Isso acontecia depois do `sanitizeState()`, então a redaction não cobria esses campos.
- Efeito: um snapshot legado ou pré-sanitização com secret no `local` fazia o scan inteiro falhar fechado (`SEC_OUTPUT_CONTAMINATION`). Se o guard não pegasse, o valor vazaria. O vazamento para o disco não existia, porque o snapshot novo já é escrito com locals sanitizados.
- Fix: o snapshot anterior passa a ser tratado como input não confiável. Os 4 campos ecoados passam por `echo = v => redactSecretText(String(v ?? ""))`. Um arquivo renomeado pela hygiene agora sai como `…/github-pat[sec-redacted:github-finegrained-token]`. Nenhum outro campo ecoa snapshot: `previousAt` é o `ts` e já é validado como shape.
- Impacto: o grafo do GitNexus ficou indisponível (índice storage v43 contra engine v42, risk UNKNOWN). Confirmei por texto que `applyDrift` é file-local e tem um único caller (`runSecurityScan`).
- Commit: `eda725a3`.

## 2. Teste red → green
- Teste novo: `test/securityScan.test.ts` #14 "drift.closed: raw secret in a PRIOR snapshot local…". O cenário é um scan limpo, seguido de um snapshot sujo semeado com um PAT sintético no `local`, seguido de um re-scan.
- RED no código de `HEAD~1` (`evidence/.../red.txt`): `SEC_OUTPUT_CONTAMINATION`.
- GREEN: 16/16 no securityScan. O `local` fechado carrega o marcador, e output, audit e snapshot reescrito ficam limpos.
- Suíte do repo: 1492 testes, 1486 pass, 1 fail, 5 skip. O fail é `LIVE /mcp-proxy` (zz-proxy-live, ambiental, o mesmo da main). Typecheck: 41 erros, igual à main (medido com stash), e 0 deles em securityScan. MEM-GUARD ok.

## 3. Bloqueio do pipeline (diagnosticado, não é probe stale)
- A 1ª chamada ao `engineering.release.pipeline` foi recusada no test com `DIFF_CHECK_FAILED:evidence/memory-capture-scope-01/green.txt:286`.
- Causa: o `whitespaceCheck` do runner rejeita arquivos rastreados com espaço no fim de linha. A missão anterior commitou saída de git (`# hint: `) no próprio commit de relatório, depois do seu deploy.
- Correção: commit `7e9d19e5`, que remove espaços finais em `green.txt` e `suite.txt` daquela evidência. `git diff --ignore-space-at-eol` ficou vazio, ou seja, o conteúdo não mudou.
- Recomendação (fora do escopo, não feita): excluir `evidence/` do `whitespaceCheck`, ou fazer as missões limparem a evidência antes do commit. A evidência desta missão já foi limpa, e o verify.json checa isso.

## 4. Deploy (pipeline oficial, autorizado no contrato)
- Antes do deploy: `deploy.ready` READY / IN_SYNC. Imagem anterior: `candidate-20260928171657168-47f9965d60ea`.
- Pipeline: test PASS (1492/1486/0, 124 tools), build, candidate e deploy 202, job `a9ab8ad2-210a-4f2d-900f-a4bb141f0b17`.
- Resume: status `success` (17:53:47 → 17:54:05Z, exit 0) e smoke PASS.
- Em produção (`docker inspect`): `true 2026-09-28T17:53:58Z eng-mcp-candidate:candidate-20260928175344625-6c9011520c27`. `docker exec grep` confirma o fix em `/app/src/securityScan.ts`.
- Não reiniciei guardian, bridge, sentinel nem gpu-watchdog. judge:read e o memory gate não foram tocados. Nada foi para o push.

## 5. Prova E2E pós-deploy (`evidence/.../e2e-drift.sh`, padrão smoke-p5)
- O fixture é sintético, gerado em runtime. Só o sha16 foi registrado: `4407ef5cd352ca91`. A PAT real nunca foi usada nem impressa.
- **scan1** (diretório com o PAT sintético no nome): sem valor cru no output, e o finding sai redigido.
- **scan2**: semeei um snapshot legado de produção com o valor CRU no `local` e removi o fixture. Resultado: `status SCANNED`, `drift.closed[0].local = /opt/memoryos/.secdrift-e2e-fixture/github-pat[sec-redacted:github-finegrained-token]`, `delta.closed 1`. O snapshot reescrito ficou limpo, e o audit de produção tem 0 ocorrências de `github_pat_`.
- No código antigo, esse mesmo cenário falha fechado, como mostra o teste red.
- Todos os artefatos do fixture foram removidos: o diretório e o snapshot `path-b060b688d013.json`.
- `smoke-p5` vps pós-deploy: PASS.
- Asserções condicionais: se nenhum finding existir, o probe não quebra.

## 6. Verificação em 3 camadas
- **Camada 0:** `judge.verify` retornou JUDGED ALL_SUPPORTED 6/6 (`selfcheck-response.json`). Isso também prova regressão zero do judge. **Porém a c6 era um controle falso proposital** ("o scan E2E fez 3 chamadas ao juiz"). A evidência diz `judgeCalls: 0`, e o juiz marcou supported. É o 2º falso-positivo do mesmo tipo hoje (antes, o c6 da memory-capture-scope-01). Por isso a camada 0 não vale como aceitação sozinha, e **a calibração do judge.verify para contradição numérica deveria virar missão**.
- **Camada 1:** feita direto nas claims de consequência. `docker inspect` retornou a imagem `candidate-20260928175344625-6c9011520c27` em Running. Pelo `docker exec grep`, o fix está no container. O grep no `e2e-scan2.json` mostra o marcador presente, e `/github_pat_/` está ausente.
- **Camada 2:** não disparada. A camada 1 passou, e a contradição só existia no controle plantado.
- **Gray-zones:** grafo de impacto indisponível (§1); única falha da suíte é `zz-proxy-live` (ambiental, paridade main).

## 7. Artefatos
`evidence/security-drift-redact-01/`: red, green, suite, pipeline-call-1/2/resume-1, pre/post-image, pre-deploy-ready, e2e-drift.sh/.txt, e2e-scan1/2, e2e-synthetic.sha16, smoke-p5.sh/.txt, selfcheck-payload/response, camada1-inspect, mcpcall.mjs. O verify.json está na raiz, com probes resistentes a deploys futuros: checam o fix no container em vez da tag da imagem.

FINGERPRINT {"missionId":"security-drift-redact-01","head":"<ver capture>","registrySha16":"65b52f52c998ba91","verdicts":{"camada0":{"aggregate":"ALL_SUPPORTED","counts":{"supported":6,"contradicted":0},"note":"c6 controle falso aceito — FP do juiz"},"camada1":"PASS"},"ts":"2026-09-28T18:00:00Z"}
