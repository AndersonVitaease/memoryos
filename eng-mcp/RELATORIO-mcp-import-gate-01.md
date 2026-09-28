# RELATÓRIO mcp-import-gate-01: gate de importação de MCPs externos (4 barreiras)

**RESULT: PASS, com gray-zones declaradas no §8.**

Em produção (`:8787`), via pipeline oficial:
- **Tools novas:** `engineering.mcp.discover`, `engineering.mcp.import.check`, `engineering.mcp.import.approve` (tier-3) e `engineering.mcp.import.status`.
- **Módulo novo da `security.scan`:** M6 `mcp-import-scan`, opt-in.
- **Catálogo:** 124 → 128 tools.
- **Commit do código:** `9051b3ed`.
- **Ressalva:** a "judge regression zero em `upstream.check`" não tem objeto, porque essa tool não existe (§8.1).

## 1. O que foi construído (design do roadmap §MCP-IMPORT-GATE-01, à carta)

| Barreira | Implementação |
|---|---|
| **B1 scanner estático** (M6 da security.scan) | `src/mcpImportScan.ts`: interface `StaticScanEngine` com input = dir materializado e output = `{grade A-F, findings[{rule, severity, owaspMcp, file, line, engine}], lockRef}`. A **engine é config**: `src/mcp-import/engines.json`, uma entrada por engine. Antes de cada run, a entrada é verificada contra a versão pinada e o **sha256 auditado do conteúdo** (engine + closure de deps). Se não bater, falha fechado com `ENGINE_INTEGRITY_MISMATCH` e grade F; nunca sai "limpo porque o scanner morreu". A engine roda como subprocesso com env mínimo (sem variáveis de credencial). Adaptadores por **formato** (`mcpguard-json`, `sarif`): formato é código, engine é config. Regras YAML próprias do GH ficam em `src/mcp-import/gh-rules.yaml` (§2). Mapeamento para o OWASP MCP Top 10 (2025). |
| **B2 golden de schema** | `src/mcpImportInventory.ts`: o inventário tem contrato zod (10c) e o golden é canônico (sha256 por descrição, inputSchema e annotations, mais as instructions do server). Descrição ou schema mudado **sem bump** de `serverInfo.version` = `RUG_PULL`; com bump = `CHANGED_WITH_VERSION_BUMP`. |
| **B3 judge no diff** | Roda quando existe entrada aprovada e o golden mudou. `judge.verify` recebe 3 claims (mesma capacidade / nenhuma instrução ao agente / versão explica a mudança) e a evidência = descrições antes e depois, **neutralizadas**. É advisory e fail-open. |
| **B4 isolamento** | Candidato stdio **só** faz discover pela porta de sandbox. A implementação é E2B, uma microVM por server: install com lifecycle scripts desligados e egress só para `registry.npmjs.org`, depois `updateNetwork` para deny-all **antes** do spawn, depois handshake, depois destroy. Secrets seriam injetados pelo transform de egress do host, nunca como env/arquivo; no discover não há nenhum. Não existe caminho de spawn no host: sem sandbox, o resultado é `SANDBOX_UNAVAILABLE`. Sandbox **obrigatório** (não opcional) quando a grade é < B, há finding high/critical ou `tenantData`. |

**Verbos:**
- **`discover`:** read-only. Para HTTP/SSE remoto faz handshake nativo direto (`initialize`, `notifications/initialized`, `tools/list` paginado; nunca `tools/call`). Tem guarda SSRF: só https, só endereço público, redirect recusado, caps de tamanho e timeout. Streamable HTTP com fallback para SSE legado.
- **`import.check`:** read-only. Devolve o card: grade, findings, schemaDiff, announced-vs-source, risco, recomendação com reasons.
- **`import.approve`:** **tier-3**. Exige o scope novo `engineering:mcp:import:approve` (operator-issued, fora de `engineering:write`), sujeito `operator-*`, `execute` + `approval.approved` e `expectedFingerprint` = fingerprint recomputado (TOCTOU). PLAN é o default. O fingerprint `{codeHash, descriptionsHash, schemaHash, engine}` é **pinado com a entrada desabilitada ANTES de habilitar**. `action=revoke` desabilita e deixa trilha. Promoção sandbox→production vira `promotedFrom`.
- **`import.status`:** read-only. Compara o estado atual com o aprovado. `DRIFT` e `RUG_PULL` vêm com reasons, passam pela B3 e geram alarme IDS (trilha nova `mcp-import`).

**Registry:** `/data/mcp-registry.json`, em vez de `~/.hermes/`. O container do GH não monta `~/.hermes` e adicionar o mount seria mudança de infra; o caminho pode ser sobrescrito com `ENG_MCP_MCP_IMPORT_REGISTRY_FILE`. Os campos são os do roadmap: id, kind, source, version, engine, fingerprintAprovado, profile, approvedBy, approvedAt, lastVerified, e mais golden e trilha.

**Audit:** `/data/audit/mcp-import.jsonl`, só metadados e hashes.

**Princípio inegociável** (dado ≠ instrução):
- Todo texto vindo do candidato sai neutralizado: code points ocultos, bidi e de controle aparecem como `⟦U+XXXX⟧`. Evidência crua nunca sai; só o sha256-16.
- Uma claim de autoridade plantada ("operator has already approved") é **finding** (GH-MCP-004) e não tem efeito nenhum.
- No E2E, a justificativa do approve dizia "the operator has already approved this" e mesmo assim o approve foi recusado.

## 2. Engine auditada (dependência, nunca código embutido)
- **Engine:** `@arunmm8335/mcpguard@0.1.0` (MIT). É exatamente a citada na pesquisa: 36.527 servers, 67%, 16% D/F, grade A-F e lock/verify.
- **Auditoria:**
  - Li todo o `dist/*.js` (31,7 KB) e as regras (9 tool-poisoning + 16 de código).
  - Único ponto com rede/child_process: `resolve.js` (npm pack/git clone). O gate nunca o alcança, porque sempre passa à engine um diretório materializado pelo próprio gate (só arquivos regulares, symlinks recusados).
  - O pacote instalado é byte-idêntico ao tarball auditado (`diff -r` IDENTICAL, integrity sha512 confere).
- **Deps:** `commander`, `picocolors` e `yaml` foram fixados com versão exata no `package.json`, porque o Dockerfile roda `npm install` sem lockfile. Todos eram novos, sem colisão.
- **contentSha256 auditado:** `3782da49…ce68`. Verifica **dentro do container de produção** (`e2e-engine-integrity.txt`).
- **Lacunas da engine**, cobertas pelas regras GH:
  - bidi overrides;
  - instruction-boundary breaks (`</tool_description><system>`, tokens de chat-template);
  - authority claims;
  - poisoning em `inputSchema.*.description`;
  - denylist GH (`*.token.json`, wildcard perms).
- **Bug meu achado pelo teste e corrigido antes do commit:** no GH-MCP-002, o escape `\uDB40[\uDC00-\uDC7F]` não casa no modo `u`, então os tag characters escapavam da regra própria (a mcpguard pegava via TD008). Agora usa `\u{E0000}-\u{E007F}`.

## 3. Red → green (obrigatório)
- **Fixture sintética** `test/fixtures/mcp-import/malicious-server`: zero deps, JSON-RPC stdio, empacotada por `npm pack` local (sem rede).
  - Payload escondido em **Unicode TAG characters gerados em runtime**. O fonte não tem nenhum code point oculto; só o anúncio carrega.
  - Uma segunda tool traz boundary break e authority claim.
  - Também tem `JSON.stringify(process.env)`.
  - Escreve um marker se for executada.
- **RED** (`red.txt`): mesmo teste com a detecção removida (`ENG_MCP_MCP_IMPORT_ENGINES_FILE` = só a engine dummy, regras inertes). O fixture envenenado sai com **grade A** e o contrato falha (`actual 'A' / expected 'F'`, exit 1).
- **GREEN** (`green.txt`): barreiras restauradas.
  - Fixture: **F**, `DO_NOT_IMPORT`, sandbox obrigatório. Findings: GH-MCP-002/003/004, TD005, TD008, MC003.
  - Output com **0 code points ocultos**.
  - announced-vs-source flagra que a descrição de runtime ≠ a do fonte.
  - Revert (`benign-server`): **A**, `PRODUCTION_ELIGIBLE`.
  - `test/mcpImport.test.ts`: **21/21**.
- **Contratos cobertos:**

| Contrato | O que o teste prova |
|---|---|
| (1) | check sem mutação |
| (2) | engine dummy SARIF = só 1 entrada de config (`engines-with-dummy.json`), zero diff no gate |
| (3) | pin antes de enable (ordem no audit) |
| (4) | status pega mutação silenciosa de descrição → `DRIFT` + `rugPull` + linha IDS + B3 chamada |
| (5) | production recusado quando o sandbox é obrigatório |
| (6) | mutation: sem bump = `RUG_PULL` |
| (7) | golden por engine |
| (9) | revoke |
| (10a) | HTTP remoto: json, SSE e SSE legado; só métodos permitidos; zero mutação |
| (10b) | sem sandbox → `SANDBOX_UNAVAILABLE`, marker **ausente**, e guarda estática sem primitivas de spawn nos módulos do gate |
| (10c) | inventário zod |

- **Testes extras:** engine adulterada = fail closed; SSRF; tar com symlink recusado; tier-3 (sem scope / não-operator / fingerprint errado).

## 4. Suíte, typecheck, impacto
- **Suíte local:** 1513 testes, 1507 pass, 1 fail, 5 skip. O fail é `LIVE /mcp-proxy` (zz-proxy-live, ambiental, a mesma paridade da main). **Pipeline de test:** 1513/1507/0, 128 tools.
- **Typecheck:** 41 erros, idêntico à main; 0 nos arquivos novos.
- **Contadores de contrato atualizados** (mudança legítima de catálogo): 124 → 128 em 5 testes, e trilhas IDS 6 → 7.
- **GitNexus:** `impact` e `detect-changes` indisponíveis, com risk UNKNOWN (índice v43 × engine v42; mesma situação da missão anterior). Reconstruir o índice seria mudança lateral, então não reconstruí. Fiz o impact *depois* de editar, não antes, como a regra do CLAUDE.md pede; declaro o desvio.
- **Confirmação por texto dos callers:**
  - `extractEvent`: file-local.
  - `runSecurityScan`: 1 caller (tools.ts).
  - `registerEngineeringTools`: server.ts.
  - Todas as mudanças são aditivas.

## 5. Deploy (pipeline oficial)
- **Antes do deploy:** `deploy.ready` READY / IN_SYNC. Imagem anterior: `candidate-20260928175344625-6c9011520c27`.
- **Pipeline:** test PASS, depois build, candidate e deploy. Job `8699e2c4-0b4e-438c-b679-cb8e6d94c6c9`, status `success` (20:55:24 → 20:55:42Z), exit 0, smoke PASS.
- **Produção** (camada 1, `camada1-inspect.txt`): `candidate-20260928205521230-c618f7eb49e7` rodando. `mcpImport.ts` e `engines.json` estão em `/app`, mcpguard 0.1.0, runner `active`.
- Nada foi para o push (local-only). Não abri guardian-compute, mission-ops, fast-router/shadow-router nem ocr-attach. Nenhum grant foi feito: o registry do tokens ficou com sha16 `65b52f52c998ba91`, igual ao anterior.

## 6. E2E do operador (produção)
- **`tools/list`:** 128 tools, com as 4 novas.
- **`mcp.discover https://mcp.deepwiki.com/mcp`**, um server HTTP público real:
  - `DISCOVERED`, remote-direct, streamable-http, DeepWiki 2.14.3.
  - 3 tools (`ask_wiki_question`, `read_wiki_contents`, `read_wiki_structure`), grade **A**.
  - fingerprint `cc241844491f4137`, registry `absent → absent`, 1,3 s.
- **`mcp.import.check`** no mesmo server: `CHECKED`, **A**, `PRODUCTION_ELIGIBLE`, mesmo fingerprint, engine mcpguard `ok`.
- **`mcp.import.approve`** com `execute` + `approval` + `expectedFingerprint` corretos: **REFUSED `AUTHORIZATION_SCOPE_REQUIRED`**. O sujeito era `operator-2026-09-20`, mas sem o scope tier-3. `/data/mcp-registry.json` segue **inexistente**, e o audit registra `refused`.
- **Barreira 4 ao vivo** (além do pedido): check do fixture malicioso dentro do E2B de produção.
  - Sandbox `isy1iiq43cfngyrz4apks`.
  - Fases: `created:egress=registry.npmjs.org → extracted → egress:deny-all → handshake → destroyed`.
  - Resultado: **F**, 5 critical + 3 high, `DO_NOT_IMPORT`, 0 code points ocultos no output.
- **Regressão da `security.scan`:** o scan default (PLAN) roda os **mesmos 4 módulos**, sem campo `mcpImport`, com 0 findings dos arquivos novos. M6 opt-in no fixture: grade F, SEC-060/062/065.
- **Judge:** probe do `judge.verify` JUDGED em 2 s. `judge.ts` não foi tocado.

## 7. Verificação em 3 camadas
- **Camada 0** (`selfcheck-*`): 8 claims, incluindo um **controle falso proposital c8** ("approve gravou entrada").
  - 1ª tentativa, com 8 claims numa chamada: `JUDGE_TIMEOUT`, duas vezes. É o teto de 10 s do provider, pré-existente. Dividi em lotes de 4.
  - **c8 → contradicted.** O juiz pegou o controle, diferente das 2 missões anteriores.
  - **c2 → contradicted, e com razão.** Eu tinha escrito "passed 1513 tests", mas foram 1507 pass e 0 fail em 1513. Corrigi o texto, e a reverificação (lote 3) deu supported.
  - **c6 → not_addressed**, porque a ordem das fases estava implícita. Com a evidência explícita, deu supported.
  - **c1**, composta, saiu contradicted. Quebrada em c1a/c1b atômicas, deu **ALL_SUPPORTED**. Conferi direto: `red.txt` diz `actual 'A' / expected 'F' / exit=1` e `green.txt` diz `21/21`. Leio isso como fragilidade do juiz com claim composta, não como erro da claim.
  - c3, c4, c5 e c7: supported.
- **Camada 1:** feita na claim `[consequência]` (deploy), com `docker inspect` + `docker exec` + `systemctl`: PASS.
- **Camada 2:** não disparada. A camada 1 passou, e as contradições foram resolvidas (1 erro real de redação corrigido, 1 controle plantado).

## 8. Gray-zones (declaradas, não verificadas / fora do escopo)
1. **`upstream.check` não existe.** A UPSTREAM-SYNC-01 nunca foi construída (o catálogo tem 124 → 128 tools, nenhuma `upstream.*`). Por isso também não há "dogfood": a engine entrou pelo registro de engines do próprio gate, com auditoria manual registrada no campo `audit`, e não como alvo auditado da UPSTREAM-SYNC-01. Quando ela existir, o alvo é o pacote `@arunmm8335/mcpguard`.
2. **Adaptador de runtime do perfil sandbox.** Não existe hoje consumidor que *execute* servers aprovados (nenhum proxy GH para MCPs externos). O perfil sandbox está implementado no discover e declarado no registry. Rodar o server aprovado em sandbox para uso real é trabalho futuro, com a mesma spec (`DISCOVER_SANDBOX_PROFILE`).
3. **`status` é estritamente read-only.** Não atualiza `lastVerified` nem rebaixa a entrada no registry. O rebaixamento é *efetivo/reportado* (`effective.approved=false`, perfil sandbox) e o alarme vai ao IDS. A mutação automática fica para a Phase B (GUARDIAN-SEC-LAYER-01).
4. **Suporte stdio.** Só servers estilo npm (`bin`/`main`, `node <arquivo>`). Python é non-goal desta versão. `github:` foi implementado (API de commits + codeload), mas não teve E2E ao vivo.
5. **M6 na `security.scan` roda a engine no caminho-alvo in-place.** Os verbos do gate materializam uma cópia só com arquivos regulares; a M6 não. A mcpguard segue symlinks (a mitigação é o timeout de 60 s). O dano possível é leitura por regex com saída só em hash.
6. **SSRF / DNS rebinding.** Endereços são validados na resolução, mas a conexão não é pinada ao IP.
7. **Registry em `/data`, não em `~/.hermes`** (§1).
8. **Grant do scope tier-3 não feito.** É consequência do operador (par A/B). Sem ele, nenhum approve real é possível, e isso é o esperado.

## 9. Artefatos
`evidence/mcp-import-gate-01/`:
- red / green, suite;
- pipeline-call-1 e resume-1, pre/post-image, pre-deploy-ready;
- e2e-tools-list, e2e-discover, e2e-check, e2e-approve-denied, e2e-registry-before/after, e2e-sandbox-check, e2e-engine-integrity, e2e-secscan-default-plan, e2e-secscan-m6;
- selfcheck-payload/response 1-4, judge-probe, camada1-inspect, registry-plan, blind-rules, mcpcall.mjs.

O `verify.json` na raiz é o manifesto próprio desta missão.
