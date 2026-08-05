# RFC-010 — Adaptive Process Engine

**Status:** Proposed
**Date:** 2026-08-05
**Author:** Engineering First
**Related ADR:** ADR-017
**Sprints:** AP-01 a AP-05
**EPIC:** EPIC-020

---

## 1. Contexto

O MemoryOS possui hoje uma cadeia de execução consolidada (ADR-015):

```
Intent Layer → Planner → Capability Registry → Runtime.processCapability()
  → Execution Intelligence → Safety Gate → Execution Dispatcher → Connector
```

Cada **capability** representa uma ação relativamente atômica contra um
connector: `gmail.send`, `drive.search`, `calendar.create`, `github.search`,
`issueAirTicket`. O Planner resolve um goal em um plano de 1+ steps, o
Runtime despacha cada step, o Connector traduz a chamada de API. Esse modelo
funciona para ações bem-definidas.

O **Deep Research** não é uma ação atômica. Ele é um processo cognitivo
composto que:

1. planeja a pesquisa (decide dinamicamente quais capabilities utilizar);
2. executa diversas capabilities;
3. avalia os resultados;
4. detecta lacunas de evidência;
5. pesquisa novamente (re-planeja);
6. aplica um critério próprio de parada (suficiência de evidência, não
   contador fixo);
7. sintetiza o conhecimento em um relatório final.

Nenhum dos 3 mecanismos existentes cobre esse comportamento sem distorcer a
arquitetura:

- **Tratar como Goal** — o Planner é declarativo e estático; não decide
  dinamicamente nem reflete sobre resultados. Forçar o Deep Research no
  Planner seria pedir a ele iteração reflexiva, que não é sua
  responsabilidade.
- **Tratar como Capability comum** — uma capability composta que executa
  durante minutos, chama dezenas de sub-capabilities e consome um orçamento
  próprio não se comporta como `gmail.send` para o Runtime. Tratá-las
  uniformemente cria uma **bifurcação invisível**: capabilities atômicas e
  compostas indistinguíveis, onde o Runtime aplica a mesma política de
  timeout/retry/audit/budget a coisas de natureza完全 diferente. O bug é
  silencioso: timeout mata o processo aos 30s, ou segura um slot de retry
  por minutos; `SystemEvent` registra 1 evento e as 40 sub-chamadas ficam
  órfãs na árvore de correlação; o contexto OAuth do caller não propaga para
  as sub-chamadas.
- **Criar uma categoria pública nova** — adicionar "Cognitive Process" como
  elemento visível da arquitetura pública (`Planner → Capability Registry →
  Cognitive Process → Dispatcher`) aumentaria o modelo mental sem
  necessidade. A arquitetura pública deve permanecer a 4 elementos
  (Planner → Capability Registry → Dispatcher → Connector).

A mesma forma interna (plan → invoke → reflect → gap → stop → synthesize)
aparecerá em futuros processos: Deep Planning, Root Cause Analysis,
Opportunity Discovery, Strategy Builder, Multi-Agent Investigation,
Compliance Process, Negotiation Process, Optimization Process. Tratar cada
um como capability comum criaria, em alguns meses, N arquivos com a mesma
forma interna e nenhum nome coletivo — exatamente o débito arquitetural a
evitar.

---

## 2. Decisão

Adotar uma abordagem **híbrida**: externamente o Deep Research continua
sendo apenas uma capability (`deepResearch()`); internamente ele é
implementado por um **Adaptive Process** — uma nova categoria arquitetural
interna, invisível na arquitetura pública.

### 2.1 Arquitetura pública (inalterada)

```
Planner → Capability Registry → Runtime.processCapability() → Dispatcher → Connector
```

Permanece 4 elementos. O modelo mental do desenvolvedor não muda. O
Planner resolve `deepResearch` como qualquer outra capability.

### 2.2 Arquitetura interna (detalhe de implementação)

```
Runtime.processCapability({ connectorId: "adaptive-process", capability: "deepResearch", ... })
  ↓ lê metadata: composite[deepResearch] === true
  ↓ aplica política de execução composta (sub-budget, correlation tree, timeout estendido)
  ↓ dispatcha para AdaptiveProcessConnector
    ↓ AdaptiveProcessConnector.execute("deepResearch", params, ctx)
      ↓ delega para DeepResearchProcess.run(params, runtime)
        ↓ plan()    — monta plano dinâmico de sub-capabilities (LLM/heurística)
        ↓ invoke()  — chama runtime.processCapability({ ..., parentExecutionId }) por sub-cap
        ↓ reflect() — avalia qualidade dos resultados
        ↓ gap()     — detecta lacunas de evidência
        ↓ stop()    — critério próprio de parada (suficiência, não contador)
        ↓ synthesize() — produz relatório final
      ↓ retorna relatório como ConnectorResult.data
  ↓ ExecutionOutcome { output: relatorio, composite: true, ... }
```

### 2.3 O que define um Adaptive Process

Um Adaptive Process possui **3 propriedades estruturais simultâneas** que o
diferenciam de uma capability comum:

1. **Auto-orquestração de capabilities** com decisão *dinâmica* sobre quais
   chamar (não declarativa/estática como um plano do Planner).
2. **Loop reflexivo com critério de parada não-trivial** (gap-detection →
   re-plan → executar de novo até satisfazer um critério de qualidade, não
   um contador fixo).
3. **Estratégia de parada própria** — o processo decide sozinho "terminei",
   baseado em qualidade de evidência, não em passos predeterminados.

Uma capability que não possui as 3 propriedades **não** é um Adaptive
Process. `issueAirTicket` é composta (vários passos) mas o plano é
*declarado* no Planner — não tem loop reflexivo nem critério de parada
próprio. Permanece capability comum.

### 2.4 O metadata `composite`

Adicionar ao `ConnectorMetadata` (em `ConnectorTypes.ts`) um campo opcional
`capabilityComposite?: Record<string, boolean>`, espelhando exatamente o
padrão já vivo de `capabilityReversibility` (EI-01 / ADR-015).

- **Externo:** continua sendo apenas uma capability. O flag é metadata,
  não um novo conceito público.
- **Interno:** o Runtime lê o flag e aplica política de execução composta:
  sub-budget próprio (não herda nem consome opacamente o do caller), timeout
  estendido, árvore de correlação (`parentExecutionId` → `child` em
  `SystemEvent`), propagação correta do contexto de autenticação, circuit
  breaker isolado por sub-capability.

Sem o flag, o hibridismo cria uma bifurcação invisível (capabilities
atômicas e compostas indistinguíveis). Com o flag, a bifurcação é
*declarada* e barata — ~30 linhas no Runtime para ler o flag e aplicar a
política. Custo mínimo, ganho máximo.

### 2.5 Nome: "Adaptive Process", não "Cognitive Process"

A propriedade ontológica real é **adaptação ao plano**, não cognição. Um
Compliance Process que descobre regulamentação aplicável e replaneja a
árvore de checagem é adaptativo, mesmo que zero LLM. "Cognitive"
limitaria a futuros processos LLM-driven; "Adaptive" sobrevive à evolução
(Compliance, Negotiation, Optimization não-cognitivos). "Process" é o
substantivo correto — multi-step, duração, estado — e está livre no
vocabulário do MemoryOS ("Workflow" está tomado pelos Base44 workflows,
"Pipeline" pelo CognitivePipeline, "Engine" é infraestrutura).

---

## 3. Arquitetura

### 3.1 Cadeia completa (vista interna)

```
[callers: Planner, Reasoning Layer, futuros]
  ↓ ExecutionRequest { connectorId, capability, params, context, parentExecutionId? }
Runtime.processCapability()
  ├─ resolve connector no ConnectorRegistry
  ├─ le reversibility do metadata (ADR-015)
  ├─ le composite do metadata (NOVO — ADR-017)
  ├─ Execution Intelligence (enriquece — ADR-015)
  ├─ Safety Gate (freia irreversivel — ADR-015)
  ├─ se composite: aplica política composta (sub-budget, correlation tree, timeout)
  └─ Execution Dispatcher (privado)
       ↓
     Connector
       ↓ se connector === "adaptive-process": delega ao AdaptiveProcess
       ↓ senão: tradutor de API puro (comportamento atual)
       ↓
     ExecutionOutcome { output, composite, executionId, parentExecutionId, ... }
```

### 3.2 Invocação aninhada (nested)

O `DeepResearchProcess` invoca sub-capabilities chamando
`runtime.processCapability({ ..., parentExecutionId: <id do deepResearch> })`.
Cada sub-chamada re-entra a cadeia completa (Intelligence + Safety +
Dispatch), herda sub-budget do orçamento do processo pai, e é correlacionada
na árvore de `SystemEvent` via `parentExecutionId` → `child`.

O Runtime detecta aninhamento via `parentExecutionId` presente no contexto e
aplica:

- **Sub-budget explícito:** o inner call recebe timeout/retry/token-budget
  próprios, não herda nem consome opacamente o do outer.
- **Correlação em árvore:** `SystemEvent.correlationId` já suporta isto
  (`parentId` no schema da entidade). Cada sub-cap publica um evento filho
  do evento do deepResearch.
- **Propagação de auth context:** o contexto OAuth/headers do outer flui
  para o inner via `context` (threaded, não global).
- **Circuit breaker isolado:** burst de 40 `search()` aninhados não dispara
  breakers globais de provider.

### 3.3 Localização dos arquivos

```
src/lib/execution-intelligence/                 (diretorio VIVO — ADR-015)
  adaptive-process/                             (NOVO subdir, DENTRO do vivo)
    AdaptiveProcess.ts                           # interface base
    DeepResearchProcess.ts                       # primeira instancia
  ... (ExecutionTypes, Runtime, etc. — ADR-015, intocados)
```

O subdiretório fica **dentro** de `src/lib/execution-intelligence/`, o
diretório vivo da cadeia ADR-015. **Não** em `src/runtime/` nem `src/sdk/`
(árvores paralelas — dead ends recorrentes). **Não** em `src/lib/marketplace/`
nem `src/lib/capabilities/registry/` (Capability Registries paralelos sem
consumidor vivo — ADR-004 documenta a triplicação). Senta ao lado dos
módulos vivos do runtime.

### 3.4 Onde o flag mora (e onde NÃO mora)

**Mora:** `ConnectorMetadata.capabilityComposite?: Record<string, boolean>`
em `src/lib/connector-runtime/ConnectorTypes.ts`. Este é o metadata lido por
`ExecutionRuntime.processCapability` (caminho vivo, ADR-015). Espelha
`capabilityReversibility` (EI-01) — mesmo arquivo, mesmo padrão, campo
opcional.

**NÃO mora em:**
- `src/lib/marketplace/CapabilityRegistry.ts` — P7 Marketplace scaffold,
  não está no caminho de execução vivo.
- `src/lib/capabilities/registry/CapabilityRegistry.ts` — Foundation v1.0
  scaffold, idem paralelo sem consumidor vivo.
- Qualquer novo "AdaptiveProcessRegistry" — YAGNI: com 1 processo não há
  abstração a extrair. O `AdaptiveProcessConnector` detém diretamente a
  instância de `DeepResearchProcess`. Quando o 2º processo chegar, a
  abstração já estará lá (interface `AdaptiveProcess`) e o registry surgirá
  naturalmente. Criar agora é abstração para 1.

### 3.5 Reuso do padrão já vivo

O padrão "shell fino + implementação interna isolada" já é vivo:
- `MicrosoftGraphConnector` (shell) + 11 Capability Executors (ADR-013)
- `WhatsAppConnector` (shell) + 3 providers + observation bridge
- `ExecutionIntelligence` (shell) + 7 módulos internos (ADR-015)

O `AdaptiveProcessConnector` segue o mesmo molde: shell fino que delega ao
`DeepResearchProcess`. Não inventa padrão novo.

---

## 4. Invariants arquiteturais (não-negociáveis)

1. **Arquitetura pública inalterada** — 4 elementos (Planner → Capability
   Registry → Dispatcher → Connector). Adaptive Process é detalhe de
   implementação, não elemento público.
2. **Bifurcação declarada, não invisível** — o flag `composite` no metadata
   diz a verdade ao Runtime sobre o que está executando. Sem o flag, o
   hibridismo cria bifurcação encoberta (capabilities atômicas e compostas
   indistinguíveis).
3. **Reentrada pela cadeia completa** — sub-capabilities invocadas pelo
   Adaptive Process passam por `processCapability` (Intelligence + Safety +
   Dispatch), não por atalho. Bypass impossível por construção (herda
   ADR-015 invariant #1).
4. **YAGNI no registry** — não criar `AdaptiveProcessRegistry` até o 2º
   processo existir. A interface `AdaptiveProcess` nasce agora; o registry
   surge quando há 2 instâncias para discriminar.
5. **Aditivo apenas** — nada é apagado. O caminho antigo segue 100%
   intocado até `deepResearch` ser roteado pelo Planner (AP-05).

---

## 5. Alternativas consideradas

### Alternativa A — Deep Research como Goal (rejeitada)
Forçar o Planner a iterar reflexivamente sobre resultados. Rejeitada: o
Planner é declarativo e estático por SRP (ADR-015); iteração reflexiva com
critério de parada próprio não é sua responsabilidade. Criaria um
segundo Planner ("Planner iterativo"), fragmentando o mental model.

### Alternativa B — Deep Research como Capability comum (rejeitada)
Registrar `deepResearch` sem flag, tratando uniformemente a `gmail.send`.
Rejeitada: cria bifurcação invisível (Runtime aplica política de execução
atômica a um processo composto). Bug silencioso de budget/timeout/audit/auth
(detalhado na seção 1).

### Alternativa C — Adaptive Process como categoria pública (rejeitada)
Adicionar "Cognitive Process" como 5º elemento visível:
`Planner → Capability Registry → Cognitive Process → Dispatcher → Connector`.
Rejeitada: aumenta o modelo mental sem necessidade. A arquitetura pública
deve permanecer simples. O hibridismo (externo capability, interno
processo) preserva a simplicidade externa e a abstração reutilizável interna.

### Alternativa D — AdaptiveProcessRegistry desde o início (rejeitada)
Criar o registry de processos junto com a primeira instância. Rejeitada
por YAGNI: com 1 processo não há abstração a extrair. A interface
`AdaptiveProcess` nasce agora; o registry surge quando o 2º processo
(Deep Planning, RCA, etc.) for concreto. Criar agora é abstração para 1.

### Alternativa E — Nome "Cognitive Process" (rejeitado)
Limita a futuros processos LLM-driven. Compliance, Negotiation,
Optimization são adaptativos sem serem cognitivos. "Adaptive" captura a
propriedade ontológica real (replaneja baseado em resultados) sem viés de
mecanismo.

---

## 6. Consequências

### Positivas
- Deep Research roteável pelo Planner como qualquer capability (zero
  aprendizado novo para desenvolvedores).
- Runtime aplica política correta a processos compostos sem novo conceito
  público.
- Forma interna (plan → invoke → reflect → gap → stop → synthesize)
  reutilizável por futuros Adaptive Processes (Deep Planning, RCA,
  Strategy Builder, etc.) — a interface `AdaptiveProcess` já nasce.
- Árvore de correlação preservada (sub-caps visíveis como filhas do
  deepResearch em `SystemEvent`).
- Arquitetura pública permanece 4 elementos.

### Negativas
- O Runtime ganha um branch (`if composite → política composta`).
  Mitigada: branch é puro wiring de política, não lógica de negócio; vive
  em um helper isolado, não polui `processCapability` (que permanece puro
  wiring por ADR-015 invariant #3).
- O `AdaptiveProcessConnector` chama de volta o Runtime (referência
  circular conceitual). Mitigada: a referência é injetada via contexto de
  execução ou setter no wiring (index.ts), não no constructor — mesmo
  padrão de `getExecutionRuntime()` lazy.

### Neutras
- `ConnectorMetadata` ganha mais um campo opcional. `ConnectorBootstrap`
  não o valida (igual a `capabilityReversibility`). Connectors que não
  declaram `composite` continuam funcionando.

---

## 7. Fases de implementação (aditivas, reversíveis, nada quebra)

| Sprint | Foco | Entregável | Risco |
|---|---|---|---|
| AP-01 | `composite` metadata flag | Campo `capabilityComposite?: Record<string, boolean>` em `ConnectorTypes.ts`. Espelha `capabilityReversibility`. Nada lê o campo ainda. | Zero |
| AP-02 | AdaptiveProcess interface + DeepResearchProcess | `adaptive-process/AdaptiveProcess.ts` (interface base: plan/invoke/reflect/gap/stop/synthesize) + `DeepResearchProcess.ts` (primeira implementação). Nenhum connector, nenhum wiring, nenhum caller. | Zero |
| AP-03 | AdaptiveProcessConnector + mapping | `AdaptiveProcessConnector.ts` (id `"adaptive-process"`, capability `["deepResearch"]`, `composite: true`, reversibility `safe`) registrado no `ConnectorBootstrap`. Mapping `deepResearch` no `GoalCapabilityRegistry`. O goal ainda não tem sinais no `GoalRegistry` → Planner não roteia ainda. Zero produção. | Baixo |
| AP-04 | Runtime: política de execução composta | `processCapability` lê `composite` → aplica sub-budget, `parentExecutionId` threading, timeout estendido. `DeepResearchProcess` invoca sub-caps via `runtime.processCapability({ ..., parentExecutionId })`. Correlação em árvore via `SystemEvent.parentId`. | Médio (gatilho: AP-03 verde em staging) |
| AP-05 | Exposição ao usuário | Sinais `deepResearch` adicionados ao `GoalRegistry` ("pesquise a fundo", "investigue a fundo", "deep research"). Planner passa a rotear. Primeiro uso real. | Baixo |

AP-01/AP-02 são fundação zero-risco. AP-03 wired sem expor. AP-04 é a
evolução real do Runtime. AP-05 abre ao usuário. Cada sprint deploya
sozinha; build verde entre fases.

---

## 8. Nao-quebra (verificação)

### 8.1 Cadeia atual preservada
`ExecutionRuntime.processCapability` (ADR-015) ganha um branch de política,
não uma reescrita. O caminho de capabilities não-composite é idêntico.
`UCRBridge`, `PipelineObservationBridge`, `ConnectorBootstrap`,
`GoalCapabilityRegistry` — todos intocados até AP-03/AP-05.

### 8.2 Caminho antigo sempre funciona
Até AP-05, `deepResearch` não tem sinais no `GoalRegistry` → Planner nunca
o roteia → nenhum caller vivo o invoca. O `AdaptiveProcessConnector`
registrado em AP-03 é inerte até AP-05.

### 8.3 Cada fase deploya sozinha
Não há dependência que exija 2 fases no mesmo deploy. Build verde entre
fases.

### 8.4 Componentes intocados
Os 11 Capability Executors do Microsoft Graph (ADR-013), os 3 providers do
WhatsApp, os 11 executors do Base44 (RFC-009), o Execution Intelligence
completo (ADR-015 EI-01..EI-07) — todos intocados. A nova camada senta ao
lado do que já funciona.

### 8.5 Anti-dead-end aplicado
- Flag no `ConnectorTypes.ts` (caminho vivo), não nos 2 Capability
  Registries paralelos (`src/lib/marketplace/`, `src/lib/capabilities/registry/`).
- Código em `src/lib/execution-intelligence/adaptive-process/` (vivo),
  não em `src/runtime/` ou `src/sdk/` (árvores paralelas mortas).
- Sem `AdaptiveProcessRegistry` (YAGNI — 1 processo não justifica).

---

## 9. O que NÃO está neste RFC (honesto)

- **AdaptiveProcessRegistry** — só quando o 2º Adaptive Process (Deep
  Planning, RCA, etc.) for concreto. YAGNI.
- **Outros Adaptive Processes** — Deep Planning, Root Cause Analysis,
  Opportunity Discovery, Strategy Builder, Multi-Agent Investigation,
  Compliance, Negotiation, Optimization. A interface `AdaptiveProcess`
  nasce pronta para eles, mas este RFC só entrega `DeepResearchProcess`.
- **Enriquecimento LLM real dentro do DeepResearchProcess** — a heurística
  de plan/reflect/gap/synthesize pode usar InvokeLLM; o detalhe do prompt
  fica para a implementação de AP-02, não para este RFC.
- **Migração de fluxos existentes** — nenhum caller vivo é alterado. O
  Reasoning Layer pode passar a invocar `deepResearch` no futuro, mas isso
  é pós-AP-05 e fora deste escopo.

---

## 10. Critérios de aceitação

- ADR-017 aceita.
- SPRINTS.md atualizado com seção AP-01 a AP-05.
- MEB atualizado com EPIC-020.
- CLAUDE.md atualizado com esta sessão.
- Antes de AP-01: nenhum código alterado (esta fase é só documentação).

---

## 11. Referências

- ADR-015 (Execution Intelligence Engine) — cadeia `processCapability`
  onde o flag `composite` se pluga; invariants de bypass e wiring puro
  herdados.
- ADR-013 (Capability Executors Pattern) — padrão "shell fino + implementação
  interna isolada" reusado.
- ADR-014 (Provider Router) — padrão shell + modulos internos reusado.
- RFC-008 (Execution Intelligence Engine) — estrutura de RFC seguida.
- SPRINTS.md — seção EI-01 a EI-07 como modelo de sprint table.
- CLAUDE.md seção "Método de verificação" — anti-dead-end aplicado antes
  de escrever (árvores paralelas, registries duplicados).

---

*RFC-010 — Adaptive Process Engine — Proposed — 2026-08-05*