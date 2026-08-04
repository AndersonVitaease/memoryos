# RFC-008 — Execution Intelligence Engine

**Status:** Proposed
**Date:** 2026-08-04
**Author:** Engineering First
**Related ADR:** ADR-015
**Sprints:** EI-01 a EI-07
**EPIC:** EPIC-019

---

## 1. Contexto

O MemoryOS evoluiu ate um runtime funcional:

```
Intent Layer → Planner → Capability Registry → RuntimeEngine → ExecutionDispatcher → UCRBridge → Connector
```

Toda execucao de capability passa por essa cadeia sem nenhuma camada que investigue,
enriqueca ou proteja a execucao antes de despachar. Para cenarios de leitura (ler email,
ver agenda, buscar arquivos) isso e suficiente. Para cenarios irreversiveis (emitir
passagem, enviar email, fazer PIX, excluir arquivos, cancelar reservas) e insuficiente:

1. **Risco de dano irreversivel por erro da IA** — se o Planner deduzir errado e
   despachar `mail.send` ou `issueAirTicket`, a acao executa sem freio. O dano
   acontece antes de qualquer correcao ser possivel.
2. **Respostas pobres quando o sistema poderia saber** — "emita passagem para
   Lisboa" despacha com o que tem. Se faltou aeroporto, documento, centro de
   custo, a falha acontece na API ou o sistema pergunta tudo de novo sem contexto.
3. **Connectors acumulam logica que nao e deles** — validacao de negocio, checagem
   de contexto, resolucao de ambiguidade. O connector deveria ser tradutor de API
   puro.

A intencao original do MemoryOS nunca foi criar um novo Engine ou um novo Runtime.
A arquitetura atual deve ser preservada. A proposta deste RFC e adicionar **um unico
componente** entre o Capability Registry e o Execution Dispatcher, com toda a
complexidade encapsulada dentro dele, sem introduzir um segundo runtime.

---

## 2. Decisao

Introduzir a cadeia:

```
Intent Layer
  ↓
Planner
  ↓
Capability Registry
  ↓
Runtime.processCapability()         (Facade publica unica)
  ↓
Execution Intelligence               (enriquece — 7 modulos internos)
  ↓ PreparedExecution
Safety Gate                          (freia o irreversivel)
  ↓ ApprovedExecution
Execution Dispatcher (privado)      (so despacha — igual ao atual)
  ↓
Connector
```

### 2.1 Filosofia

A missao desta camada **nao e impedir erros da IA**. E **produzir a melhor execucao
possivel** utilizando toda a inteligencia disponivel no MemoryOS para investigar,
descobrir informacoes, enriquecer contexto, resolver ambiguidades, identificar
oportunidades e entregar ao Connector uma execucao extremamente preparada.

A confirmacao do usuario para acoes irreversiveis continua existindo, mas e apenas
a ultima camada de segurança. Antes dela existe uma camada de inteligencia capaz de
investigar, descobrir, enriquecer, correlacionar e construir o contexto ideal.

### 2.2 Separacao Intelligence x Safety

Duas camadas distintas, com responsabilidades ortogonais:

**Execution Intelligence** — responsavel por:
- Discovery
- Context Enrichment
- Dependency Resolution
- Context Building
- Correlation
- Opportunity Analysis
- Risk Analysis
- Recommendation Generation

**Safety Gate** — responsavel por:
- Reversibility Check (metadata da capability)
- Hard Policy Blocks (regras obrigatorias)
- Confirmation Gate (irreversible exige confirmacao humana)
- User Approval

Eixos de mudanca distintos: Intelligence evolui com conhecimento de dominio; Safety
Gate evolui com politica de risco; Dispatcher evolui com infraestrutura de execucao.
Componentes diferentes mudam por razoes diferentes.

### 2.3 Runtime Facade

O Runtime expoe **um unico metodo publico**: `Runtime.processCapability(request)`.
Internamente executa obrigatoriamente:

```
Execution Intelligence → Safety Gate → Execution Dispatcher
```

Nenhum componente externo (Planner, Agents, Workflows, futuros callers) consegue
chamar o Dispatcher diretamente. O Dispatcher deixa de ser API publica e passa a
ser apenas implementacao interna do Runtime. O risco de bypass desaparece por
construcao, nao por convencao.

### 2.4 Reversibility Classification

Toda capability declara seu nivel de reversibilidade no metadata:

| Nivel | Significado | Exemplos |
|---|---|---|
| `safe` | read-only, nunca causa efeito | mail.list, calendar.list, files.list |
| `reversible` | pode desfazer | calendar.create (deletar), drive.createFolder |
| `irreversible` | nao da pra desfazer | mail.send, issueAirTicket, payment, delete |

O Safety Gate so freia `irreversible`. `safe` e `reversible` passam direto.

---

## 3. Arquitetura

### 3.1 Cadeia completa

```
[callers: Planner, Agents, Workflows, futuros]
  ↓ CapabilityRequest { capability, intent, rawParams, userId, workspaceId, confirmedByUser? }
Runtime.processCapability()
  ↓
Execution Intelligence (7 modulos internos encapsulados)
  ├─ Discovery Investigators (registrados por capability — Open/Closed)
  ├─ Context Enrichment
  ├─ Dependency Resolution
  ├─ Context Builder
  ├─ Convergence Controller (so ativo na Fase 6)
  ├─ API/LLM Budget Controller (so ativo na Fase 6)
  └─ Opportunity Analyzer (opcional, nao bloqueante)
  ↓ PreparedExecution { enrichedParams, gaps[], risks[], opportunities[] }
Safety Gate
  ├─ Reversibility Check (le metadata do connector)
  ├─ Hard Policy Blocks (regras obrigatorias)
  └─ Confirmation Gate (irreversible sem confirmedByUser → NeedsConfirmation)
  ↓ ApprovedExecution
Execution Dispatcher (privado — RuntimeEngine + Dispatcher existentes, intocados)
  ↓
Connector
  ↓
ExecutionOutcome
```

### 3.2 Contrato uniforme dos 3 componentes

Os 3 componentes (Intelligence, Safety Gate, Dispatcher) nascem com assinatura
compativel com Pipeline futura. Quando o 4º estagio concreto aparecer, a extracao
para Pipeline generica e mecanica (plug-in), nao refatoracao profunda:

```typescript
interface ExecutionStage {
  process(ctx: ExecutionContext): Promise<ExecutionContext | NeedsInput | Blocked>;
}
```

### 3.3 Localizacao dos arquivos

```
src/lib/execution-intelligence/                 (NOVO diretorio)
  ExecutionTypes.ts                              # contratos uniformes
  Runtime.ts                                     # Facade publica
  ExecutionIntelligence.ts                       # shell + 7 modulos internos
  SafetyGate.ts                                  # freio de irreversivel
  investigators/                                 # Open/Closed — registraveis
    InvestigatorRegistry.ts
    GenericFieldValidator.ts                     # Fase 5
    DateFormatValidator.ts                       # Fase 5
    TravelInvestigator.ts                        # Fase 6 (futuro)
    EmailInvestigator.ts                          # Fase 6 (futuro)
  policies/                                      # Open/Closed — regras do Safety Gate
    PolicyRegistry.ts
    ReversibilityPolicy.ts                       # Fase 2
    MandatoryFieldsPolicy.ts                     # Fase 2 (opcional)
```

O diretorio fica em `src/lib/`, nao em `src/runtime/` (arvore paralela — dead end
recorrente) nem em `src/sdk/` (idem). Senta ao lado dos modulos vivos do runtime
(`src/lib/runtime-engine/`, `src/lib/connector-runtime/`).

### 3.4 Reuso do padrao ja vivo no projeto

O padrao "shell fino + modulos internos isolados" ja e vivo e validado no projeto:
- `MicrosoftGraphConnector` (shell) + 11 Capability Executors em `microsoft/`
- `WhatsAppConnector` (shell) + 3 providers + observation bridge
- `GoalCapabilityRegistry` (registry + mappings registrados no load)

A Execution Intelligence segue o mesmo padrao: shell fino que orquestra 7 modulos
internos, cada um testavel isoladamente. Nao inventa nada novo — repete o padrao
que ja funciona.

---

## 4. As 3 travas de balanceamento (so aplicadas na Fase 6)

A iteracao do Execution Intelligence (descobrir info faltante → pesquisar em outros
connectors → continuar) sem limites tem 3 modos de falha reais: loop infinito,
explosao de custo e dependencia circular. As 3 travas impedem os 3:

### 4.1 Convergence Budget
Maximo de N iteracoes por execucao (ex.: 5). Passou disso, executa com o que tem e
pede confirmacao dos gaps. Nunca itera para sempre.

### 4.2 API/LLM Budget
Orcamento de custo por execucao (ex.: "ate 4 chamadas externas e 3 chamadas de LLM
por dispatch"). Esgotado, para e pede o que falta ao usuario em vez de procurar mais.

### 4.3 Dependency Graph aciclico
A Intelligence Engine consulta um grafo de dependencias declarado por capability,
nao descobre dependencias em runtime. `issueAirTicket` declara que precisa de:
passenger → document → flight → fare → policy. Sem grafo, sem ciclo. Com grafo,
voce sabe o limite de profundidade antes de comecar.

As 3 travas sao **controles internos** do componente Execution Intelligence. Nada
disto e Pipeline generica — e implementacao encapsulada. Externamente continua
existindo apenas um novo componente na arquitetura.

---

## 5. Invariants arquiteturais (nao-negociaveis)

1. **Bypass impossivel por construcao** — o Dispatcher e closure-local dentro da
   factory do Runtime, nunca exportado de arquivo algum. O simbolo
   `ExecutionDispatcher` nao existe fora do escopo da factory. Nenhum caller
   consegue importa-lo.
2. **Nenhum exempt caller** — a unica forma de executar uma capability e atraves da
   cadeia completa, sem excecoes, sem callers confiaveis, sem fast path. Nada de
   "esse workflow ja validou, deixa pular o Safety Gate".
3. **`processCapability` e puro wiring** — 3 chamadas em sequencia, zero logica.
   Metricas/log/error-handling vivem nos componentes internos, nunca no entry point.
4. **Contrato uniforme desde a Fase 1** — os 3 componentes ja nascem com assinatura
   compativel com Pipeline futura.
5. **Aditivo apenas** — nada e apagado ate a Fase 4 conclusiva. Dispatcher/UCRBridge/
   connectors nunca sao editados. O caminho antigo (RuntimeEngine direto) segue 100%
   intocado ate os callers migrarem.

---

## 6. Renomeacao do metodo publico

O metodo publico **nao se chama `executeCapability`**. A capability pode nunca chegar
a execucao — Intelligence pode descobrir que falta info e so responder ao usuario,
sem nenhum Connector despachado. O nome honesto e `processCapability` (ou
`processRequest`): descreve o que realmente acontece (processa, nao necessariamente
executa).

---

## 7. Quando introduzir Pipeline generica (regra de disparo)

A cadeia direta (Intelligence → Safety → Dispatcher) e mantida enquanto houver
apenas 3 estagios concretos. Pipeline generica com Stages + Interceptors e
introduzida **somente quando** qualquer destas acontecer:

1. **4º estagio concreto** aparece (ex.: um CachingStage real, nao hipotetico).
2. **Mesmo interceptor aplicado a 2+ estagios** e o codigo esta sendo duplicado.
3. **Ordem dos estagios muda** por configuracao/runtime.

Ate la, cadeia direta. Cada condicao e necessidade concreta, nao projecao. Os 3
componentes ja sao compatíveis com Pipeline desde a Fase 1, entao a extracao futura
e plug-in, nao refatoracao profunda.

Esta decisao segue a filosofia documentada do projeto: construir abstracoes apenas
quando existe necessidade concreta. Over-engineering e abstracao prematura ja
custaram dias de limpeza (Softeria MCP stub, arvores paralelas `src/sdk/`,
Capability Registry sem consumidores).

---

## 8. Fases de implementacao (aditivas, reversíveis, nada quebra)

| Sprint | Foco | Entregavel | Risco |
|---|---|---|---|
| EI-01 | Reversibility Metadata | Campo `reversibility` no metadata de cada connector. Default `safe` quando ausente. Nada le o campo ainda. | Zero |
| EI-02 | Tipos + Runtime Facade | `ExecutionTypes.ts` + `Runtime.ts` com `processCapability` que hoje so delega ao RuntimeEngine existente. Nenhum caller o chama. | Zero |
| EI-03 | Safety Gate | `SafetyGate.ts`. Le reversibility. Irreversible sem confirmacao → `NeedsConfirmation`. Runtime passa a chamar Safety antes de despachar. | Baixo (so ativa para quem migra) |
| EI-04 | Migracao gradual de callers | Callers migrados um a um de `RuntimeEngine.execute()` → `Runtime.processCapability()`. Cada migracao independente e reversivel. | Baixo (1 caller por vez) |
| EI-05 | Execution Intelligence pass-through | `ExecutionIntelligence.ts` pass-through puro (recebe, devolve identico, so loga/instrumenta). Runtime passa a chamar Intelligence antes do Safety. | Zero (pass-through) |
| EI-06 | Investigators genericos | Validators de campos obrigatorios, formato de datas. Ainda sem iteracao, sem LLM, sem chamadas cross-connector. | Baixo (cada investigator registravel/desativavel) |
| EI-07 | Investigators de dominio + iteracao balanceada | TravelInvestigator, EmailInvestigator. Convergence Budget, API/LLM Budget, Dependency Graph. | Medio (gatilho: EI-06 em producao sem incidentes) |

EI-07 e onde o valor diferencial real aparece. EI-01 a EI-06 sao fundacao
incremental — cada uma entrega valor ou pre-requisito, cada uma e reversivel.

---

## 9. Nao-quebra (verificacao)

### 9.1 Cadeia atual preservada
O `ExecutionDispatcher` existente (`src/lib/runtime-engine/ExecutionDispatcher.ts`)
e per-step e continua fazendo exatamente o que faz hoje. O "Execution Dispatcher"
da nova arquitetura e o **RuntimeEngine + Dispatcher existentes**, que viram
privado por convencao de chamada, nao por renomeacao. Zero renomeacao, zero
reescrita.

### 9.2 Caminho antigo sempre funciona
Ate os callers migrarem (EI-04), tudo segue pelo RuntimeEngine direto. Nenhum
caller e forcado a migrar. Cada migracao (EI-04) e independente e reversivel.

### 9.3 Cada fase deploya sozinha
Nao ha dependencia que exija 2 fases no mesmo deploy. Build verde entre fases.

### 9.4 Componentes intocados
`UCRBridge` (Event Layer), `PipelineObservationBridge` (Observation Layer),
`ConnectorBootstrap`, `GoalCapabilityRegistry` — todos intocados. A nova camada
senta antes do que ja funciona, nao substitui nada.

---

## 10. O que NAO esta neste RFC (honesto)

- **Pipeline generica** — so quando 4º estagio concreto aparecer (regra de disparo).
- **Interceptors** (telemetry/audit) — so quando mesmo interceptor precisar rodar
  em 2+ estagios.
- **Investigators de dominio com iteracao** — EI-07, pos-validacao de EI-06.
- **Renomeacao do ExecutionDispatcher existente** — continua per-step, intocado.

---

## 11. Criterios de aceitacao

- ADR-015 aceita.
- SPRINTS.md atualizado com secao EI-01 a EI-07.
- MEB atualizado com EPIC-019.
- CLAUDE.md atualizado com esta sessao.
- Antes de EI-01: nenhum codigo alterado (esta fase e so documentacao).

---

## 12. Referencias

- ADR-013 (Capability Executors Pattern) — padrao reusado
- ADR-014 (Provider Router) — padrao shell + modulos internos reusado
- RFC-006, RFC-007 — estrutura de RFC seguida
- SPRINTS.md — secao MS-PR-01 a MS-PR-04 como modelo de sprint table
- CLAUDE.md secao "Metodo de verificacao" — anti-dead-end aplicado antes de escrever

---

*RFC-008 — Execution Intelligence Engine — Proposed — 2026-08-04*