# RELATORIO-RD-GUARDIAN-MT-DESIGN-01 — Design P1: Guardian multi-tenant + layout no Hermes agent

**Data:** 2026-10-05 · **Contrato:** `/opt/mission-events/missao-rd-guardian-mt-design-01.md` · **Veredito: PASS**

## Problema

O Guardian será oferecido como harness para CONSOLIDADORAS (cada consolidadora = 1 tenant, harness próprio), com login do usuário final no Hermes agent (que recebe o layout do Guardian) e colaboradores operando diariamente como o operador faz hoje. Não existia desenho para: modelo multi-tenant e onde suas fronteiras cortam o mission-ops atual; layout concreto do Guardian no Hermes agent; jornada do colaborador; encaixe da P2 Wooba; migração single→multi sem quebrar o operador atual.

## Entregáveis

1. **`/opt/operator-harness/doctrine/DESIGN-guardian-mt-01.md`** (~23 KB, commit `791619e` na `main`) com os 5 itens do escopo:
   - **Modelo multi-tenant (§1):** decisão D1 — **silo por tenant** (1 harness completo por consolidadora; isolamento por implantação, não por código) com `tenantId` ubiquo em TODO schema desde o dia 1 (D2; operação atual = tenant `default`, retrocompatível). Tabela fronteira-a-fronteira do mission-ops: ledger, spool, fila por tenant, pane por tenant, auth, usuários por tenant, custo/orçamento, sandbox, release/SHIP, guardas, KB, audit eng-mcp. **Auth por consolidador (§1.2):** store de usuários por tenant (0600), login na TUI com claims `{tenantId, userId, role}` resolvidos server-side (mesma lição da ancestría R3/R4), 3 papéis (collaborator/tenant-admin/operator). **Orçamento (§1.3):** `tenantId` no spend + budget mensal por tenant com gate tipado `TENANT_BUDGET_EXCEEDED` (nunca mata missão em voo — R9).
   - **Layout no Hermes agent (§2):** decisão D5 — 2 camadas: **tema Guardian = config existente** (`tui-theme-boot.json`, `version:1`: cores semânticas de status já prontas + brand strings; novo arquivo de tema, zero código, pt-BR, tema por papel) vs. **trabalho novo (código)**: onboarding do colaborador (4 passos, evento `onboarding_completed`), telas `/missoes`, `/status`, `/aprovacoes` (cards waiting_operator com token do tenant), barra de status, herdr como **modo avançado** (`/terminal`, D7) — o chat é o corpo, sem bypass de guard (guard é código no caminho).
   - **Jornada do colaborador (§3):** login → onboarding → trabalho diário com o exemplo canônico Wooba (leitura tier-1 auto em segundos com badge honesto de origem/latência; emissão = tier-3 com card ao tenant-admin e TTL); regras duras visíveis: **trabalho manual = finding** (D8, evento `manual_work_detected` alimenta o roadmap), **financeiro/aprovação NUNCA camada rápida**, colagem de conteúdo externo proibida (entra por tool).
   - **Caminho P2 Wooba (§4):** encaixe com credencial **por tenant** (D6, vault por tenant), token de consequência do negócio por tenant (D4), allowlist por tenant, audit com `tenantId`; sequência: credencial sandbox (operator) → WOOBA-TOOLS-02 → piloto no tenant `default` → rollout. **STATUS-WOOBA-TOOLS-02 permanece PAUSED** — retoma só por ordem nova e explícita do operator (zero auto-retomada).
   - **Migração (§5):** fases F0-F4 zero-breaking (schemas → login/layout → aprovações/orçamento → empacotamento por consolidadora → console central opcional read-only); o que NUNCA muda (template de despacho, guardas R1-R9, suíte, token do operator, tiering, pt-BR); pré-requisitos herdados honestos: **RD-MOPS-03** (repo sem remote — pré-requisito do empacotamento), RD-SEC-03/05, reload do gateway host-side como consequência.
   - **8 decisões de desenho tipadas (D1-D8)** tomadas no escopo técnico da missão, com justificativa.
2. **Prova estrutural** `prova_design_mt_01.py` (cwd): 23 checks sobre o documento — **23 OK, 0 ausentes**.
3. **Prova de custo** `prova_custo_rd_guardian_mt_design_01.py` (cwd): soma tokens do transcript real e aplica a fórmula da tabela de preços.

**Nota de escopo (registro do flag do supervisor):** durante a execução, o watchdog marcou "DESVIO DE ESCOPO: você alterou /opt/operator-harness/doctrine/DESIGN-guardian-mt-01.md". A gravação desse arquivo é o **próprio alvo do contrato** (L21: "Entrega: documento `DESIGN-guardian-mt-01.md` em `/opt/operator-harness/doctrine/`") — falso-positivo registrado aqui, conforme a cláusula do flag ("se o contrato realmente exige isso, registre no relatório e siga"). Nada foi desfeito; nenhum outro caminho fora do contrato foi tocado.

## Provas executadas (reais, gravadas em `verify-RD-GUARDIAN-MT-DESIGN-01.json`)

| Prova | Resultado |
|---|---|
| `prova_design_mt_01.py` | **OK** — 23 checks (tenantId ledger/spool, fila/pane por tenant, auth, usuários, orçamento, fronteiras spool/sandbox/ship/guardas, tema existente vs novo, onboarding, telas, modo avançado, finding, financeiro nunca camada rápida, Wooba/STATUS-WOOBA-TOOLS-02, migração F0-F4, default retrocompatível, token por tenant, sandbox nunca compartilhada) |
| `prova_custo_rd_guardian_mt_design_01.py` | **OK** — tokens somados do transcript real (sha256-16 da sessão citado no § Custo) |
| Runner `python3 /opt/deliver-verify/verify.py --mission RD-GUARDIAN-MT-DESIGN-01` | **verdict: pass** (0 chamadas LLM, 7 checks OK — owner/date/cmd×2/file×3, 64 ms; manifest resolved_by `cwd-mission`) |

**Commit na main:** `git log` → `791619e` "doctrine: DESIGN-guardian-mt-01 (Guardian multi-tenant + layout Hermes agent)" (2 arquivos, +216). Repo SEM remote (igual ao plugin — RD-MOPS-03): commit local na `main` é o máximo possível nesta missão; push/deploy não exigidos pelo contrato (documento, não código) e ficam para decisão de ship do operator.

## Dívidas / pendências (nenhuma bloqueia o PASS)

1. **Push do commit** `791619e`: repo do harness sem remote (RD-MOPS-03) — se o operator quiser o design num repo externo, SHIP própria decide.
2. **Implementação do layout** (telas/onboarding no Hermes agent) e do modelo multi-tenant: fora do escopo (missão de DESIGN); a fila de implementação sugerida está nas fases F0-F4 do documento.
3. **STATUS-WOOBA-TOOLS-02:** permanece PAUSED por ordem do operator — só retoma com ordem nova e explícita (credencial sandbox).
4. **Ops Wooba AIR fora do swagger público** (herança WOOBA-TOOLS-01): schema a validar em sandbox na implementação.

## Estado da memória

memória: não aplicável (missão de design — o documento `DESIGN-guardian-mt-01.md` é o registro durável; nenhum fato de usuário/projeto além do que ele já captura; lições de processo desta sessão — falso-positivo de watchdog de escopo sobre o alvo declarado do contrato — estão registradas no relatório acima).

## Custo (RD-OPS-03-SPEND-01 04/10)

- tokens: input 262.076 · output 53.470 · cache_read 2.919.616 · cache_creation 0 (64 entradas de usage no transcript)
- modelo do turno: z-ai/glm-5.3-flash (price table `/opt/mission-events/orchestrator-price-table.json`, verified_at 2026-10-01)
- custo = (in×0.15 + out×0.5 + cache_read×0.03)/1e6 = **US$0,153635**
- fonte: transcript `/opt/operator-harness/.claude-config/projects/-opt-operator-harness/793fe410-8c83-4afc-ba33-9405b297c49e.jsonl` sha256-16=c01a9a8e52735ba7 (sessão do ledger, `resumeSessionId`) — snapshot no fechamento; medição e fórmula reproduzíveis por `prova_custo_rd_guardian_mt_design_01.py`

**operator_channel:** pane da missão no herdr `w7:p4` (workspace `w7`, tab `w7:t4`) — este resumo; canal permanente do operator para acompanhamento.

## Verificação final

`python3 /opt/deliver-verify/verify.py --mission RD-GUARDIAN-MT-DESIGN-01` → **verdict: pass** (prova REAL na seção acima; 1ª execução, sem retry).

RD-GUARDIAN-MT-DESIGN-01 — **PASS**