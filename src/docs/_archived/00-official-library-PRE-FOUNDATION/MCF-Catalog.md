# MCF-Catalog — SDK, Marketplace, Templates, Fluxos e Exemplos

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 5 de 5 do MCF  
**Referência:** MCF §41-50 — SDK, Templates, Fluxos, Exemplos

---

## 1. SDK Oficial do MCF

O MCF SDK é a biblioteca oficial para desenvolvimento de Connectors no MemoryOS.

Após a adoção do MCF, **nenhum Connector pode ser desenvolvido sem o MCF SDK**.

### 1.1 Pacotes do SDK

```
@memoryos/connector-sdk
├── @memoryos/connector-sdk/core
│   ├── BaseConnector          # Classe base obrigatória
│   ├── ConnectorManifest      # Builder de manifesto
│   └── ConnectorLifecycle     # Gerenciador de ciclo de vida
│
├── @memoryos/connector-sdk/auth
│   ├── OAuth2Manager          # OAuth 2.0 e PKCE
│   ├── ApiKeyManager          # API Keys criptografadas
│   └── TokenStore             # Vault de tokens
│
├── @memoryos/connector-sdk/resilience
│   ├── RetryManager           # Políticas de retry
│   ├── CircuitBreaker         # Circuit breaker
│   └── TimeoutManager         # Controle de timeout
│
├── @memoryos/connector-sdk/cache
│   └── CacheManager           # Cache com TTL e invalidação
│
├── @memoryos/connector-sdk/events
│   └── EventEmitter           # Integração com UEB
│
├── @memoryos/connector-sdk/observability
│   ├── Logger                 # Logging estruturado
│   ├── Metrics                # Telemetria
│   └── AuditLogger            # Auditoria imutável
│
├── @memoryos/connector-sdk/security
│   ├── SandboxValidator       # Validação de sandbox
│   └── SignatureVerifier      # Assinatura digital
│
└── @memoryos/connector-sdk/testing
    ├── ConnectorTestSuite     # Suíte de testes oficial
    ├── MockApiServer          # Servidor de mock para testes
    └── ConnectorSimulator     # Simulador (Sprint 30)
```

### 1.2 Template Oficial de Connector

```javascript
// connectors/my-service/MyServiceConnector.js
import { BaseConnector } from "@memoryos/connector-sdk/core";
import { buildManifest } from "@memoryos/connector-sdk/core";
import { OAuth2Manager } from "@memoryos/connector-sdk/auth";

const MANIFEST = buildManifest({
  connectorName: "MyServiceConnector",
  vendor: "my-company",
  connectorVersion: "1.0.0",
  sdkCompatibility: ">=1.0.0",
  minimumMemoryOSVersion: "1.0.0",
  category: "messaging",
  connectorType: "BIDIRECTIONAL",
  description: "Connector oficial para MyService",
  tags: ["messaging", "notifications"],
  supportedEvents: ["message.received"],
  supportedActions: ["SEND_MESSAGE", "READ_MESSAGE", "LIST_MESSAGES"],
  supportedCapabilities: ["READ", "WRITE"],
  permissions: [
    {
      name: "MESSAGE_READ",
      level: "READ_FULL",
      scope: "myservice:messages:read",
      required: true
    },
    {
      name: "MESSAGE_SEND",
      level: "WRITE",
      scope: "myservice:messages:send",
      required: false
    }
  ],
  authType: "OAUTH2",
  sandboxed: true,
  signatureAlgorithm: "RSA-SHA256",
  publicKey: process.env.CONNECTOR_PUBLIC_KEY,
  signature: process.env.CONNECTOR_SIGNATURE,
  qualityLevel: "PARTNER",
  documentationUrl: "https://docs.my-company.com/memoryos-connector",
  supportEmail: "connectors@my-company.com",
  licenseType: "Apache-2.0"
});

export class MyServiceConnector extends BaseConnector {
  constructor() {
    super(MANIFEST);
    this.authManager = new OAuth2Manager({
      clientId: process.env.MYSERVICE_CLIENT_ID,
      clientSecret: process.env.MYSERVICE_CLIENT_SECRET,
      authorizationUrl: "https://auth.myservice.com/oauth/authorize",
      tokenUrl: "https://auth.myservice.com/oauth/token",
      scopes: ["myservice:messages:read", "myservice:messages:send"]
    });
  }

  // ─── Ações ────────────────────────────────────────────
  async SEND_MESSAGE({ to, subject, body }) {
    const response = await this._apiCall("POST", "/messages", { to, subject, body });
    return this._normalize(response);
  }

  async READ_MESSAGE({ messageId }) {
    return this._cachedApiCall(
      "GET",
      `/messages/${messageId}`,
      { cacheTtl: 300 }
    );
  }

  async LIST_MESSAGES({ limit = 20, offset = 0 }) {
    return this._cachedApiCall(
      "GET",
      "/messages",
      { params: { limit, offset }, cacheTtl: 120 }
    );
  }
}
```

---

## 2. Regras Obrigatórias para Publicação

Um Connector só pode ser publicado no Marketplace MCF se passar por todas as verificações:

```
┌─────────────────────────────────────────────────────────────────┐
│               CHECKLIST DE PUBLICAÇÃO MCF                       │
└─────────────────────────────────────────────────────────────────┘

IDENTIDADE E MANIFESTO
  ✅ Manifesto completo e válido
  ✅ connectorName único no Marketplace
  ✅ Versão semântica correta (MAJOR.MINOR.PATCH)
  ✅ Assinatura digital válida (nível PARTNER ou CERTIFIED)
  ✅ sdkCompatibility declarada
  ✅ minimumMemoryOSVersion declarada

INTERFACE
  ✅ Implementa 100% da interface MemoryOSConnector
  ✅ Todos os métodos obrigatórios presentes
  ✅ Contratos de entrada/saída documentados (JSON Schema)

SEGURANÇA
  ✅ Sandbox habilitado
  ✅ Apenas hosts declarados no manifesto são acessados
  ✅ Nenhuma credencial hardcoded
  ✅ Tokens nunca logados
  ✅ TLS em todas as chamadas externas

RESILIÊNCIA
  ✅ Circuit Breaker implementado
  ✅ Retry Policy configurada
  ✅ Timeout definido para cada ação
  ✅ Health check funcional

OBSERVABILIDADE
  ✅ Logs estruturados (sem dados sensíveis)
  ✅ Métricas emitidas
  ✅ Todos os eventos obrigatórios emitidos
  ✅ Auditoria registrada por request

TESTES
  ✅ Cobertura mínima de 80% (COMMUNITY)
  ✅ Cobertura mínima de 95% (PARTNER)
  ✅ Cobertura mínima de 100% (CERTIFIED)
  ✅ Testes unitários + integração + snapshot
  ✅ Testes de resiliência (falha de rede, timeout, auth error)

DOCUMENTAÇÃO
  ✅ README com instalação e configuração
  ✅ Todas as actions documentadas
  ✅ Todos os eventos documentados
  ✅ Exemplos de uso
  ✅ CHANGELOG mantido

PRIVACIDADE
  ✅ Declaração LGPD/GDPR
  ✅ Dados PII identificados
  ✅ Sem retenção de dados além do necessário
```

---

## 3. Marketplace de Connectors

```
┌─────────────────────────────────────────────────────────────────┐
│                    MEMORYOS CONNECTOR MARKETPLACE               │
├─────────────────┬───────────────────────────────────────────────┤
│ Nível           │ Critérios                                     │
├─────────────────┼───────────────────────────────────────────────┤
│ 🏅 CERTIFIED    │ Code review oficial MCF + pen test +          │
│                 │ 100% cobertura + SLA documentado              │
├─────────────────┼───────────────────────────────────────────────┤
│ 🤝 PARTNER      │ Checklist completo + assinatura digital +     │
│                 │ 95% cobertura                                 │
├─────────────────┼───────────────────────────────────────────────┤
│ 🌐 COMMUNITY    │ Manifesto válido + 80% cobertura +            │
│                 │ interface completa (sem code review oficial)  │
└─────────────────┴───────────────────────────────────────────────┘

Pesquisa no Marketplace usa o CRE (Connector Registry Engine):
  search({ vendor, category, capability, tag, connectorType })
  findByCapability("SEND_EMAIL")
  findByCategory("ecommerce")
  checkCompatibility(connectorId, { sdkVersion, memoryOSVersion })
```

---

## 4. Fluxos Completos com Connectors Reais

### 4.1 Gmail Connector — Responder E-mail

```
Usuário: "Responda o e-mail do João dizendo que estarei na reunião."
       │
       ▼
Core interpreta: intenção = "responder e-mail"
       │
       ▼
Context Builder: recupera histórico com João da memória
       │
       ▼
Planner: objetivo = "enviar resposta ao e-mail mais recente de João"
       │
       ▼
Service Layer: "Serviço de E-mail"
       │
       ▼
Policy Engine: ✅ GMAIL_READ + GMAIL_SEND autorizados
       │
       ▼
Execution Planner:
  Step 1: SEARCH_EMAILS { from: "joao@*", limit: 1 }
  Step 2: SEND_EMAIL { to: email.from, threadId: email.id, body: "..." }
       │
       ▼
Connector Manager → GmailConnector.execute(step1)
  → API Google: GET /gmail/v1/users/me/messages?q=from:joao
  → Resposta normalizada: { messageId, from, subject, threadId }
       │
       ▼
Connector Manager → GmailConnector.execute(step2)
  → API Google: POST /gmail/v1/users/me/messages/send
  → Resposta normalizada: { sent: true, messageId }
       │
       ▼
Events emitidos:
  - connector.request.completed (search)
  - connector.request.completed (send)
       │
       ▼
Memory Update Proposal:
  { type: "FACT", data: "João confirmado para reunião", source: "GMAIL" }
       │
       ▼
Usuário: "Pronto, respondi ao e-mail do João confirmando sua presença na reunião."
```

### 4.2 Google Calendar — Agendar Reunião

```
Usuário: "Agende uma reunião com Maria amanhã às 15h por 1 hora."
       │
       ▼
Core: intenção = "criar evento no calendário"
       │
       ▼
Planner:
  1. CHECK_AVAILABILITY { date: tomorrow, time: "15:00", duration: 60 }
  2. CREATE_EVENT { ... }
  3. SEND_INVITE { attendees: ["maria@*"] }
       │
       ▼
Step 1 → GoogleCalendarConnector.execute(CHECK_AVAILABILITY)
  Resposta: { available: true }
       │
       ▼
Step 2 → GoogleCalendarConnector.execute(CREATE_EVENT)
  Payload: {
    summary: "Reunião com Maria",
    start: "2026-07-09T15:00:00",
    end: "2026-07-09T16:00:00",
    attendees: [{ email: "maria@..." }]
  }
  API: POST /calendars/primary/events
  Resposta: { eventId, htmlLink, status: "confirmed" }
       │
       ▼
Memory Update:
  { type: "EVENT", data: "Reunião com Maria 09/07 15h", source: "GCALENDAR" }
```

### 4.3 Bling + Gmail — Enviar NF-e por E-mail

```
Usuário: "Envie a NF-e 1234 para o cliente por e-mail."
       │
       ▼
Execution Planner:
  Step 1: BlingConnector.GET_INVOICE { invoiceId: "1234" }
  Step 2: GmailConnector.SEND_EMAIL {
    to: invoice.clientEmail,
    subject: "NF-e 1234",
    body: "...",
    attachment: invoice.pdfUrl
  }
       │
       ▼
Dependência gerenciada pelo Connector Manager:
  Resultado do Step 1 injetado no Step 2

Resultado: NF-e enviada + memória atualizada
```

### 4.4 Shopify + Bling — Sincronizar Pedido com ERP

```
Evento: Shopify webhook "order_created"
       │
       ▼
ShopifyConnector recebe webhook:
  1. Valida assinatura HMAC do Shopify
  2. Normaliza payload → ConnectorEvent
  3. Publica no UEB: "connector.inbound.order_created"
       │
       ▼
Connector Manager recebe evento do UEB
       │
       ▼
Policy Engine: ✅ sincronização autorizada
       │
       ▼
Execution Planner:
  Step 1: BlingConnector.CREATE_ORDER { ... dados do pedido Shopify ... }
       │
       ▼
BlingConnector.execute(CREATE_ORDER)
  API Bling: POST /pedidos
  Resposta: { orderId: "bling-5678", status: "criado" }
       │
       ▼
Memory Update:
  { type: "FACT", data: "Pedido Shopify #1234 → Bling #5678" }
```

### 4.5 Mercado Livre — Gerenciar Anúncios

```
Usuário: "Atualize o preço do produto X para R$149,90 no Mercado Livre."
       │
       ▼
MercadoLivreConnector.execute(UPDATE_PRODUCT_PRICE)
  Payload: { productId: "MLB123", price: 149.90, currency: "BRL" }
  API ML: PUT /items/MLB123 { price: 149.90 }
  Resposta: { updated: true, newPrice: 149.90 }
       │
       ▼
Connector: emite "connector.request.completed"
Memory Update: { type: "FACT", data: "Produto X atualizado para R$149,90 no ML" }
```

### 4.6 Sabre + Amadeus + Galileo — Sistema GDS de Viagens

```
Usuário: "Pesquise passagens de São Paulo para Nova York para 3 pessoas, ida e volta, 
          15 a 22 de agosto, classe econômica."
       │
       ▼
Policy Engine: usuário tem acesso a múltiplos GDS
       │
       ▼
Execution Planner: Pesquisa paralela em 3 GDS
       │
       ├── SabreConnector.SEARCH_FLIGHTS { ... }
       ├── AmadeusConnector.SEARCH_FLIGHTS { ... }   (PARALELO)
       └── GalileoConnector.SEARCH_FLIGHTS { ... }
       │
       ▼
Connector Manager agrega resultados (PARALLEL, ALL)
Timeout do grupo: 20 segundos
       │
       ▼
Core recebe lista unificada de voos
Specialist de Viagem analisa e classifica por preço/conveniência
Core apresenta opções ao usuário
```

### 4.7 LayerZero + Chainlink — Blockchain Cross-Chain

```
Usuário: "Transfira 0.5 ETH da minha carteira Ethereum para minha carteira Polygon."
       │
       ▼
Policy Engine:
  ✅ FINANCIAL + PII_ACCESS autorizados
  ✅ Valor dentro do limite diário
  ✅ 2FA confirmado
       │
       ▼
Execution Planner:
  Step 1: ChainlinkConnector.GET_PRICE { pair: "ETH/MATIC" } (para estimativa)
  Step 2: LayerZeroConnector.BRIDGE_TOKENS {
    fromChain: "ETHEREUM",
    toChain: "POLYGON",
    token: "ETH",
    amount: 0.5,
    wallet: userWallet
  }
       │
       ▼
LayerZeroConnector emite eventos:
  - "connector.blockchain.tx_submitted" (hash da transação)
  - "connector.blockchain.tx_confirmed" (após 12 confirmações)
       │
       ▼
Memory Update: { type: "FACT", data: "0.5 ETH transferido ETH→MATIC, tx: 0x..." }
```

### 4.8 Phantom (Solana) — Wallet Connector

```
Usuário: "Qual é o saldo atual da minha carteira Solana?"
       │
       ▼
PhantomConnector.execute(GET_BALANCE)
  RPC: getBalance(publicKey)
  Resposta: { sol: 12.5, usd: 1875.00, tokens: [...] }
       │
       ▼
Core apresenta saldo + histórico de transações relevantes
```

### 4.9 Zebra — IoT/Logística

```
Usuário: "Qual é a localização atual do ativo TAG-5432?"
       │
       ▼
ZebraConnector.execute(GET_ASSET_LOCATION)
  API Zebra: GET /assets/TAG-5432/location
  Resposta: {
    assetId: "TAG-5432",
    location: { lat: -23.5, lng: -46.6, floor: 3, zone: "Armazém B" },
    lastSeenAt: "2026-07-08T10:15:00Z",
    batteryLevel: 85
  }
```

### 4.10 TOTVS — ERP Corporativo

```
Usuário: "Qual é o estoque atual do produto SKU-1234?"
       │
       ▼
TOTVSConnector.execute(GET_INVENTORY)
  SOAP: consultaEstoque({ sku: "SKU-1234", empresa: "1", filial: "01" })
  Resposta normalizada: {
    sku: "SKU-1234",
    description: "Produto X",
    currentStock: 150,
    reservedStock: 30,
    availableStock: 120,
    minimumStock: 50,
    warehouseLocation: "A-03-05"
  }
```

---

## 5. Exemplos Empresariais

### 5.1 Empresa de Logística — Múltiplos Connectors Simultâneos

```
Cenário: Monitoramento de frota em tempo real

Connectors ativos simultaneamente:
  ┌─────────────────────────────────────────────────────────────┐
  │  ZebraConnector (IoT)         → Rastreamento de ativos      │
  │  TOTVSConnector (ERP)         → Ordens de serviço           │
  │  GmailConnector (Email)       → Alertas para clientes       │
  │  GoogleCalendarConnector      → Agendamento de entregas     │
  │  BlingConnector (Financeiro)  → NFe e pagamentos            │
  └─────────────────────────────────────────────────────────────┘

Fluxo:
  1. ZebraConnector recebe evento de localização (INBOUND)
  2. Core identifica desvio de rota
  3. Specialist de Logística analisa impacto
  4. Planner:
     - TOTVSConnector: atualizar status da ordem
     - GmailConnector: notificar cliente
     - GoogleCalendarConnector: reprogramar entrega
     - BlingConnector: recalcular frete (se necessário)
  5. Todos os 4 Connectors executam em paralelo
  6. Memory atualizada com novo status
```

### 5.2 E-commerce — Gestão Completa de Vendas

```
Connectors:
  ShopifyConnector    → Pedidos e produtos
  MercadoLivreConnector → Marketplace
  BlingConnector      → ERP e NF-e
  GmailConnector      → Atendimento ao cliente
  GalileoConnector    → Logística internacional

Automação:
  1. Shopify webhook → pedido novo
  2. BlingConnector: emitir NF-e
  3. GmailConnector: confirmar pedido ao cliente
  4. (se internacional) GalileoConnector: gerar documentação de exportação
```

### 5.3 Escritório de Advocacia — Gestão Documental e Agenda

```
Connectors:
  GmailConnector          → Comunicações com clientes
  GoogleCalendarConnector → Prazos processuais e audiências
  GoogleDriveConnector    → Gestão de documentos
  TOTVSConnector          → Honorários e financeiro

Fluxo de prazo processual:
  1. Advogado informa: "Prazo do processo 123 vence em 10 dias"
  2. Core + Specialist Jurídico avaliam urgência
  3. GoogleCalendarConnector: criar alerta 10, 7, 3, 1 dia antes
  4. GmailConnector: notificar sócio responsável
  5. GoogleDriveConnector: verificar documentos do processo
  6. Memory: registrar prazo na memória permanente do escritório
```

---

## 6. Exemplos Pessoais

### 6.1 Gestão Financeira Pessoal

```
Connectors:
  GmailConnector → Receber boletos e extratos por e-mail
  BlingConnector → Controle de despesas
  GoogleCalendarConnector → Alertas de vencimento

Automação:
  Gmail detecta e-mail com boleto
  Core extrai dados do boleto
  BlingConnector registra despesa
  GoogleCalendarConnector agenda alerta de vencimento
  Memory atualiza perfil financeiro do usuário
```

### 6.2 Planejamento de Viagem

```
Connectors:
  AmadeusConnector → Busca de voos
  GmailConnector → Receber confirmações
  GoogleCalendarConnector → Registrar itinerário
  GoogleDriveConnector → Salvar documentos de viagem

Usuário: "Planeje minha viagem para Lisboa de 20 a 30 de setembro"
→ Busca voos, hotéis, cria itinerário, salva documentos, agenda no calendário
```

---

## 7. Exemplos Governamentais

### 7.1 Prefeitura — Atendimento ao Cidadão

```
Connectors:
  TOTVSConnector (ERP Municipal) → Dados de processos
  GmailConnector → Comunicação com cidadão
  GoogleCalendarConnector → Agendamento de atendimentos

Usuário (cidadão): "Qual o status do meu processo de alvará?"
→ TOTVSConnector busca status → Core responde com status atual
→ GmailConnector envia confirmação por e-mail
```

### 7.2 Órgão de Saúde — Monitoramento Epidemiológico

```
Connectors:
  ZebraConnector (IoT) → Sensores hospitalares
  TOTVSConnector → Sistema de saúde
  GmailConnector → Alertas epidemiológicos
  GoogleCalendarConnector → Agenda de vacinação

Todos os Connectors BIDIRECTIONAL, operando em tempo real
Circuit breaker em todos para garantir alta disponibilidade
```

---

## 8. Exemplos com Múltiplos Connectors Simultâneos

### 8.1 Morning Briefing Diário — 8 Connectors em Paralelo

```
Usuário: "Me dê meu briefing matinal"
       │
       ▼
Execution Planner cria execução paralela (8 Connectors):

  ┌─────────────────────────────────────────────────────────────┐
  │ PARALELO (timeout grupo: 15s)                               │
  ├──────────────────────────────────────────────────────────────┤
  │ 1. GmailConnector         → E-mails não lidos              │
  │ 2. GoogleCalendarConnector→ Eventos de hoje                │
  │ 3. ShopifyConnector       → Vendas das últimas 24h         │
  │ 4. MercadoLivreConnector  → Pedidos pendentes              │
  │ 5. BlingConnector         → Receitas/despesas do dia       │
  │ 6. TOTVSConnector         → Estoque crítico                │
  │ 7. ChainlinkConnector     → Preços de ativos               │
  │ 8. ZebraConnector         → Status dos ativos em campo     │
  └─────────────────────────────────────────────────────────────┘
                         │
                         ▼
  Core + Specialists consolidam resultados
                         │
                         ▼
  Resposta: Briefing executivo personalizado em 3-5 segundos
```

---

## 9. Regras de Compatibilidade Futura

### 9.1 Garantias de Backward Compatibility

```
MAJOR version (1.x.x → 2.x.x):
  Pode: quebrar interface
  Deve: período de migração de 6 meses
  Deve: versão 1.x.x mantida em paralelo por 12 meses

MINOR version (1.0.x → 1.1.x):
  Pode: adicionar novas capabilities (backward compatible)
  Não pode: remover capabilities existentes
  Não pode: alterar contratos existentes

PATCH version (1.0.0 → 1.0.1):
  Apenas bugfixes e otimizações
  Zero impacto na interface pública
```

### 9.2 Versionamento do MCF SDK

```
MCF SDK versão: 1.0.0 (atual)
Política de suporte:
  CURRENT: 1.x.x (suporte completo)
  MAINTENANCE: versão anterior por 24 meses (bugfixes apenas)
  EOL: versões anteriores sem suporte

Connectors devem declarar:
  sdkCompatibility: ">=1.0.0 <2.0.0"
```

---

## 10. Contratos e Interfaces — Referência Rápida

```typescript
// ─── Interfaces Principais ─────────────────────────────────────

interface MemoryOSConnector { ... }         // MCF §3.1
interface ConnectorManifest { ... }         // MCF §3.2
interface ConnectorRequest { ... }          // MCF §3.3
interface ConnectorResponse { ... }         // MCF §3.4
interface ConnectorError { ... }            // MCF §3.5
interface ConnectorCapability { ... }       // MCF-Lifecycle §5
interface HealthCheckResult { ... }         // MCF-Lifecycle §8
interface AuthFlow { ... }                  // MCF-Security §2.1
interface AuditEntry { ... }               // MCF-Security §6.1
interface ConnectorMetrics { ... }          // MCF-Operations §11
interface RetryPolicy { ... }              // MCF-Operations §12
interface ConcurrencyControl { ... }        // MCF-Operations §14
interface QueuePolicy { ... }              // MCF-Operations §15
interface ParallelExecution { ... }         // MCF-Operations §17
interface MemoryUpdateProposal { ... }      // MCF-Operations §8
interface ConnectorLog { ... }             // MCF-Operations §10
interface ConnectorEvent { ... }           // MCF-Operations §1.3
interface SandboxConstraints { ... }        // MCF-Security §4.1
interface DataPrivacyPolicy { ... }         // MCF-Security §8
interface ConnectorIdentity { ... }         // MCF §1.2

// ─── Tipos ─────────────────────────────────────────────────────

type ConnectorType = "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";
type ConnectorCategory = "messaging" | "calendar" | "storage" | ...;
type AuthType = "OAUTH2" | "API_KEY" | "BEARER_TOKEN" | ...;
type ErrorCategory = "AUTH_ERROR" | "NETWORK_ERROR" | ...;
type BackoffStrategy = "EXPONENTIAL" | "LINEAR" | "JITTER" | ...;
type RequestPriority = "HIGH" | "NORMAL" | "LOW";
type PermissionLevel = "READ_BASIC" | "READ_FULL" | "WRITE" | ...;

// ─── Eventos ────────────────────────────────────────────────────

LIFECYCLE_EVENTS: { CONNECTOR_INITIALIZED, CONNECTED, ... }  // MCF-Operations §1.1
EXECUTION_EVENTS: { REQUEST_RECEIVED, COMPLETED, ... }       // MCF-Operations §1.2
SECURITY_EVENTS:  { AUTH_FAILED, PERMISSION_DENIED, ... }    // MCF-Security §5
```

---

## 11. Diagramas UML de Sequência — Multi-Connector

```
┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐
│  User    │  │  Core    │  │  Planner  │  │ Connector  │  │ External │
│          │  │          │  │  Manager  │  │            │  │  System  │
└────┬─────┘  └────┬─────┘  └─────┬─────┘  └─────┬──────┘  └────┬─────┘
     │              │              │               │               │
     │ input        │              │               │               │
     │─────────────►│              │               │               │
     │              │ plan()       │               │               │
     │              │─────────────►│               │               │
     │              │              │ execute(req)  │               │
     │              │              │──────────────►│               │
     │              │              │               │ API call      │
     │              │              │               │──────────────►│
     │              │              │               │  response     │
     │              │              │               │◄──────────────│
     │              │              │  ConnResponse │               │
     │              │              │◄──────────────│               │
     │              │ result       │               │               │
     │              │◄─────────────│               │               │
     │ answer       │              │               │               │
     │◄─────────────│              │               │               │
```

---

## 12. Glossário Oficial MCF

| Termo | Definição |
|---|---|
| **Connector** | Único componente autorizado a se comunicar com sistemas externos |
| **Manifesto** | Documento imutável e assinado que descreve o Connector |
| **CRE** | Connector Registry Engine — catálogo oficial de Connectors |
| **MCF SDK** | SDK oficial para desenvolvimento de Connectors |
| **BaseConnector** | Classe base do SDK que implementa comportamentos padrão |
| **Capability** | Ação que o Connector pode executar (ex: SEND_EMAIL) |
| **Circuit Breaker** | Mecanismo de proteção contra falhas em cascata |
| **Sandbox** | Ambiente isolado de execução do Connector |
| **MemoryUpdateProposal** | Proposta de atualização de memória retornada pelo Connector |
| **GDS** | Global Distribution System (Sabre, Amadeus, Galileo) |
| **INBOUND** | Connector que recebe dados externos (webhooks, streams) |
| **OUTBOUND** | Connector que envia dados para sistemas externos |
| **BIDIRECTIONAL** | Connector que envia e recebe dados |
| **UEB** | Universal Event Bus — barramento de eventos do MemoryOS |
| **EIL** | Enterprise Integration Layer — camada de integração corporativa |

---

**Documento Oficial:** MCF-Catalog  
**Versão:** 1.0  
**Status:** Aprovado  
**Parte:** 5 de 5 do MemoryOS Connector Framework

---

# Declaração Final do MCF

O MemoryOS Connector Framework (MCF) é o padrão definitivo para toda integração no ecossistema MemoryOS.

Nenhum Connector pode ser desenvolvido, registrado, publicado ou executado sem conformidade total com este documento.

O MCF preserva e operacionaliza os princípios fundamentais do MAS:

> **O Core pensa. Os Connectors executam.**

Toda integração no MemoryOS — sejam sistemas de e-mail, ERPs corporativos, blockchains, GDS de aviação, sistemas IoT ou qualquer tecnologia futura — deverá ser encapsulada em um Connector que respeite este Framework.

Esta é a garantia de que o MemoryOS permanecerá arquiteturalmente íntegro, escalável e preparado para milhões de usuários e milhares de Connectors ao longo de sua evolução.

---

**MCF — MemoryOS Connector Framework**  
**Versão:** 1.0 · **Status:** Aprovado · **Data:** 2026-07-08  
**Documentos:** MCF · MCF-Lifecycle · MCF-Security · MCF-Operations · MCF-Catalog