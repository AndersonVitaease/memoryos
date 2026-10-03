<!-- CLAUDE-MD-DIET-01 (2026-10-02): histórico datado (101.6k → 3.6k) movido para CLAUDE.md.archive-2026-10/ (índice em README.md; original integral em CLAUDE.md.original-2026-10-02.bak). -->

**Status:** APENAS PLANEJAMENTO. Nenhum codigo implementado. Apenas documentacao escrita.

**Contexto:** O `Base44Connector` (v2.0.0, Beta-02 PCS) tem 15 capabilities read-only (auth, workspace, projects, sessions, entities.list/count, health). O SDK Base44 suporta escritas em entidades, integracoes Core (LLM, upload, geracao de imagem/video/speech, transcricao), gestao de usuarios, workflows e analytics — mas o conector nao expoe nada disso. O pipeline chama `base44.entities.X.create` e `base44.integrations.Core.*` direto, bypassando o conector (sem observabilidade do UCRBridge, sem enriquecimento do Execution Intelligence, sem trava do Safety Gate).

**Decisao arquitetural:** evoluir em 6 fases aditivas (B44-EXP-01 a B44-EXP-06), +23 capabilities (15 → 38). Mesmo padrao do GitHub (6 upgrades) e do Microsoft Graph (embora aqui sem extrair para executors — manter o switch; o PCS ja e a interface rica, extracao seria over-engineering para 15→38 cases).

**Fases propostas:**

| Sprint | Escopo | Capabilities | Reversibilidade |
|---|---|---|---|
| B44-EXP-01 | Entity Writes | create, update, delete, filter, bulkCreate, bulkUpdate | reversible / irreversible / safe |
| B44-EXP-02 | Integracoes Core | invokeLLM, uploadFile, generateImage, generateSpeech, generateVideo, transcribeAudio, extractDataFromFile | safe (upload: reversible) |
| B44-EXP-03 | User Management | users.invite, users.list, auth.updateMe | reversible / safe |
| B44-EXP-04 | Connector Visibility | connectors.list, connectors.appUserStatus | safe |
| B44-EXP-05 | Workflows | workflows.list, activate, deactivate, runs | safe / reversible |
| B44-EXP-06 | Analytics | analytics.track | safe |

**Decisoes:**
1. **Manter o switch `_dispatch`** — NAO extrair para executors (Fase 0 opcional, nao recomendada). Reabrir se passar de ~50 cases.
2. **Declarar `capabilityReversibility`** — Base44 foi pulado em EI-01 (todas safe). Ao adicionar escritas, DEVE declarar: `entities.delete` = irreversible, create/update/bulk* = reversible, integracoes/analytics/workflows.list/connectors.* = safe.
3. **Aditivo apenas** — cases novos no final do switch; `CAPABILITIES` e `capabilityReversibility` crescem; mappings no `GoalCapabilityRegistry` antes do bloco `general.*`. As 15 capabilities existentes intocadas.
4. **Nenhum caller migrado nesta RFC** — migrar chamadas diretas `base44.entities.X.create` / `Core.*` para as novas capabilities e EI-04 sub-step, deferido apos as fases.
5. **Cada fase independente e testavel** — ordem (1 → 2 → 3 → 4 → 5 → 6) e so recomendacao de impacto.

**Nao-quebra (verificacao):** as 15 capabilities existentes ficam 100% intocadas (mesmos IDs, mesma assinatura). `IProductionConnector` intocado. `capabilityReversibility` e campo opcional (nao validado pelo `ConnectorBootstrap.validateConnector`). Mappings no `GoalCapabilityRegistry` sao aditivos. Nenhum caller vivo migrado. `UCRBridge` e `PipelineObservationBridge` envolvem automaticamente.

**Alternativas rejeitadas (documentadas em ADR-016):** (A) Extrair para executors como Fase 0 obrigatoria — over-engineering para 15→38 cases; (B) Criar conector separado `Base44IntegrationsConnector` — cria paralelo (dead-end recorrente); (C) Nao declarar `capabilityReversibility` — `entities.delete` irreversivel sem declarar burla o Safety Gate; (D) Migrar callers vivos nesta RFC — mesma decisao de EI-04 Option C (sem contexto real ainda).

**Proximo passo:** aguardar autorizacao para iniciar **B44-EXP-01 (Entity Writes)** — 6 cases novos + `capabilityReversibility` + mappings no `GoalCapabilityRegistry`. Zero risco, maior valor direto no chat.

---
