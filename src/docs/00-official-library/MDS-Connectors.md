# MDS-Connectors — Implementação dos Connectors Oficiais, Checklists e Roadmap

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 4 de 4 do MDS

---

# PARTE XI — IMPLEMENTAÇÃO DOS CONNECTORS OFICIAIS

---

## Template Oficial de Connector

```typescript
// connector-catalog/template/src/index.ts
// Base para todos os 20 connectors oficiais

import {
  BaseConnector,
  ConnectorManifest,
  ConnectorRequest,
  ConnectorResponse,
  ConnectorSelfDescription,
} from "@memoryos/connector-sdk";

export class TemplateConnector extends BaseConnector {
  static readonly MANIFEST: ConnectorManifest = {
    connectorId:           "template",
    connectorName:         "Template Connector",
    connectorVersion:      "1.0.0",
    vendor:                "MemoryOS",
    category:              "TEMPLATE",
    connectorType:         "BIDIRECTIONAL",
    sdkVersion:            "1.0.0",
    sdkCompatibility:      ">=1.0.0",
    minimumMemoryOSVersion: "1.0.0",
    supportedEvents:       [],
    supportedActions:      [],
    supportedCapabilities: [],
    permissions:           [],
    tags:                  [],
  };

  describe(): ConnectorSelfDescription {
    return {
      identity: {
        connectorId:   TemplateConnector.MANIFEST.connectorId,
        connectorName: TemplateConnector.MANIFEST.connectorName,
        version:       TemplateConnector.MANIFEST.connectorVersion,
      },
      capabilities:        [],
      entities:            [],
      actions:             [],
      events:              [],
      consumedEvents:      [],
      workflows:           [],
      permissions:         [],
      constraints:         [],
      dependencies:        [],
      contextRequirements: { requiredContextFields: [], supportsSystemContext: false, requiresProjectContext: false },
      memoryRequirements:  { readsFromMemory: [], writesToMemory: [], memoryTier: "ANY", retentionPolicy: {} },
      semantics:           { keywords: [], synonyms: [] },
      naturalLanguage:     { summary: "", canDo: [], cannotDo: [], supportedLanguages: ["pt-BR"], keywords: [] },
      ontology:            { domain: "TEMPLATE", subdomain: "", category: "", realWorldEntities: [], semanticVerbs: [], relatedDomains: [], semanticTags: [] },
      selectionMetrics:    { avgLatencyMs: 0, p95LatencyMs: 0, uptimePercent: 100, errorRatePercent: 0, creditCost: 0 },
      descriptionVersion:  "1.0",
      generatedAt:         new Date().toISOString(),
    };
  }

  async execute(request: ConnectorRequest): Promise<ConnectorResponse> {
    const action = this.actions[request.action];
    if (!action) throw new ActionNotFoundError(request.action);
    return action.execute(request.input, request.context);
  }
}
```

---

## 1. Gmail Connector

```typescript
// connector-catalog/gmail/src/gmail-connector.ts

export class GmailConnector extends BaseConnector {
  static readonly MANIFEST: ConnectorManifest = {
    connectorId:           "gmail",
    connectorName:         "Gmail",
    vendor:                "Google",
    category:              "COMMUNICATION",
    connectorType:         "BIDIRECTIONAL",
    supportedActions:      ["SEND_EMAIL", "LIST_MESSAGES", "READ_EMAIL", "SEARCH_EMAILS",
                            "DELETE_EMAIL", "ARCHIVE_EMAIL", "ADD_LABEL", "CREATE_DRAFT"],
    supportedEvents:       ["email_received", "email_read", "email_sent"],
    supportedCapabilities: ["SEND_EMAIL", "READ_EMAIL", "SEARCH_EMAIL", "MANAGE_LABELS"],
    permissions:           ["gmail.send", "gmail.readonly", "gmail.modify"],
    tags:                  ["email", "google", "communication", "messaging"],
    sdkCompatibility:      ">=1.0.0",
    minimumMemoryOSVersion: "1.0.0",
    ...
  };

  // Actions
  private async sendEmail(input: SendEmailInput): Promise<SendEmailOutput> {
    const client = await this.getGmailClient();

    const message = this.buildMimeMessage({
      to:          input.to,
      subject:     input.subject,
      body:        input.body,
      attachments: input.attachments,
      inReplyTo:   input.inReplyTo,
    });

    const encoded = Buffer.from(message).toString("base64url");
    const result  = await client.users.messages.send({
      userId:      "me",
      requestBody: { raw: encoded },
    });

    return {
      messageId: result.data.id!,
      threadId:  result.data.threadId!,
      sentAt:    new Date().toISOString(),
    };
  }

  private async listMessages(input: ListMessagesInput): Promise<ListMessagesOutput> {
    const client = await this.getGmailClient();
    const query  = this.buildGmailQuery(input);

    const list = await client.users.messages.list({
      userId: "me",
      q:      query,
      maxResults: input.limit ?? 20,
    });

    const messages = await Promise.all(
      (list.data.messages ?? []).map(m =>
        client.users.messages.get({ userId: "me", id: m.id!, format: "metadata" })
      )
    );

    return {
      messages: messages.map(m => this.normalizeMessage(m.data)),
      nextPageToken: list.data.nextPageToken,
    };
  }

  // MCIS Self-Description (resumo)
  describe(): ConnectorSelfDescription {
    return {
      ...super.buildBaseDescription(GmailConnector.MANIFEST),
      naturalLanguage: {
        summary:  "Acessa o Gmail para enviar, ler e gerenciar e-mails do usuário",
        canDo:    ["Enviar e-mails com ou sem anexos", "Ler e pesquisar e-mails",
                   "Arquivar e organizar por etiquetas", "Responder a threads existentes"],
        cannotDo: ["Enviar SMS ou WhatsApp", "Acessar e-mails de outros provedores"],
        supportedLanguages: ["pt-BR", "en-US", "es-ES"],
        keywords: ["email", "gmail", "google", "e-mail", "mensagem", "correio"],
      },
      ontology: {
        domain:             "COMMUNICATION",
        subdomain:          "MESSAGING",
        category:           "EMAIL",
        realWorldEntities:  ["EMAIL_MESSAGE", "EMAIL_THREAD", "EMAIL_LABEL", "EMAIL_ATTACHMENT"],
        semanticVerbs:      ["SEND", "READ", "SEARCH", "DELETE", "ARCHIVE", "LABEL"],
        relatedDomains:     ["PRODUCTIVITY"],
        semanticTags:       ["email", "messaging", "google", "async-communication"],
      },
    };
  }
}
```

---

## 2. Google Calendar Connector

```typescript
export class GoogleCalendarConnector extends BaseConnector {
  supportedActions = [
    "CREATE_EVENT", "UPDATE_EVENT", "DELETE_EVENT",
    "LIST_EVENTS", "FIND_FREE_SLOTS", "CREATE_MEETING",
  ];

  private async createEvent(input: CreateEventInput): Promise<CreateEventOutput> {
    const client = await this.getCalendarClient();
    const event = await client.events.insert({
      calendarId:  "primary",
      requestBody: {
        summary:     input.title,
        description: input.description,
        start:       { dateTime: input.start, timeZone: input.timezone },
        end:         { dateTime: input.end,   timeZone: input.timezone },
        location:    input.location,
        attendees:   input.attendees?.map(email => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [{ method: "email", minutes: 60 }, { method: "popup", minutes: 15 }],
        },
        conferenceData: input.createMeetLink ? {
          createRequest: { requestId: generateId("meet"), conferenceSolutionKey: { type: "hangoutsMeet" } }
        } : undefined,
      },
      conferenceDataVersion: input.createMeetLink ? 1 : 0,
    });

    return {
      eventId:  event.data.id!,
      htmlLink: event.data.htmlLink!,
      meetLink: event.data.hangoutLink,
    };
  }

  private async findFreeSlots(input: FindFreeSlotsInput): Promise<FindFreeSlotsOutput> {
    const client  = await this.getCalendarClient();
    const freebusy = await client.freebusy.query({
      requestBody: {
        timeMin:  input.from,
        timeMax:  input.to,
        items:    [{ id: "primary" }],
        timeZone: input.timezone,
      },
    });

    const busy  = freebusy.data.calendars?.primary?.busy ?? [];
    const slots = this.computeFreeSlots(input.from, input.to, busy, input.durationMinutes);
    return { freeSlots: slots };
  }
}
```

---

## 3. Shopify Connector

```typescript
export class ShopifyConnector extends BaseConnector {
  supportedActions = [
    "GET_ORDER", "LIST_ORDERS", "UPDATE_ORDER_STATUS",
    "GET_PRODUCTS", "UPDATE_PRODUCT", "CREATE_PRODUCT",
    "GET_INVENTORY", "UPDATE_INVENTORY",
    "GET_CUSTOMER", "CREATE_CUSTOMER",
    "CREATE_WEBHOOK", "PROCESS_FULFILLMENT",
  ];

  // INBOUND: Webhooks do Shopify
  supportedEvents = [
    "order_created", "order_updated", "order_cancelled",
    "order_fulfilled", "order_paid",
    "product_created", "product_updated",
    "customer_created",
  ];

  private async listOrders(input: ListOrdersInput): Promise<ListOrdersOutput> {
    const response = await this.shopifyClient.get<ShopifyOrderListResponse>(
      `/admin/api/2024-01/orders.json`, {
        status:         input.status ?? "any",
        created_at_min: input.dateFrom,
        created_at_max: input.dateTo,
        limit:          input.limit ?? 50,
      }
    );

    return {
      orders: response.orders.map(this.normalizeOrder),
      hasMore: response.orders.length === (input.limit ?? 50),
    };
  }

  // Webhook handler (INBOUND)
  async handleWebhook(payload: ShopifyWebhookPayload): Promise<void> {
    const eventType = `shopify.${payload.topic.replace("/", ".")}`;
    await this.eventBus.publish(eventType, this.normalizeWebhookPayload(payload));
  }
}
```

---

## 4. Mercado Livre Connector

```typescript
export class MercadoLivreConnector extends BaseConnector {
  supportedActions = [
    "SEARCH_ITEMS", "GET_ITEM", "CREATE_ITEM", "UPDATE_ITEM", "PAUSE_ITEM",
    "LIST_ORDERS", "GET_ORDER", "CONFIRM_PAYMENT",
    "GET_QUESTIONS", "ANSWER_QUESTION",
    "GET_REVIEWS", "GET_SELLER_METRICS",
    "UPDATE_STOCK", "GET_SHIPPING",
  ];

  private async createItem(input: CreateMLItemInput): Promise<CreateMLItemOutput> {
    const item = {
      title:          input.title.slice(0, 60),   // ML limit
      category_id:    await this.detectCategory(input.title, input.description),
      price:          input.price,
      currency_id:    "BRL",
      available_quantity: input.stock,
      buying_mode:    "buy_it_now",
      listing_type_id: input.listingType ?? "gold_special",
      condition:      input.condition ?? "new",
      description:    { plain_text: input.description },
      pictures:       input.images.map(url => ({ source: url })),
      attributes:     input.attributes,
    };

    const result = await this.mlClient.post("/items", item);
    return { itemId: result.id, permalink: result.permalink, status: result.status };
  }
}
```

---

## 5. Bling Connector

```typescript
export class BlingConnector extends BaseConnector {
  supportedActions = [
    "CREATE_INVOICE",    "GET_INVOICE",    "CANCEL_INVOICE",  "LIST_INVOICES",
    "CREATE_ORDER",      "GET_ORDER",      "UPDATE_ORDER",    "LIST_ORDERS",
    "GET_PRODUCTS",      "UPDATE_PRODUCT", "GET_STOCK",       "UPDATE_STOCK",
    "GET_CASH_FLOW",     "GET_PAYABLES",   "GET_RECEIVABLES",
    "CREATE_CUSTOMER",   "GET_CUSTOMER",
    "GET_SUPPLIERS",     "CREATE_PO",
  ];

  private async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceOutput> {
    const payload = {
      tipo:          "NF-e",
      numero:        input.number,
      serie:         input.series ?? "1",
      data_emissao:  format(new Date(), "dd/MM/yyyy"),
      cliente: {
        nome:          input.customer.name,
        cpf_cnpj:      input.customer.taxId,
        email:         input.customer.email,
        endereco:      input.customer.address,
      },
      itens: input.items.map(i => ({
        descricao:   i.description,
        quantidade:  i.quantity,
        valor_unitario: i.unitPrice,
        codigo:      i.sku,
      })),
      natureza_operacao: input.operationType ?? "Venda de Mercadoria",
    };

    const result = await this.blingClient.post("/notasfiscais", { notafiscal: payload });
    return {
      invoiceId:  result.retorno.notasfiscais[0].id,
      number:     result.retorno.notasfiscais[0].numero,
      seriesKey:  result.retorno.notasfiscais[0].chaveAcesso,
      pdfUrl:     result.retorno.notasfiscais[0].linkDanfe,
      status:     result.retorno.notasfiscais[0].situacao,
    };
  }
}
```

---

## 6. Sabre GDS Connector

```typescript
export class SabreConnector extends BaseConnector {
  supportedActions = [
    "SEARCH_FLIGHTS",     "GET_FLIGHT_DETAILS", "BOOK_FLIGHT",
    "CANCEL_BOOKING",     "CHECK_IN",           "GET_PNR",
    "SEARCH_HOTELS",      "BOOK_HOTEL",         "SEARCH_CARS",
    "PRICE_ITINERARY",    "ISSUE_TICKET",
  ];

  private async searchFlights(input: SearchFlightsInput): Promise<SearchFlightsOutput> {
    const request = {
      OTA_AirLowFareSearchRQ: {
        OriginDestinationInformation: [{
          DepartureDateTime: input.departureDate,
          OriginLocation:    { LocationCode: input.origin },
          DestinationLocation: { LocationCode: input.destination },
        }],
        TravelerInfoSummary: {
          AirTravelerAvail: [{
            PassengerTypeQuantity: [
              { Code: "ADT", Quantity: input.adults ?? 1 },
              ...(input.children ? [{ Code: "CNN", Quantity: input.children }] : []),
            ],
          }],
        },
        TravelPreferences: {
          CabinPref: [{ Cabin: this.mapCabin(input.cabin ?? "ECONOMY") }],
        },
      },
    };

    const response = await this.sabreClient.post("/v1/shop/flights/fares", request);
    return {
      offers: response.PricedItineraries?.map(this.normalizeItinerary) ?? [],
      currency: "BRL",
    };
  }
}
```

---

## 7. Phantom Wallet Connector

```typescript
export class PhantomConnector extends BaseConnector {
  supportedActions = [
    "GET_BALANCE",       "GET_PORTFOLIO",   "GET_TRANSACTIONS",
    "SIGN_TRANSACTION",  "SEND_SOL",        "SEND_TOKEN",
    "CALL_CONTRACT",     "GET_NFT_PORTFOLIO",
    "STAKE_SOL",         "UNSTAKE_SOL",
    "SWAP_TOKENS",       "GET_TX_STATUS",
  ];

  private async getPortfolio(input: GetPortfolioInput): Promise<GetPortfolioOutput> {
    const connection = new Connection(this.rpcEndpoint);
    const publicKey  = new PublicKey(input.walletAddress);

    const [solBalance, tokenAccounts] = await Promise.all([
      connection.getBalance(publicKey),
      connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      }),
    ]);

    const tokens = tokenAccounts.value
      .filter(acc => acc.account.data.parsed.info.tokenAmount.uiAmount > 0)
      .map(acc => ({
        mint:    acc.account.data.parsed.info.mint,
        balance: acc.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: acc.account.data.parsed.info.tokenAmount.decimals,
      }));

    // Enriquecer com preços via Chainlink/Pyth
    const prices = await this.priceOracle.getPrices(tokens.map(t => t.mint));

    return {
      solBalance:    solBalance / LAMPORTS_PER_SOL,
      tokens:        tokens.map(t => ({ ...t, usdValue: prices[t.mint] * t.balance })),
      totalUsdValue: tokens.reduce((s, t) => s + (prices[t.mint] ?? 0) * t.balance, 0),
    };
  }
}
```

---

## 8. Open Banking Connector

```typescript
export class OpenBankingConnector extends BaseConnector {
  // Implementa Open Finance Brasil (Banco Central) + padrão FAPI

  supportedActions = [
    "GET_ACCOUNTS",         "GET_BALANCE",        "GET_TRANSACTIONS",
    "INITIATE_PIX",         "GET_PIX_STATUS",     "CREATE_PIX_KEY",
    "GET_CREDIT_CARDS",     "GET_INVESTMENTS",    "GET_LOANS",
    "GET_CREDIT_SCORE",     "CONSENT_MANAGEMENT",
  ];

  private async initiatePixPayment(input: PixPaymentInput): Promise<PixPaymentOutput> {
    // 1. Criar consentimento (FAPI)
    const consent = await this.createConsent({
      data: {
        permissions: ["PAYMENTS_INITIATE"],
        expirationDateTime: addMinutes(new Date(), 30).toISOString(),
        payment: {
          type:     "PIX",
          currency: "BRL",
          amount:   input.amount.toFixed(2),
        },
      },
    });

    // 2. Aguardar aprovação do usuário (redirect)
    const approved = await this.waitForConsentApproval(consent.consentId);
    if (!approved) throw new ConsentNotApprovedError();

    // 3. Criar pagamento
    const payment = await this.bankClient.post(
      "/payments/v1/pix/payments",
      {
        data: {
          localInstrument: input.pixKeyType,
          proxy:           input.pixKey,
          payment: {
            amount:   input.amount.toFixed(2),
            currency: "BRL",
          },
          creditorAccount: {
            ispb:         input.recipientIspb,
            issuer:       input.recipientBranch,
            number:       input.recipientAccount,
            accountType:  "CACC",
          },
        },
      },
      { headers: { Authorization: `Bearer ${await this.getPaymentToken(consent.consentId)}` } }
    );

    return {
      paymentId:    payment.data.paymentId,
      status:       payment.data.status,
      endToEndId:   payment.data.endToEndId,
      createdAt:    payment.data.creationDateTime,
    };
  }
}
```

---

## 9. Sumário dos 20 Connectors Oficiais

```
┌──────────────────────────────────────────────────────────────────────┐
│              CATÁLOGO OFICIAL — 20 CONNECTORS v1.0                  │
├─────────────────────────┬────────────────────────────────────────────┤
│ Connector               │ Domínio / Actions-chave                   │
├─────────────────────────┼────────────────────────────────────────────┤
│ GmailConnector          │ COMMUNICATION — SEND, READ, SEARCH        │
│ GoogleCalendarConnector │ PRODUCTIVITY — CREATE_EVENT, FIND_SLOTS   │
│ GoogleDriveConnector    │ PRODUCTIVITY — UPLOAD, DOWNLOAD, SHARE    │
│ OutlookConnector        │ COMMUNICATION — SEND, READ (fallback Gmail)│
│ ShopifyConnector        │ COMMERCE — LIST_ORDERS, UPDATE_STATUS     │
│ MercadoLivreConnector   │ COMMERCE — LIST_ITEMS, MANAGE_QUESTIONS   │
│ BlingConnector          │ FINANCE — CREATE_INVOICE, CASH_FLOW       │
│ TOTVSConnector          │ ENTERPRISE — ERP, HCM, STOCK              │
│ SabreConnector          │ TRAVEL — SEARCH_FLIGHTS, BOOK, PNR        │
│ GalileoConnector        │ TRAVEL — SEARCH_FLIGHTS (alternative GDS) │
│ AmadeusConnector        │ TRAVEL — SEARCH_FLIGHTS, HOTELS           │
│ PhantomConnector        │ BLOCKCHAIN — PORTFOLIO, SEND_SOL, STAKE   │
│ MetaMaskConnector       │ BLOCKCHAIN — EVM, SIGN_TX, SEND_ETH       │
│ LayerZeroConnector      │ BLOCKCHAIN — BRIDGE_TOKENS, CROSS_CHAIN   │
│ ChainlinkConnector      │ BLOCKCHAIN — GET_PRICE, ORACLE_DATA       │
│ OpenAIConnector         │ AI — COMPLETIONS, EMBEDDINGS, IMAGES      │
│ ClaudeConnector         │ AI — COMPLETIONS, ANALYSIS                │
│ GeminiConnector         │ AI — COMPLETIONS, VISION, SEARCH          │
│ ZebraConnector          │ IOT/INDUSTRY — TRACK_ASSET, INVENTORY     │
│ OpenBankingConnector    │ FINANCE — PIX, ACCOUNTS, INVESTMENTS      │
└─────────────────────────┴────────────────────────────────────────────┘
```

---

# PARTE XV — ROADMAP DE IMPLEMENTAÇÃO

---

## 10. Sprints Oficiais

```
┌─────────────────────────────────────────────────────────────────────┐
│                  ROADMAP OFICIAL DE IMPLEMENTAÇÃO                   │
└─────────────────────────────────────────────────────────────────────┘

SPRINT ALPHA (Semanas 1-8):
  ✅ Monorepo + tooling (pnpm, turbo, TypeScript)
  ✅ Core Engine: IntentEngine + GoalEngine + Planner
  ✅ Memory Engine: store + retrieve + vector search
  ✅ Connector SDK v1: manifest + lifecycle + hooks
  ✅ Execution Engine: sequential + basic parallel
  ✅ API Gateway: REST v1 + JWT auth
  ✅ Database: schema + migrations + básico
  ✅ Frontend web: ChatInterface + GoalCard + basic UI
  ✅ Connectors alpha: Gmail + Google Calendar + Bling
  ✅ Policy Engine: básico (age, budget, permissions)
  ✅ Tests: unitários 80%+ coverage
  Target: Sistema funcional end-to-end para demo interno

SPRINT BETA (Semanas 9-16):
  ✅ MCIS Registry Engine completo + Capability Graph
  ✅ MGIS Goal Decomposition + Conflict Resolution
  ✅ 10 connectors adicionais (Shopify, ML, TOTVS, Sabre, Phantom...)
  ✅ Voice Pipeline: Push-to-Talk + TTS
  ✅ Enterprise: multi-tenant + RBAC + aprovação hierárquica
  ✅ WebSocket: real-time goal updates
  ✅ Marketplace v1: catálogo de connectors
  ✅ Offline Support: IndexedDB + Service Worker
  ✅ Mobile App: React Native + Expo
  ✅ Observability: OpenTelemetry + Prometheus + Grafana
  Target: Beta fechado com 100 empresas piloto

RELEASE CANDIDATE (Semanas 17-20):
  ✅ Todos os 20 connectors oficiais completos
  ✅ Goal Prediction + Learning Engine
  ✅ Chaos Engineering: todos os cenários de falha cobertos
  ✅ Security Audit: pentest externo + LGPD compliance
  ✅ Performance: P95 < 2s para goals simples
  ✅ Documentação: pública + SDK guide + connector dev guide
  ✅ Marketplace v2: specialists + workflows + policies
  Target: RC público

GA — General Availability (Semana 21+):
  ✅ SLA 99.9% uptime
  ✅ Escalabilidade: 100k usuários simultâneos
  ✅ 20 connectors certificados
  ✅ Programa de parceiros (PARTNER connectors)
  ✅ Enterprise: SSO + SAML + auditoria exportável
  ✅ Voice: idiomas adicionais (English, Español)

ESCALABILIDADE — Pós-GA:
  Fase 1: 1M usuários → sharding + read replicas + Redis cluster
  Fase 2: 10M usuários → microserviços regionais + CDN edge
  Fase 3: 100M usuários → global multi-region + eventual consistency
  Fase 4: 1B usuários → arquitetura distribuída global
```

---

# CHECKLISTS OFICIAIS

---

## 11. Checklist de Implementação de Connector

```
CONNECTOR IMPLEMENTATION CHECKLIST

OBRIGATÓRIO — MCF
  ☐ ConnectorManifest completo e válido
  ☐ BaseConnector estendido corretamente
  ☐ initialize() implementado com conexão ao serviço externo
  ☐ execute() implementado para todas as actions
  ☐ connect() / disconnect() funcionais
  ☐ destroy() faz cleanup completo (sem memory leaks)
  ☐ Todos os inputs validados com Zod
  ☐ Todos os erros tipados (ConnectorError subclasses)
  ☐ Rate limiting respeitado e exponential backoff implementado
  ☐ Timeouts configuráveis e com defaults razoáveis

OBRIGATÓRIO — MCIS (Self-Description)
  ☐ describe() implementado e completo
  ☐ Ontologia mapeada (domain, subdomain, category)
  ☐ Natural language description em pt-BR e en-US
  ☐ InputContract com JSONSchema para cada action
  ☐ OutputContract com JSONSchema para cada action
  ☐ Capability Graph edges declaradas (composableWith, requiresCapabilities)
  ☐ MemoryRequirements declaradas
  ☐ ContextRequirements declaradas
  ☐ SelectionMetrics inicializadas
  ☐ Hot Plug: registro automático no initialize()
  ☐ Hot Remove: desregistro no destroy()

OBRIGATÓRIO — SEGURANÇA
  ☐ OAuth tokens armazenados criptografados (nunca em plain text)
  ☐ Refresh token rotation implementado
  ☐ Network allowlist declarada no manifesto (sem wildcard *)
  ☐ Nenhum secret no código fonte (variáveis de ambiente)
  ☐ Assinatura digital do bundle
  ☐ Sandbox permissions declaradas e mínimas

OBRIGATÓRIO — QUALIDADE
  ☐ Testes unitários ≥ 80% cobertura
  ☐ Testes de integração com serviço real (sandbox/mock)
  ☐ Testes de isolamento (sem efeitos colaterais)
  ☐ CHANGELOG.md atualizado
  ☐ README.md com exemplos de uso
  ☐ Todos os JSDoc/TSDoc críticos documentados
```

## 12. Checklist de Qualidade e Publicação

```
PRE-RELEASE QUALITY CHECKLIST

CÓDIGO
  ☐ TypeScript strict: zero erros, zero any implícito
  ☐ ESLint: zero warnings em regras obrigatórias
  ☐ Sem console.log em produção (apenas logger estruturado)
  ☐ Sem TODO ou FIXME não rastreados
  ☐ Bundle size dentro dos limites (Connector: < 2MB)

PERFORMANCE
  ☐ P50 latência < 500ms para actions principais
  ☐ P95 latência < 2000ms para actions principais
  ☐ Nenhum memory leak detectado (node --inspect + heapSnapshot)
  ☐ Funciona sob carga: 1000 req/min sem degradação

SEGURANÇA
  ☐ SAST scan: zero findings HIGH/CRITICAL (Semgrep/Snyk)
  ☐ Dependências: zero vulnerabilidades HIGH (npm audit)
  ☐ Secrets scan: zero secrets detectados no repositório
  ☐ OWASP Top 10 endereçado

DOCUMENTAÇÃO
  ☐ README completo com exemplos funcionais
  ☐ CHANGELOG com semantic versioning
  ☐ Todos os tipos exportados documentados
  ☐ Guia de troubleshooting

MARKETPLACE PUBLISHING
  ☐ Manifest válido e assinado
  ☐ MCIS Self-Description completo
  ☐ Ícone e screenshots fornecidos
  ☐ Pricing declarado
  ☐ Política de privacidade
  ☐ Termos de uso
  ☐ Suporte declarado (email, SLA)
  ☐ Review pela equipe MemoryOS (CERTIFIED tier)
```

---

## Declaração Oficial

> **O MDS é o Manual Oficial de Engenharia do MemoryOS.**

Ele traduz a visão estratégica do MV, a especificação de produto do MPS, a arquitetura do MAS, os padrões de engenharia do MES, o framework de Connectors do MCF, a inteligência de Connectors do MCIS e a inteligência de Goals do MGIS em **especificações técnicas completas e implementáveis**.

Qualquer equipe de engenharia que seguir este documento, em conjunto com toda a biblioteca oficial, estará apta a construir, manter e evoluir o MemoryOS de forma consistente com sua visão arquitetural original — escalando de um único usuário a um bilhão de usuários, de um Connector a um milhão de Connectors, de um Specialist a milhares de domínios de conhecimento especializado.

---

**MDS — MemoryOS Developer Specification**  
**Versão:** 1.0 · **Status:** Manual Oficial de Engenharia · **Data:** 2026-07-08  
**Documentos:** MDS · MDS-Engines · MDS-Platform · MDS-Connectors