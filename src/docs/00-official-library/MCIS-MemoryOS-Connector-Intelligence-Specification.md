# MemoryOS Connector Intelligence Specification (MCIS)

**Versão:** 1.0  
**Status:** Oficial  
**Tipo:** Documento Arquitetural — Connector Intelligence  
**Posição na Biblioteca:** MV → MPS → MAS → MES → MCF → **MCIS** → MDS  
**Alinhamento:** MV 1.0 · MAS 1.0 · MES 1.0 · MCF 1.0  
**Referência Cruzada:** MCIS-Registry · MCIS-Contracts · MCIS-Intelligence

---

## Declaração de Propósito

Este documento define a **camada de inteligência** dos Connectors do MemoryOS.

Enquanto o MCF define *como* um Connector é construído, autenticado e executado, o MCIS define *como* um Connector **se descreve**, **se registra**, **é descoberto** e **é selecionado automaticamente** pelo Core sem que nenhum código específico precisc conhecer a existência de nenhum Connector particular.

O MCIS não altera nenhuma decisão arquitetural do MAS, MES ou MCF.  
Ele formaliza a **inteligência declarativa** que transforma um Connector de um executor passivo em um participante ativo e autodescritivo do ecossistema MemoryOS.

> **Princípio Central:** O Core nunca conhece o Gmail. Ele conhece capacidades. O MCIS é o contrato que torna isso possível em escala.

---

## Índice do MCIS

- **MCIS** (este arquivo) — Fundamentos, Conceitos, Ontologia, Self-Description
- **MCIS-Registry** — Registries, Grafos, Taxonomia, Discovery Automático
- **MCIS-Intelligence** — Seleção, Aprendizado, Planejamento, Sugestão
- **MCIS-Flows** — Fluxos completos, UML, Diagramas, Exemplos

---

# PARTE I — FUNDAMENTOS

---

## 1. Conceito Oficial de Connector Intelligence

### 1.1 Definição

**Connector Intelligence** é o conjunto estruturado de metadados semânticos, contratos formais e capacidade de autodescriação que permite a um Connector comunicar ao Core — de forma completamente automática e sem intervenção humana — tudo que ele pode fazer, como pode ser composto com outros Connectors, quais entidades manipula, quais dependências possui e quais contextos requer.

Um Connector **sem** Connector Intelligence:
```
Core → "Preciso enviar um e-mail" → [busca manual em código] → GmailConnector
```

Um Connector **com** Connector Intelligence:
```
Core → "Preciso enviar uma mensagem de texto para João" 
     → [consulta Capability Registry por inteligência]
     → encontra: GmailConnector(SEND_EMAIL), 
                 WhatsAppConnector(SEND_MESSAGE),
                 SlackConnector(POST_MESSAGE)
     → seleciona baseado em: contexto + permissões + desempenho + histórico
     → executa sem código específico
```

### 1.2 Camadas do Modelo MCIS

```
┌──────────────────────────────────────────────────────────────────┐
│                    MODELO DE INTELIGÊNCIA MCIS                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Camada 4 — APRENDIZADO         (uso, padrões, sugestões)       │
│  ─────────────────────────────────────────────────────          │
│  Camada 3 — SELEÇÃO INTELIGENTE (custo, desempenho, contexto)   │
│  ─────────────────────────────────────────────────────          │
│  Camada 2 — DESCOBERTA          (auto-registration, hot-plug)   │
│  ─────────────────────────────────────────────────────          │
│  Camada 1 — SELF-DESCRIPTION    (registries, contratos)         │
│  ─────────────────────────────────────────────────────          │
│  Camada 0 — EXECUÇÃO            (MCF — Connector base)          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Diferença entre Execução e Inteligência

```
┌────────────────────────────────────────────────────────────────────┐
│           EXECUÇÃO (MCF)          │    INTELIGÊNCIA (MCIS)         │
├───────────────────────────────────┼────────────────────────────────┤
│ Responde: "O que fazer?"          │ Responde: "O que sou capaz     │
│                                   │  de fazer e como me usar?"     │
├───────────────────────────────────┼────────────────────────────────┤
│ Interface: execute(request)       │ Interface: describe(), graph(), │
│                                   │  ontology(), discover()        │
├───────────────────────────────────┼────────────────────────────────┤
│ Contrato: ConnectorRequest →      │ Contrato: ConnectorIntelligence│
│           ConnectorResponse       │  (imutável, declarativo)       │
├───────────────────────────────────┼────────────────────────────────┤
│ Tempo: Runtime                    │ Tempo: Registro + Runtime      │
├───────────────────────────────────┼────────────────────────────────┤
│ Conhece: payloads, APIs           │ Conhece: semântica, ontologia, │
│                                   │  dependências, entidades       │
├───────────────────────────────────┼────────────────────────────────┤
│ Exemplo: GmailConnector.execute() │ Exemplo: GmailConnector        │
│   → chama API Google              │   declara: "posso enviar       │
│                                   │   mensagens de texto para      │
│                                   │   endereços de e-mail"         │
└───────────────────────────────────┴────────────────────────────────┘
```

---

## 3. Self Description

O Self Description é o documento vivo e imutável que todo Connector deve produzir na inicialização.

### 3.1 Interface de Self Description

```typescript
interface ConnectorSelfDescription {
  // ─── Identidade (derivada do Manifesto MCF) ──────────────────
  identity: ConnectorIdentity;

  // ─── Capacidades ──────────────────────────────────────────────
  capabilities: ConnectorCapabilityDescriptor[];

  // ─── Entidades que manipula ───────────────────────────────────
  entities: ConnectorEntityDescriptor[];

  // ─── Ações disponíveis ────────────────────────────────────────
  actions: ConnectorActionDescriptor[];

  // ─── Eventos que emite ────────────────────────────────────────
  events: ConnectorEventDescriptor[];

  // ─── Eventos que consome ──────────────────────────────────────
  consumedEvents: ConnectorEventDescriptor[];

  // ─── Workflows suportados ─────────────────────────────────────
  workflows: ConnectorWorkflowDescriptor[];

  // ─── Permissões ───────────────────────────────────────────────
  permissions: ConnectorPermissionDescriptor[];

  // ─── Restrições ───────────────────────────────────────────────
  constraints: ConnectorConstraintDescriptor[];

  // ─── Dependências ─────────────────────────────────────────────
  dependencies: ConnectorDependencyDescriptor[];

  // ─── Requisitos de contexto ───────────────────────────────────
  contextRequirements: ContextRequirements;

  // ─── Requisitos de memória ────────────────────────────────────
  memoryRequirements: MemoryRequirements;

  // ─── Semântica ────────────────────────────────────────────────
  semantics: ConnectorSemantics;

  // ─── Descrição em linguagem natural ──────────────────────────
  naturalLanguage: NaturalLanguageDescription;

  // ─── Ontologia ────────────────────────────────────────────────
  ontology: ConnectorOntologyMapping;

  // ─── Métricas de seleção ──────────────────────────────────────
  selectionMetrics: SelectionMetrics;

  // ─── Versão desta descrição ───────────────────────────────────
  descriptionVersion: string;
  generatedAt: string;
}
```

### 3.2 Self Discovery

O Self Discovery é o processo pelo qual o Core — ou qualquer módulo autorizado — descobre automaticamente todos os Connectors disponíveis e suas capacidades sem conhecer nenhum Connector específico.

```
┌────────────────────────────────────────────────────────────────┐
│                   FLUXO DE SELF DISCOVERY                      │
└────────────────────────────────────────────────────────────────┘

  Connector instalado (Hot Plug)
         │
         ▼
  Connector.describe() → produz ConnectorSelfDescription
         │
         ▼
  Auto Registration → MCIS Registry Engine
         │
  ┌──────┴──────┐
  │             │
  ▼             ▼
  Capability    Entity
  Registry      Registry
  │             │
  ▼             ▼
  Action        Event
  Registry      Registry
  │             │
  ▼             ▼
  Capability  Workflow
  Graph       Registry
         │
         ▼
  Core pode descobrir e usar o Connector
  SEM nenhuma alteração de código
```

---

## 4. Ontologia Oficial dos Connectors

A Ontologia define o vocabulário semântico universal que todos os Connectors devem utilizar para descrever suas capacidades, independente da tecnologia subjacente.

### 4.1 Hierarquia Ontológica

```
CONNECTOR_DOMAIN (raiz)
│
├── COMMUNICATION
│   ├── MESSAGING
│   │   ├── EMAIL         (Gmail, Outlook, SMTP)
│   │   ├── INSTANT_MSG   (WhatsApp, Telegram, Slack)
│   │   ├── SMS           (Twilio, AWS SNS)
│   │   └── NOTIFICATION  (Push, In-App)
│   └── AUDIO_VIDEO
│       ├── CALL          (Twilio Voice)
│       └── CONFERENCE    (Google Meet, Zoom)
│
├── PRODUCTIVITY
│   ├── CALENDAR          (Google Calendar, Outlook)
│   ├── TASKS             (Google Tasks, Todoist)
│   ├── DOCUMENTS         (Google Docs, Word)
│   └── STORAGE           (Google Drive, Dropbox)
│
├── COMMERCE
│   ├── ECOMMERCE
│   │   ├── MARKETPLACE   (Mercado Livre, Amazon)
│   │   └── STOREFRONT    (Shopify, WooCommerce)
│   ├── FINANCIAL
│   │   ├── ERP_FINANCIAL  (Bling, QuickBooks)
│   │   ├── PAYMENT        (Stripe, PagSeguro)
│   │   └── BANKING        (Open Banking)
│   └── LOGISTICS
│       ├── SHIPPING       (Correios, FedEx)
│       └── TRACKING       (Zebra, IoT)
│
├── ENTERPRISE
│   ├── ERP               (TOTVS, SAP, Oracle)
│   ├── CRM               (Salesforce, HubSpot)
│   └── HCM               (SAP HR, BambooHR)
│
├── TRAVEL
│   ├── GDS               (Sabre, Amadeus, Galileo)
│   ├── HOTEL             (Booking, Expedia)
│   └── CAR               (Rent a Car APIs)
│
├── BLOCKCHAIN
│   ├── WALLET            (Phantom, MetaMask)
│   ├── BRIDGE            (LayerZero)
│   ├── ORACLE            (Chainlink)
│   └── DEFI              (Uniswap, Aave)
│
└── IOT
    ├── INDUSTRIAL        (Zebra, Siemens)
    ├── SMART_HOME        (Nest, Ring)
    └── WEARABLE          (Fitbit, Garmin)
```

### 4.2 Mapeamento Ontológico por Connector

```typescript
interface ConnectorOntologyMapping {
  // Posição na hierarquia
  domain: OntologyDomain;           // Ex: "COMMERCE"
  subdomain: OntologySubdomain;     // Ex: "ECOMMERCE"
  category: OntologyCategory;       // Ex: "MARKETPLACE"

  // Entidades do mundo real que este Connector representa
  realWorldEntities: RealWorldEntity[];
  // Ex: GmailConnector → ["EMAIL_MESSAGE", "EMAIL_THREAD", "EMAIL_LABEL", "EMAIL_ATTACHMENT"]

  // Verbos que este Connector executa
  semanticVerbs: SemanticVerb[];
  // Ex: GmailConnector → ["SEND", "READ", "SEARCH", "DELETE", "ARCHIVE", "LABEL"]

  // Relação com outros conceitos da ontologia
  relatedDomains: OntologyDomain[];
  // Ex: GmailConnector → ["PRODUCTIVITY", "COMMUNICATION"]

  // Tags semânticas para busca
  semanticTags: string[];
  // Ex: ["email", "messaging", "google", "communication", "async"]
}
```

### 4.3 Taxonomia Oficial

```
TAXONOMIA DE CAPACIDADES MCIS

Nível 0 — Domínio:        COMMUNICATION
Nível 1 — Subdomain:      MESSAGING
Nível 2 — Categoria:      EMAIL
Nível 3 — Capacidade:     SEND_EMAIL
Nível 4 — Ação:           GmailConnector.SEND_EMAIL(to, subject, body, attachments)

Busca do Core:
  "enviar mensagem para João"
       │
       ▼
  semantic match: COMMUNICATION → MESSAGING
       │
       ▼
  candidate capabilities: SEND_EMAIL, SEND_MESSAGE, SEND_SMS
       │
       ▼
  context filter: João tem e-mail no perfil → SEND_EMAIL
       │
       ▼
  connector selection: GmailConnector (autorizado, < 50ms avg)
```

---

## 5. Descrição em Linguagem Natural

Todo Connector deve produzir uma descrição em linguagem natural que o Core pode usar para matching semântico:

```typescript
interface NaturalLanguageDescription {
  // Descrição resumida (1 linha)
  summary: string;
  // Ex: "Acessa o Gmail para enviar, ler e gerenciar e-mails do usuário"

  // Descrição completa
  description: string;

  // O que este Connector pode fazer (frases afirmativas)
  canDo: string[];
  // Ex: [
  //   "Enviar e-mails com ou sem anexos",
  //   "Ler e-mails por remetente, assunto ou data",
  //   "Pesquisar e-mails com filtros avançados",
  //   "Organizar e-mails em pastas e etiquetas",
  //   "Arquivar ou excluir e-mails"
  // ]

  // O que este Connector NÃO pode fazer
  cannotDo: string[];
  // Ex: [
  //   "Enviar SMS ou mensagens de WhatsApp",
  //   "Acessar e-mails de outros provedores sem configuração"
  // ]

  // Exemplos de uso em linguagem natural
  usageExamples: NaturalLanguageExample[];
  // Ex: [
  //   { input: "Responda o e-mail do João", resolves: true },
  //   { input: "Envie o relatório para a equipe", resolves: true },
  //   { input: "Agende uma reunião", resolves: false }  // → Calendar Connector
  // ]

  // Idiomas suportados
  supportedLanguages: string[];   // ["pt-BR", "en-US", "es"]

  // Palavras-chave para busca semântica
  keywords: string[];
}
```

---

## 6. UML — Diagrama de Classes do MCIS

```
┌────────────────────────────────────────────────────────────────────────┐
│                    ConnectorSelfDescription                            │
├────────────────────────────────────────────────────────────────────────┤
│ + identity: ConnectorIdentity                                          │
│ + capabilities: ConnectorCapabilityDescriptor[]                        │
│ + entities: ConnectorEntityDescriptor[]                                │
│ + actions: ConnectorActionDescriptor[]                                 │
│ + events: ConnectorEventDescriptor[]                                   │
│ + workflows: ConnectorWorkflowDescriptor[]                             │
│ + permissions: ConnectorPermissionDescriptor[]                         │
│ + constraints: ConnectorConstraintDescriptor[]                         │
│ + dependencies: ConnectorDependencyDescriptor[]                        │
│ + contextRequirements: ContextRequirements                             │
│ + memoryRequirements: MemoryRequirements                               │
│ + semantics: ConnectorSemantics                                        │
│ + naturalLanguage: NaturalLanguageDescription                          │
│ + ontology: ConnectorOntologyMapping                                   │
│ + selectionMetrics: SelectionMetrics                                   │
└──────────────────────┬─────────────────────────────────────────────────┘
                       │ uses
        ┌──────────────┼──────────────────────────────────┐
        │              │                                  │
┌───────▼──────┐ ┌─────▼────────┐           ┌────────────▼──────────────┐
│ Capability   │ │   Entity     │           │    MCIS Registry Engine   │
│ Descriptor   │ │  Descriptor  │           ├───────────────────────────┤
├──────────────┤ ├──────────────┤           │ + capabilityRegistry      │
│ name         │ │ entityName   │           │ + entityRegistry           │
│ domain       │ │ schema       │           │ + actionRegistry           │
│ semanticVerb │ │ operations   │           │ + eventRegistry            │
│ inputSchema  │ │ relationships│           │ + workflowRegistry         │
│ outputSchema │ │ ontologyType │           │ + capabilityGraph          │
│ constraints  │ │              │           │ + register()               │
│ cacheable    │ │              │           │ + discover()               │
│ cost         │ └──────────────┘           │ + search()                 │
└──────────────┘                            │ + findBySemantics()        │
                                            └───────────────────────────┘
```

---

## 7. Regras Obrigatórias para Todo Connector Oficial MCIS

```
┌─────────────────────────────────────────────────────────────────────┐
│           CHECKLIST MCIS OBRIGATÓRIO                                │
└─────────────────────────────────────────────────────────────────────┘

SELF DESCRIPTION
  ✅ Implementa describe() retornando ConnectorSelfDescription válido
  ✅ Mapeamento ontológico completo
  ✅ Descrição em linguagem natural (mínimo pt-BR e en-US)
  ✅ Todos os actions documentados com inputSchema + outputSchema
  ✅ Todos os events documentados
  ✅ Constraints declaradas
  ✅ Dependencies declaradas

REGISTRIES
  ✅ Registra no CapabilityRegistry no initialize()
  ✅ Registra no EntityRegistry com schemas completos
  ✅ Registra no ActionRegistry com contratos de I/O
  ✅ Registra no EventRegistry com payloads declarados
  ✅ Registra no WorkflowRegistry (se suportar workflows)

DISCOVERY
  ✅ Suporta Hot Plug (registro automático na inicialização)
  ✅ Suporta Hot Remove (desregistro automático no destroy())
  ✅ Suporta Auto Version Negotiation
  ✅ Suporta Auto Dependency Resolution

INTELIGÊNCIA
  ✅ selectionMetrics implementadas e atualizadas
  ✅ Relatório de uso emitido via UEB a cada execução
  ✅ Suporte a Capability Graph (declara composabilidade)
```

---

**Documento Oficial:** MCIS — MemoryOS Connector Intelligence Specification  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 1 de 4 — Fundamentos, Conceitos, Ontologia, Self-Description