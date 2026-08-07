# VERSIONING-POLICY.md
# MemoryOS — Política Oficial de Versionamento
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## 1. Semantic Versioning (Base)

Toda versão segue o padrão: `MAJOR.MINOR.PATCH`

| Componente | Quando incrementa | Exemplo |
|---|---|---|
| **MAJOR** | Breaking change — incompatível com versão anterior | 1.x → 2.0 |
| **MINOR** | Nova funcionalidade backward-compatible | 1.0 → 1.1 |
| **PATCH** | Correção de bug backward-compatible | 1.0.0 → 1.0.1 |

**Regra fundamental:** Dentro do mesmo MAJOR, contratos são backward-compatible. Consumidores não precisam mudar.

---

## 2. Architecture Version

**Formato:** `MAJOR.MINOR`

**Escopo:** Todo o sistema MemoryOS — pipeline, módulos, contratos, documentação.

| Incremento | Trigger | Requer |
|---|---|---|
| **MAJOR** (ex: 2.0 → 3.0) | Mudança de contrato público congelado, mudança de pipeline, remoção de módulo Official | ADR aprovada + sprint de migração |
| **MINOR** (ex: 2.0 → 2.1) | Promoção Reserved → Official, novo módulo adicionado | ADR aprovada |

**Versão atual:** 2.0 (frozen em SPR-FREEZE-01)

**Exemplo de triggers para v3.0:**
- Mudança de assinatura de EF-06 `decide()`
- Remoção do módulo EF-07
- Mudança de formato de `ExecutionPlan`

**Arquivo de referência:** FREEZE-CHANGELOG.md — seção de versões

---

## 3. Module Version (Módulos EF)

**Formato:** `MAJOR.MINOR.PATCH`

**Escopo:** Versão de um módulo EF individual (ex: Decision Engine v1.0.0)

| Incremento | Trigger |
|---|---|
| **MAJOR** | Mudança na assinatura pública do módulo (contratos) |
| **MINOR** | Novos cenários de teste, nova funcionalidade interna sem breaking change |
| **PATCH** | Bug fix que não altera comportamento observável |

**Nomenclatura canônica:** `{NomeMódulo} v{MAJOR}.{MINOR}` (sem PATCH para labels)
Ex: "Decision Engine v1.0", "Memory Engine v1.0"

**Versão em campo de contrato:** `moduleVersion: string` ex: `"1.0.0"`

**Regra de upgrade:** MAJOR upgrade de módulo requer ADR. MINOR/PATCH são auto-aprovados.

---

## 4. Contract Version

**Formato:** `v{N}` (inteiro)

**Escopo:** Contrato público individual (ex: `ExecutionPlan.v1`, `goal.created.v1`)

| Incremento | Trigger |
|---|---|
| **+1** | Qualquer mudança de campo (add, remove, rename, type change) |

**Compatibilidade:**
- Adicionar campo OPCIONAL: non-breaking → MINOR do módulo; contrato permanece `v1` com nota de campo adicionado
- Remover ou renomear campo: breaking → nova versão de contrato (`v2`)
- Alterar tipo de campo: breaking → nova versão de contrato

**Coexistência:** `v1` e `v2` do mesmo contrato coexistem durante período de migração.

**Arquivo de referência:** OFFICIAL-CONTRACTS.md — cada contrato tem `version` declarado.

---

## 5. Schema Version

**Formato:** `number` (inteiro incremental) no campo `schemaVersion`

**Escopo:** Schemas de entidade (Goal, Memory), Manifests (Capability, Connector)

| Incremento | Trigger |
|---|---|
| `+1` | Qualquer mudança de campo obrigatório |

**Validação:** Módulos que recebem schemas validam `schemaVersion` antes de processar. Schema desconhecido → erro `UNSUPPORTED_SCHEMA_VERSION`.

**Migração:** Módulos devem suportar N e N-1 durante período de transição (1 sprint).

**Exemplos:**
```
Goal.schemaVersion = 1  (criado em SPR-GOV-01)
Memory.schemaVersion = 1  (criado em SPR-GOV-01)
CapabilityManifest.schemaVersion = 1
ConnectorManifest.schemaVersion = 1
```

---

## 6. Event Version

**Formato:** `v{N}` sufixo no nome do evento

**Escopo:** Eventos do EVENT-CATALOG (ex: `goal.created.v1`)

| Incremento | Trigger |
|---|---|
| `+1` | Remoção ou rename de campo no payload |

**Regra:** Adicionar campo OPCIONAL ao payload é non-breaking — mesmo `v1`.

**Coexistência:** Produtor pode emitir `v1` e `v2` simultaneamente durante migração.
**Consumer tolerance:** Consumidores devem tolerar campos extras não documentados (forward-compat).

**Convenção de nomenclatura:**
```
{domínio}.{entidade}.{ação}.v{N}
goal.created.v1          → primeira versão
goal.created.v2          → breaking change no payload
goal.status_changed.v1   → primeiro evento de mudança de status
```

---

## 7. ADR Version

**Formato:** Número sequencial `ADR-{NNN}`

**Escopo:** Architecture Decision Records

| Ação | Resultado |
|---|---|
| Nova decisão | Novo número ADR |
| Supersedição | ADR antiga → `Superseded by ADR-{NNN}` |
| Correção editorial | Mesmo número, nova data no cabeçalho |

**Numeração:** Sequencial global, sem gaps. ADR-001 a ADR-007 existentes. Próxima: ADR-008.

**Arquivo de referência:** src/docs/foundation/adr/ADR-MASTER-INDEX.md

---

## 8. Migration Version

**Formato:** `INT-{NN}` (Integração) ou `EF-{NN}` (Engineering First)

**Escopo:** Sprints de migração e módulos

| Série | Uso |
|---|---|
| `INT-NN` | Sprints de integração produto ↔ pipeline EF |
| `EF-NN` | Sprints de criação/promoção de módulos EF |
| `SPR-GOV-NN` | Sprints de governança |
| `SPR-FREEZE-NN` | Sprints de congelamento arquitetural |
| `SPR-ADR-NN` | Sprints de revisão de ADRs |
| `ARC-NN` | Sprints de auditoria arquitetural |

**Sequência aprovada:** INT-02 → INT-03 → INT-04 → INT-05 → INT-06 → INT-07 → EF-23 → EF-25 → EF-16

---

## 9. Compatibilidade — Regras Completas

### 9.1 Non-breaking changes (backward-compatible)

| Mudança | Escopo |
|---|---|
| Adicionar campo opcional ao schema | Schema, Contract, Event |
| Adicionar nova Capability ao Registry | Module |
| Adicionar novo cenário de teste | Module |
| Adicionar nova ação ao ConnectorManifest | ConnectorManifest |
| Adicionar novo evento ao EVENT-CATALOG | Event |
| Melhorar mensagem de erro (sem alterar código) | Contract |
| Adicionar novo módulo Reserved | Architecture |
| Deprecar módulo (sem remover) | Architecture |

### 9.2 Breaking changes (requerem nova versão)

| Mudança | Escopo | Requer |
|---|---|---|
| Remover campo obrigatório | Schema, Contract, Event | Major version |
| Renomear campo | Schema, Contract, Event | Major version |
| Alterar tipo de campo | Schema, Contract, Event | Major version |
| Remover módulo Official | Architecture | ADR + Major arch version |
| Alterar assinatura de método público | Module | Major module version |
| Alterar threshold de Memory Gate | Memory Schema | ADR + Major memory version |
| Alterar ordem de steps no pipeline | Architecture | ADR + Major arch version |

---

## 10. Compatibilidade de Módulos EF

**Regra:** Módulos EF são independentes por contrato, acoplados por tipo.

```
// Correto: acoplar por tipo/interface
function decide(input: DecisionInput): ExecutionDecision

// Incorreto: acoplar por instância
import { PlanningEngine } from '../planning-engine'
```

**Upgrade de módulo:** Atualizar implementação sem alterar assinatura → MINOR version. Consumidores não precisam mudar.

**Downgrade de módulo:** Proibido. Rollback de implementação é permitido; rollback de contrato requer ADR.

---

## 11. Document Version

**Formato:** `Version: MAJOR.MINOR` no cabeçalho

| Incremento | Trigger |
|---|---|
| **MAJOR** | Reestruturação completa ou mudança de escopo |
| **MINOR** | Adição de seções, atualizações de conteúdo |

**Histórico:** Toda mudança de versão documentada na seção "Histórico de Versões" do documento.

---

## 12. Tabela Resumo de Versões

| Artefato | Formato | Breaking = | Não-breaking = |
|---|---|---|---|
| Architecture | MAJOR.MINOR | MAJOR++ | MINOR++ |
| Module EF | MAJOR.MINOR.PATCH | MAJOR++ | MINOR++ / PATCH++ |
| Public Contract | vN | N++ | — (mesma versão, campo opcional) |
| Schema (Goal, Memory) | schemaVersion: N | N++ | N (campo opcional) |
| Event | vN | N++ | — (campo opcional) |
| ADR | ADR-NNN | Supersede | — |
| Migration Sprint | INT-NN / EF-NN | — | — |
| Document | MAJOR.MINOR | MAJOR++ | MINOR++ |

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- ARCHITECTURE-GOVERNANCE.md
- OFFICIAL-CONTRACTS.md
- FREEZE-CHANGELOG.md
- MEMORYOS-CONSTITUTION.md — Artigo VIII, E-06

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*