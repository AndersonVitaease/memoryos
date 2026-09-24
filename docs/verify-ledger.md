# VERIFY-01 — Verificação em 3 Camadas + Ledger de Estado Verificado

**Versão:** 1.0 · **Data:** 2026-09-24 · **Status:** Oficial (convenção operacional)
**Norma canônica:** `AGENTS.md` (raiz) — seção "3-layer verification + verified-state ledger (VERIFY-01, 2026-09-24)". Este documento operacionaliza a norma; em conflito, a norma prevalece.

---

## 1. Problema e objetivo

Cada relatório de missão era verificado pelo supervisor com **releitura integral** das trilhas que o agente executor (GH) já leu e já autoverificou — o operador paga 2x pelo mesmo trabalho. O caro é o turno frontier de releitura; os probes (read-only via conector local) e o Jev (~US$0,00002/veredito) são desprezíveis.

**Objetivo:** reduzir o custo de verificação por missão de "releitura integral" para "aceitação formal + 1–2 spot-checks", sem perder a auditoria independente.

**Escopo da convenção:** zero código novo de verificação, zero tool nova, catálogo permanece o que for (nada muda server-side). O fechamento usa o `engineering.memory.capture` EXISTENTE; o ledger viaja como linha `FINGERPRINT {json}` dentro do `summary`.

---

## 2. As 3 camadas

### Camada 0 — Aceitação por autoverificação (toda missão)

O relatório de fechamento do executor deve conter:

1. **Claims etiquetadas**: cada claim com `id` + texto; claims que afirmam efeito de produção (deploy/push/merge/restart/credencial/registry) recebem a etiqueta `[consequência]`.
2. **Autoverificação Jev**: as claims passam por `engineering.judge.verify` (claims × artefatos reais: saídas de comando, hashes, contagens). Veredito `ALL_SUPPORTED` esperado; claim contradita ou `uncertain` → corrigir e re-verificar ANTES de entregar.
3. **Zonas cinzentas declaradas**: lista explícita do que NÃO foi verificado e por quê.

O supervisor confere apenas a **consistência formal** (labels presentes, claims de consequência identificadas, judge rodou, zonas cinzentas listadas) e **ACEITA sem releitura**.

### Camada 1 — Spot-check dirigido (1–2 chamadas)

- **SÓ claims de consequência** `[consequência]` são obrigatoriamente checadas: 1–2 probes read-only diretos (audit `jsonl`, `release-state.json`, `engineering.git.remote_compare`, `engineering.deploy.status`, `engineering.mcp.catalog`).
- Claims batidas → **resto confiado** (auditoria por amostragem).
- Claims de consequência ausentes → nenhuma checagem obrigatória (missão read-only/doc).

### Camada 2 — Deep-verify (exceção, não regra)

Re-verificação completa (reproduzir testes/typecheck/inspeção de artefatos) SOMENTE quando:

- spot-check da camada 1 falha; OU
- `judge.verify` retorna contradição (`HAS_CONTRADICTIONS`/`MIXED`); OU
- a missão é de alta consequência (definida pelo operador).

Uma falha de spot-check vira **lição registrada** (no capture de fechamento, campo `problems`).

---

## 3. O ledger de fechamento (FINGERPRINT)

Todo fechamento grava no `engineering.memory.capture` EXISTENTE (**projectId `memoryos`** — nunca outro; partição errada = capture invisível), dentro do `summary`, a linha:

```
FINGERPRINT {"missionId":"<ID>","head":"<40-hex>","registrySha16":"<16-hex>","suite":"<PASS|FAIL|n/a>","deploy":"<tag|n/a>","verdicts":{"aggregate":"ALL_SUPPORTED","supported":N,"total":N},"ts":"<ISO-8601>"}
```

### Campos obrigatórios

| Campo | Origem | Como obter (read-only) |
|---|---|---|
| `missionId` | identificador da missão | constante da missão (ex.: `VERIFY-01`) |
| `head` | commit verificado pela missão | `engineering.git.log` (limit 1) ou `engineering.git.inspect_commit` — SHA de 40 hex |
| `registrySha16` | 16 primeiros hex do sha256 dos BYTES do token registry | mesmo valor do `registrySha16Before` devolvido pelo PLAN de `engineering.registry.scope.grant` / `registry.entry.*` (PLAN = zero mutação) |
| `suite` | resultado da suíte da missão | `engineering.test.status` (executionId) ou `release-state.json` (`testStatus`/`failed`) |
| `deploy` | imagem/release quando houver | `release-state.json` (`productionImage`, `deployedAt`) |
| `verdicts` | resultado do `judge.verify` da camada 0 | `aggregate` + contagens; camadas 1/2 quando rodaram |
| `ts` | timestamp ISO-8601 do fechamento | relógio do fechamento |

`head` e `registrySha16` são **sempre obrigatórios**; `suite`/`deploy` podem ser omitidos (ou `"n/a"`) quando a missão não rodou suíte/deploy. `ts` nunca entra na comparação de re-verificação.

### Formato dentro do capture

- A linha é prefixada por `FINGERPRINT ` seguido de JSON compacto (uma linha, sem quebras).
- Deve caber no `summary` do capture (cap de 3000 chars após a tag `[MEMORYGATE:...]` do gate) — manter o resto do summary curto.
- Passa pelo memory-gate normalmente (é conteúdo como outro qualquer; a política de dedupe/injeção do gate se aplica).

### Invariantes

1. **Fingerprint suficiente para 1 probe**: com `head` + `registrySha16` + `suite`/`deploy`, um único probe read-only confirma "estado não mudou desde o fechamento".
2. **Zero mutação para obter**: todos os campos vêm de ferramentas read-only (PLAN de registry, git.log, test.status, release-state).
3. **Nunca segredo**: o registry aparece só como hash16; nenhum valor de credencial, token ou conteúdo de capture no fingerprint.
4. **Idempotência de re-verificação**: comparar `head`/`registrySha16` atuais com os do ledger. Iguais → não re-verificar; divergentes → re-verificar só o que moveu. `ts` nunca comparado.

---

## 4. Procedimento do supervisor — "verifique a missão X" sem turno novo

### 4.1 Query shape esperada (resposta da KB)

**Chamada:** `engineering.memory.search` com `{"query": "VERIFY-01", "projectId": "memoryos", "limit": 5}` (substituir `VERIFY-01` pelo missionId desejado). Alternativa: `engineering.memory.context` com `{"projectId": "memoryos", "limit": 20}` e procurar o capture mais recente cujo `summary` contenha `FINGERPRINT {"missionId":"<ID>"`.

**Resultado esperado:** 0–1 registros cujo conteúdo contém a linha `FINGERPRINT {...}` com o `missionId` pedido. Zero registros → a missão não fechou com ledger → tratar como fechamento antigo (pré-convenção) e cair no regime antigo.

### 4.2 O "1 probe" de re-verificação

Com o ledger em mãos, UM probe confirma "estado não mudou":

| Campo | Probe read-only | Comparação |
|---|---|---|
| `head` | `engineering.git.log` (limit 1) | HEAD atual == ledger `head` |
| `registrySha16` | PLAN de `engineering.registry.scope.grant` (ou `registry.entry.create/revoke`) — ler `registrySha16Before` | hash atual == ledger `registrySha16` |
| `suite` | `release-state.json` (`testStatus`, `failed`) — via `engineering.file.read` ou `engineering.vps.reconcile` | PASS e 0 failed (se ledger diz PASS) |
| `deploy` | `engineering.deploy.status` / `engineering.vps.reconcile` | mesma imagem / estado `OK` |

**Regra de decisão:**
- Todos batem → **não re-verificar** nada; resposta da KB aceita.
- Algum diverge → re-verificar **só o que moveu** (camada 2 na dimensão divergida).
- Probe indisponível → declarar como zona cinzenta na resposta (fail-open honesto).

### 4.3 Fluxo completo

```
"verifique a missão X"
  → memory.search/query=X (KB)
  → parse da linha FINGERPRINT (schema do contrato)
  → 1 probe: head + registrySha16 (PLAN read-only) [+ suite/deploy se o ledger os trouxer]
  → bate? → ACEITO (custo: ~1 probe + ~2 vereditos Jev)
  → não bate? → re-verificar a dimensão que moveu (camada 2 local)
```

Custo típico por verificação: 1 chamada KB (probe local, ~zero token) + 1–2 probes read-only + ~US$0,00004 de Jev. Nenhum turno frontier de releitura.

---

## 5. Teste de contrato

O formato da linha FINGERPRINT é pinado por teste em `eng-mcp/test/verifyLedgerContract.test.ts` (padrão CONTRACT-01):

- zod `verifyLedgerFingerprintSchema` pinado ao tipo real (o `summary` do capture: `z.string().min(1).max(3000)` em `src/tools.ts`);
- fechamento de missão SEM a linha FINGERPRINT → FAIL do contrato;
- fingerprint com `head` malformado (não-40-hex) → FAIL;
- fingerprint com `head` inconsistente com o estado verificável (release-state PASS em imagem de outro source / commit inexistente no repo) → FAIL;
- mutações de forma (campo renomeado, hash 16-hex no lugar de 40, veredito sem contagem) → FAIL;
- golden válido (extraído de um fechamento real) → PASS.

---

## 6. Dogfood e vigência

- O fechamento da própria missão VERIFY-01 carrega o FINGERPRINT do ledger (dogfood): probe = `engineering.memory.search` query `VERIFY-01`.
- A partir desta missão, o regime Camada 0+1 está declarado e em vigor: o supervisor NÃO faz mais releitura integral de relatórios autoverificados.
- Exceções que reativam a releitura integral: spot-check divergente, contradição do judge, missão de alta consequência (camada 2).
