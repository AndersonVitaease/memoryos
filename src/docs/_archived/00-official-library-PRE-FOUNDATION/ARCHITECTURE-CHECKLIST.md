# ARCHITECTURE-CHECKLIST.md
# MemoryOS — Checklist Definitivo para Aprovação de Módulos
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

> Este checklist deve ser executado antes de qualquer solicitação de promoção
> de módulo para `Official`. Todos os itens marcados como BLOQUEANTE devem
> estar OK para a promoção prosseguir.

---

## Seção 1 — Identidade e Estrutura

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 1.1 | ID único | `id` segue convenção `{nome-kebab}-v{N}` e é único no Registry | ✅ SIM | ☐ |
| 1.2 | Versão semver | `version` no formato MAJOR.MINOR.PATCH | ✅ SIM | ☐ |
| 1.3 | Estrutura de arquivos | `index.ts`, `Types.ts`, `Engine.ts`, `Tests.ts` presentes | ✅ SIM | ☐ |
| 1.4 | Export público | `index.ts` exporta apenas API pública (sem internals) | ✅ SIM | ☐ |
| 1.5 | Nomenclatura | Arquivo segue padrão `{ModuleName}.ts`, `{ModuleName}Types.ts` | ⚠️ NÃO | ☐ |

---

## Seção 2 — Single Responsibility (SRP)

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 2.1 | Uma responsabilidade | Módulo tem EXATAMENTE uma responsabilidade declarada | ✅ SIM | ☐ |
| 2.2 | Responsabilidade documentada | Responsibility documentado no OFFICIAL-DEPENDENCY-GRAPH.md | ✅ SIM | ☐ |
| 2.3 | Sem responsabilidades ocultas | Nenhum método faz algo além da responsabilidade declarada | ✅ SIM | ☐ |
| 2.4 | Nome reflete responsabilidade | Nome do módulo descreve claramente o que faz | ⚠️ NÃO | ☐ |

---

## Seção 3 — Baixo Acoplamento

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 3.1 | Sem imports de produto | Nenhum import de `ChatPage`, `base44Client`, `entities`, etc. | ✅ SIM | ☐ |
| 3.2 | Sem imports de outros módulos EF | Dependência por contrato/tipo, não por instância | ✅ SIM | ☐ |
| 3.3 | Sem imports de módulos legacy | Nenhum import de `src/lib/memory-engine/`, `cognitiveOrchestrator.js`, etc. | ✅ SIM | ☐ |
| 3.4 | Dependências declaradas | Depends On documentado no OFFICIAL-DEPENDENCY-GRAPH.md | ✅ SIM | ☐ |
| 3.5 | Sem dependências circulares | Verificado no OFFICIAL-DEPENDENCY-GRAPH.md — DAG acíclico | ✅ SIM | ☐ |
| 3.6 | Interface injection | Dependências externas injetáveis para testabilidade | ⚠️ NÃO | ☐ |

---

## Seção 4 — Alta Coesão

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 4.1 | Métodos relacionados | Todos os métodos públicos servem à mesma responsabilidade | ✅ SIM | ☐ |
| 4.2 | Tipos coesos | Todos os tipos em `Types.ts` são usados pelo módulo | ⚠️ NÃO | ☐ |
| 4.3 | Sem métodos órfãos | Nenhum método público não relacionado à responsabilidade central | ✅ SIM | ☐ |

---

## Seção 5 — Imutabilidade

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 5.1 | Outputs imutáveis | Objetos de output que devem ser imutáveis têm Object.freeze() | ✅ SIM | ☐ |
| 5.2 | Sem mutação de input | Módulo não modifica objetos recebidos como parâmetro | ✅ SIM | ☐ |
| 5.3 | Campos readonly | Interfaces de output usam `readonly` para campos imutáveis | ✅ SIM | ☐ |
| 5.4 | Timestamp de criação | createdAt / timestamp imutável após criação | ✅ SIM (se aplicável) | ☐ |

---

## Seção 6 — Testabilidade

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 6.1 | Mínimo 28 cenários | `testCount >= 28` conforme Constituição Q-01 | ✅ SIM | ☐ |
| 6.2 | Hardening ≥ 30% | Cenários de edge case/failure ≥ 30% do total (Constituição Q-02) | ✅ SIM | ☐ |
| 6.3 | Cenários passando | `passed == total` (zero falhas) | ✅ SIM | ☐ |
| 6.4 | Formato de resultado | `{ criterion, name, passed, detail?, durationMs }` | ✅ SIM | ☐ |
| 6.5 | Cobertura de failure modes | Cada FailureMode documentado tem ao menos 1 cenário de teste | ✅ SIM | ☐ |
| 6.6 | Cenários determinísticos | Testes sem randomização, sem I/O, sem dependência de tempo | ✅ SIM | ☐ |
| 6.7 | Testes de health | Cenário de health() passando | ⚠️ NÃO | ☐ |

---

## Seção 7 — Observabilidade

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 7.1 | health() implementado | Retorna `{ status: "SUCCESS"|"DEGRADED"|"FAILED", details, checks }` | ✅ SIM | ☐ |
| 7.2 | metrics() implementado | Retorna contadores operacionais (createTotal, failedTotal, avgDurationMs, etc.) | ✅ SIM | ☐ |
| 7.3 | statistics() implementado | Retorna agregações de domínio (totals, byType, byStatus, etc.) | ✅ SIM | ☐ |
| 7.4 | logs() implementado | Retorna últimos N eventos/logs estruturados | ⚠️ NÃO | ☐ |
| 7.5 | health() < 100ms | health() executa em menos de 100ms (Constituição O-02) | ✅ SIM | ☐ |
| 7.6 | Métricas cumulativas | Contadores nunca resetam em runtime (Constituição O-03) | ✅ SIM | ☐ |
| 7.7 | correlationId propagado | correlationId do input é incluído no output e em logs | ✅ SIM (se PATH A) | ☐ |

---

## Seção 8 — Telemetria

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 8.1 | Eventos emitidos declarados | Lista de eventos em `TelemetrySpec.emitEvents` | ⚠️ NÃO | ☐ |
| 8.2 | Eventos no EVENT-CATALOG | Todos os eventos emitidos estão no EVENT-CATALOG.md | ✅ SIM | ☐ |
| 8.3 | Sem PII em logs | Campos com PII não aparecem em logs estruturados | ✅ SIM | ☐ |
| 8.4 | Audit level declarado | `auditLevel` definido no manifest | ⚠️ NÃO | ☐ |

---

## Seção 9 — Segurança

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 9.1 | Permissões declaradas | Todas as permissões necessárias em `permissions[]` | ✅ SIM | ☐ |
| 9.2 | Validação de input | Input inválido retorna erro estruturado, não output corrompido | ✅ SIM | ☐ |
| 9.3 | Fail Safe | Módulo nega operação em estado desconhecido/inválido | ✅ SIM | ☐ |
| 9.4 | Sem segredos em código | Nenhuma API key, token ou senha hardcoded | ✅ SIM | ☐ |
| 9.5 | Sem `any` em API pública | Zero uso de TypeScript `any` em assinaturas públicas | ✅ SIM | ☐ |
| 9.6 | Side effects declarados | `sideEffects[]` documentados (pode ser array vazio) | ✅ SIM | ☐ |

---

## Seção 10 — Performance

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 10.1 | Latência documentada | `LatencySpec { p50, p95, p99 }` definida | ✅ SIM | ☐ |
| 10.2 | Módulos determinísticos < 50ms | Módulos sem LLM executam em < 50ms (Constituição Q-05) | ✅ SIM (se determinístico) | ☐ |
| 10.3 | PATH definido | `executionPolicy.path = "A"|"B"` declarado | ✅ SIM | ☐ |
| 10.4 | PATH A < 5s P99 | Módulos em PATH A têm P99 <= 5000ms | ✅ SIM (se PATH A) | ☐ |
| 10.5 | Timeout definido | `timeoutMs` > 0 declarado | ✅ SIM | ☐ |

---

## Seção 11 — Compatibilidade

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 11.1 | Não viola Constituição | Nenhum dos 50+ princípios é violado | ✅ SIM | ☐ |
| 11.2 | Consistente com OFFICIAL-CONTRACTS | Não contradiz contratos existentes | ✅ SIM | ☐ |
| 11.3 | Canonical compatível | Se há canonical declaration, módulo a respeita | ✅ SIM | ☐ |
| 11.4 | Sem duplicação de módulo Official | Funcionalidade não duplica um módulo já Official | ✅ SIM | ☐ |
| 11.5 | ADR aprovada | ADR de promoção com status Accepted existe | ✅ SIM | ☐ |

---

## Seção 12 — Versionamento

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 12.1 | Version declarada | `version: string` semver no módulo | ✅ SIM | ☐ |
| 12.2 | schemaVersion nos tipos | `schemaVersion: number` nos tipos principais | ⚠️ NÃO | ☐ |
| 12.3 | Backward compatible com v.anterior | Se v2+, compatível com consumidores existentes | ✅ SIM (se v2+) | ☐ |

---

## Seção 13 — Rollback

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 13.1 | RollbackPolicy declarada | `rollbackPolicy { supported, strategy, description }` | ✅ SIM | ☐ |
| 13.2 | Rollback de integração | Ponto de integração no produto tem rollback documentado | ✅ SIM (se integrado) | ☐ |
| 13.3 | Feature flag disponível | Integração pode ser desativada sem deploy (ex: adapter desabilitado) | ⚠️ NÃO | ☐ |

---

## Seção 14 — Documentação

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 14.1 | Cabeçalho padrão | `# Nome · Sprint · Engineering First · Date · Version · Status` | ✅ SIM | ☐ |
| 14.2 | Contrato em OFFICIAL-CONTRACTS | Interface TypeScript completa adicionada | ✅ SIM | ☐ |
| 14.3 | Entrada no OFFICIAL-DEPENDENCY-GRAPH | Depends On / Consumes / Produces / Responsibility documentados | ✅ SIM | ☐ |
| 14.4 | Entrada no OFFICIAL-COMPONENT-REGISTRY | Status, canonical, path, sprint documentados | ✅ SIM | ☐ |
| 14.5 | DOMAIN-MODEL atualizado | Tipos produzidos pelo módulo modelados no DOMAIN-MODEL.md | ✅ SIM | ☐ |
| 14.6 | STATE-MACHINES atualizado | Se módulo gerencia estado, máquina de estado documentada | ✅ SIM (se aplicável) | ☐ |
| 14.7 | EVENT-CATALOG atualizado | Eventos emitidos adicionados ao catálogo | ✅ SIM (se emite eventos) | ☐ |
| 14.8 | Histórico de versões | Seção "Histórico de Versões" no módulo e documentação | ⚠️ NÃO | ☐ |

---

## Seção 15 — Contratos e Schemas

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 15.1 | Contrato público congelado | Contrato adicionado em OFFICIAL-CONTRACTS.md com status Frozen | ✅ SIM | ☐ |
| 15.2 | Inputs/Outputs tipados | Zero `any`, zero `unknown` sem justificativa em API pública | ✅ SIM | ☐ |
| 15.3 | Erros estruturados | Erros retornados com `{ code: string, message: string }` | ✅ SIM | ☐ |
| 15.4 | Schema de output em JSONSchema | outputSchema declarado (para Capabilities e Connectors) | ⚠️ NÃO | ☐ |

---

## Seção 16 — Eventos

| # | Item | Critério | Bloqueante? | OK? |
|---|---|---|---|---|
| 16.1 | Eventos versioned | Todos os eventos seguem `{domínio}.{entidade}.{ação}.v{N}` | ✅ SIM (se emite) | ☐ |
| 16.2 | correlationId em eventos | Todo evento carrega correlationId | ✅ SIM (se emite) | ☐ |
| 16.3 | Dead Letter Policy definida | DLQ policy para eventos críticos | ⚠️ NÃO | ☐ |
| 16.4 | Idempotência declarada | Eventos idempotentes declarados como tal | ⚠️ NÃO | ☐ |

---

## Sumário de Bloqueantes

**Itens marcados ✅ SIM são BLOQUEANTES.** Todos devem estar OK antes da promoção.

**Contagem de bloqueantes:** 35 itens bloqueantes de 52 itens totais.

**Para calcular aprovação:**
- 35/35 bloqueantes OK → **APROVADO para promoção**
- Qualquer bloqueante NOK → **REPROVADO — corrigir antes de solicitar promoção**

---

## Instruções de Uso

1. Copiar este checklist para o PR ou documento de promoção
2. Marcar cada item com `✅ OK` ou `❌ NOK` ou `N/A`
3. Para NOK: documentar o problema e plano de correção
4. Para N/A: justificar por que o item não se aplica
5. Submeter para revisão do Arquiteto antes de criar ADR de promoção

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- MEMORYOS-CONSTITUTION.md — Artigos I-X
- ARCHITECTURE-GOVERNANCE.md
- VERSIONING-POLICY.md
- OFFICIAL-DEPENDENCY-GRAPH.md

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*