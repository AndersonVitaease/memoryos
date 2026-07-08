# MDS-Connectors — Connectors Oficiais, Marketplace, Sprint Zero e Declaração Final

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 4 de 4 do MDS

---

# PARTE X — CONNECTORS OFICIAIS

---

## Template Base Universal

```typescript
// connector-catalog/_template/src/index.ts

export abstract class BaseOfficialConnector extends BaseConnector {
  // Cada connector oficial DEVE implementar todos estes métodos

  abstract describe(): ConnectorSelfDescription;      // MCIS (obrigatório)
  abstract execute(req: ConnectorRequest): Promise<ConnectorResponse>;

  // Helpers compartilhados entre todos os connectors oficiais
  protected async getCredential(userId: string): Promise<ConnectorCredential> {
    return this.credentialStore.get(userId, this.manifest.connectorId);
  }

  protected async refreshIfExpired(cred: ConnectorCredential): Promise<ConnectorCredential> {
    if (!cred.expiresAt || new Date(cred.expiresAt) > addMinutes(new Date(), 5)) return cred;
    return this.oauthClient.refresh(cred);
  }

  protected buildOntology(domain: string, sub: string, cat: string,
    entities: string[], verbs: string[], tags: string[]): ConnectorOntologyMapping {
    return { domain, subdomain: sub, category: cat, realWorldEntities: entities,
             semanticVerbs: verbs, relatedDomains: [], semanticTags: tags };
  }
}
```

---

## 1. Gmail Connector

```typescript
export class GmailConnector extends BaseOfficialConnector {
  static readonly MANIFEST: ConnectorManifest = {
    connectorId: "gmail", connectorName: "Gmail", vendor: "Google",
    category: "COMMUNICATION", connectorType: "BIDIRECTIONAL",
    sdkCompatibility: ">=1.0.0", minimumMemoryOSVersion: "1.0.0",
    supportedActions:      ["SEND_EMAIL","LIST_MESSAGES","READ_EMAIL","SEARCH_EMAILS",
                            "DELETE_EMAIL","ARCHIVE_EMAIL","ADD_LABEL","CREATE_DRAFT","REPLY_EMAIL"],
    supportedEvents:       ["email_received","email_read","email_sent"],
    supportedCapabilities: ["SEND_EMAIL","READ_EMAIL","SEARCH_EMAIL","MANAGE_LABELS"],
    permissions:           ["gmail.send","gmail.readonly","gmail.modify"],
    tags:                  ["email","google","communication","messaging"],
  };

  describe(): ConnectorSelfDescription {
    return {
      ...this.buildBaseDescription(GmailConnector.MANIFEST),
      naturalLanguage: {
        summary:            "Acessa Gmail para enviar, ler e gerenciar e-mails",
        canDo:              ["Enviar e-mails com ou sem anexos","Ler threads completas",
                             "Pesquisar com filtros avançados","Arquivar e etiquetar"],
        cannotDo:           ["Enviar SMS ou WhatsApp","Acessar outros provedores de e-mail"],
        supportedLanguages: ["pt-BR","en-US","es-ES"],
        keywords:           ["email","gmail","mensagem","correio","inbox"],
      },
      ontology: this.buildOntology(
        "COMMUNICATION","MESSAGING","EMAIL",
        ["EMAIL_MESSAGE","EMAIL_THREAD","EMAIL_LABEL","EMAIL_ATTACHMENT"],
        ["SEND","READ","SEARCH","DELETE","ARCHIVE","LABEL"],
        ["email","google","async-communication"]
      ),
    };
  }

  async execute(req: ConnectorRequest): Promise<ConnectorResponse> {
    const actions: Record<string, (i: unknown) => Promise<unknown>> = {
      SEND_EMAIL:     (i) => this.sendEmail(i as SendEmailInput),
      LIST_MESSAGES:  (i) => this.listMessages(i as ListMessagesInput),
      READ_EMAIL:     (i) => this.readEmail(i as ReadEmailInput),
      SEARCH_EMAILS:  (i) => this.searchEmails(i as SearchEmailsInput),
      ARCHIVE_EMAIL:  (i) => this.archiveEmail(i as ArchiveEmailInput),
    };
    const action = actions[req.action];
    if (!action) throw new ActionNotFoundError(req.action, this.manifest.connectorId);
    return { success: true, output: await action(req.input) };
  }

  private async sendEmail(input: SendEmailInput): Promise<SendEmailOutput> {
    const client  = await this.getGmailClient(input.userId);
    const mime    = this.buildMimeMessage(input);
    const encoded = Buffer.from(mime).toString("base64url");
    const result  = await client.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
    return { messageId: result.data.id!, threadId: result.data.threadId!, sentAt: new Date().toISOString() };
  }
}
```

---

## 2. Shopify Connector

```typescript
export class ShopifyConnector extends BaseOfficialConnector {
  static readonly MANIFEST: ConnectorManifest = {
    connectorId: "shopify", vendor: "Shopify", category: "COMMERCE",
    connectorType: "BIDIRECTIONAL",
    supportedActions: ["GET_ORDER","LIST_ORDERS","UPDATE_ORDER_STATUS","GET_PRODUCTS",
                       "CREATE_PRODUCT","UPDATE_PRODUCT","GET_INVENTORY","UPDATE_INVENTORY",
                       "GET_CUSTOMER","CREATE_CUSTOMER","PROCESS_FULFILLMENT"],
    supportedEvents:  ["order_created","order_updated","order_cancelled","order_paid",
                       "product_created","product_updated","customer_created"],
    supportedCapabilities: ["MANAGE_ORDERS","MANAGE_PRODUCTS","MANAGE_INVENTORY","MANAGE_CUSTOMERS"],
    permissions:      ["read_orders","write_orders","read_products","write_products",
                       "read_inventory","write_inventory"],
    tags: ["ecommerce","shopify","commerce","store","orders"],
  };

  // Webhook INBOUND — recebe eventos do Shopify
  async handleWebhook(topic: string, payload: unknown): Promise<void> {
    const eventType = `shopify.${topic.replace("/", ".")}`;
    await this.eventBus.publish(eventType, this.normalizeWebhookPayload(topic, payload));
  }

  async execute(req: ConnectorRequest): Promise<ConnectorResponse> {
    const { userId, action, input } = req;
    const client = await this.getShopifyClient(userId);
    switch (action) {
      case "LIST_ORDERS":
        return { success: true, output: await client.order.list(input as ListOrdersInput) };
      case "UPDATE_ORDER_STATUS":
        return { success: true, output: await client.order.update(input as UpdateOrderInput) };
      case "GET_INVENTORY":
        return { success: true, output: await client.inventory.get(input as GetInventoryInput) };
      default:
        throw new ActionNotFoundError(action, "shopify");
    }
  }
}
```

---

## 3. Bling Connector

```typescript
export class BlingConnector extends BaseOfficialConnector {
  static readonly MANIFEST: ConnectorManifest = {
    connectorId: "bling", vendor: "Bling", category: "FINANCE",
    connectorType: "BIDIRECTIONAL",
    supportedActions: ["CREATE_INVOICE","GET_INVOICE","CANCEL_INVOICE","LIST_INVOICES",
                       "CREATE_ORDER","UPDATE_ORDER","GET_CASH_FLOW","GET_PAYABLES",
                       "GET_RECEIVABLES","CREATE_CUSTOMER","GET_PRODUCTS","UPDATE_STOCK"],
    supportedCapabilities: ["CREATE_INVOICE","MANAGE_ORDERS","CASH_FLOW","MANAGE_PRODUCTS"],
    permissions: ["invoices.write","orders.read","financials.read","products.read"],
    tags: ["bling","financeiro","nfe","nf-e","erp","brasil","fiscal"],
  };

  private async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceOutput> {
    const client = await this.getBlingClient(input.userId);
    const payload = {
      tipo: "NF-e", serie: input.series ?? "1",
      data_emissao: format(new Date(), "dd/MM/yyyy"),
      natureza_operacao: input.operationType ?? "Venda de Mercadoria",
      cliente: {
        nome: input.customer.name, cpf_cnpj: input.customer.taxId,
        email: input.customer.email,
      },
      itens: input.items.map(i => ({
        descricao: i.description, codigo: i.sku,
        quantidade: i.quantity, valor_unitario: i.unitPrice,
      })),
    };
    const res = await client.post("/notasfiscais", { notafiscal: payload });
    const nf  = res.retorno.notasfiscais[0];
    return { invoiceId: nf.id, number: nf.numero, nfeKey: nf.chaveAcesso,
             pdfUrl: nf.linkDanfe, status: nf.situacao };
  }
}
```

---

## 4. Sabre GDS Connector

```typescript
export class SabreConnector extends BaseOfficialConnector {
  static readonly MANIFEST: ConnectorManifest = {
    connectorId: "sabre", vendor: "Sabre", category: "TRAVEL",
    connectorType: "BIDIRECTIONAL",
    supportedActions: ["SEARCH_FLIGHTS","GET_FLIGHT_DETAILS","BOOK_FLIGHT","CANCEL_BOOKING",
                       "CHECK_IN","GET_PNR","PRICE_ITINERARY","ISSUE_TICKET",
                       "SEARCH_HOTELS","BOOK_HOTEL","SEARCH_CARS"],
    supportedCapabilities: ["SEARCH_FLIGHTS","BOOK_FLIGHTS","MANAGE_PNR","SEARCH_HOTELS"],
    permissions: ["gds.search","gds.booking","gds.ticketing"],
    tags: ["sabre","gds","flights","travel","aviation","booking"],
  };

  private async searchFlights(input: SearchFlightsInput): Promise<SearchFlightsOutput> {
    const token  = await this.sabreClient.getToken();
    const body   = this.buildSearchRequest(input);
    const result = await this.sabreClient.post("/v4.3.0/shop/flights/fares", body,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return {
      offers:   (result.PricedItineraries ?? []).map(this.normalizeItinerary.bind(this)),
      currency: "BRL",
      searchId: result.SearchId,
    };
  }
}
```

---

## 5. Phantom Wallet Connector

```typescript
export class PhantomConnector extends BaseOfficialConnector {
  static readonly MANIFEST: ConnectorManifest = {
    connectorId: "phantom", vendor: "Phantom", category: "BLOCKCHAIN",
    connectorType: "BIDIRECTIONAL",
    supportedActions: ["GET_BALANCE","GET_PORTFOLIO","SEND_SOL","SEND_TOKEN","SIGN_TRANSACTION",
                       "CALL_CONTRACT","STAKE_SOL","UNSTAKE_SOL","SWAP_TOKENS","GET_TX_STATUS",
                       "GET_NFT_PORTFOLIO"],
    supportedCapabilities: ["READ_WALLET","SEND_TOKENS","STAKE","INTERACT_CONTRACT"],
    permissions: ["wallet.read","wallet.sign","wallet.send"],
    tags: ["phantom","solana","blockchain","crypto","wallet","defi"],
  };

  private async getPortfolio(input: GetPortfolioInput): Promise<GetPortfolioOutput> {
    const conn     = new SolanaConnection(this.rpcEndpoint, "confirmed");
    const pubKey   = new PublicKey(input.walletAddress);
    const [sol, tokenAccs] = await Promise.all([
      conn.getBalance(pubKey),
      conn.getParsedTokenAccountsByOwner(pubKey, { programId: TOKEN_PROGRAM_ID }),
    ]);
    const tokens = tokenAccs.value
      .filter(a => a.account.data.parsed.info.tokenAmount.uiAmount > 0)
      .map(a => ({ mint: a.account.data.parsed.info.mint,
                   balance: a.account.data.parsed.info.tokenAmount.uiAmount }));
    const prices = await this.priceOracle.getPrices(tokens.map(t => t.mint));
    return {
      solBalance:    sol / LAMPORTS_PER_SOL,
      tokens:        tokens.map(t => ({ ...t, usdValue: (prices[t.mint] ?? 0) * t.balance })),
      totalUsdValue: tokens.reduce((s, t) => s + (prices[t.mint] ?? 0) * t.balance, 0),
    };
  }
}
```

---

## 6. Open Banking Connector (PIX + Open Finance Brasil)

```typescript
export class OpenBankingConnector extends BaseOfficialConnector {
  // Implementa Open Finance Brasil (BACEN) + padrão FAPI 2.0
  static readonly MANIFEST: ConnectorManifest = {
    connectorId: "open-banking", vendor: "BACEN/OpenFinanceBR",
    category: "FINANCE", connectorType: "BIDIRECTIONAL",
    supportedActions: ["GET_ACCOUNTS","GET_BALANCE","GET_TRANSACTIONS","INITIATE_PIX",
                       "GET_PIX_STATUS","GET_CREDIT_CARDS","GET_INVESTMENTS","GET_CREDIT_SCORE"],
    supportedCapabilities: ["READ_BANK_DATA","INITIATE_PAYMENT","READ_INVESTMENTS"],
    permissions: ["accounts.read","payments.initiate","investments.read"],
    tags: ["open-banking","pix","banco","financeiro","brasil","open-finance"],
  };

  private async initiatePixPayment(input: PixInput): Promise<PixOutput> {
    // 1. Consent (FAPI)
    const consent = await this.createPaymentConsent(input);
    const approved = await this.waitForUserConsent(consent.consentId, 300_000);
    if (!approved) throw new ConsentNotApprovedError();

    // 2. Payment
    const payment = await this.bankClient.post("/payments/v1/pix/payments", {
      data: {
        localInstrument: input.pixKeyType,
        proxy:           input.pixKey,
        payment: { amount: input.amount.toFixed(2), currency: "BRL" },
        creditorAccount: { ispb: input.recipientIspb, number: input.recipientAccount, accountType: "CACC" },
      },
    }, { headers: { Authorization: `Bearer ${await this.getPaymentToken(consent.consentId)}` } });

    return { paymentId: payment.data.paymentId, status: payment.data.status,
             endToEndId: payment.data.endToEndId };
  }
}
```

---

## 7. Catálogo Completo dos 21 Connectors Oficiais

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                CATÁLOGO OFICIAL — 21 CONNECTORS v1.0                        │
├──────────────────────────┬───────────────────────────────────────────────────┤
│ Connector                │ Domínio / Capacidades-chave                      │
├──────────────────────────┼───────────────────────────────────────────────────┤
│ GmailConnector           │ COMMUNICATION — SEND/READ/SEARCH/ARCHIVE         │
│ GoogleCalendarConnector  │ PRODUCTIVITY — CREATE_EVENT/FIND_SLOTS/INVITE    │
│ GoogleDriveConnector     │ PRODUCTIVITY — UPLOAD/DOWNLOAD/SHARE/SEARCH      │
│ OutlookConnector         │ COMMUNICATION — SEND/READ (fallback do Gmail)    │
│ ShopifyConnector         │ COMMERCE — ORDERS/PRODUCTS/INVENTORY/CUSTOMERS   │
│ MercadoLivreConnector    │ COMMERCE — ITEMS/ORDERS/QUESTIONS/REVIEWS        │
│ BlingConnector           │ FINANCE — NF-e/ORDERS/CASH_FLOW/STOCK            │
│ TOTVSConnector           │ ENTERPRISE — ERP/HCM/STOCK/FISCAL                │
│ SabreConnector           │ TRAVEL — FLIGHTS/HOTELS/PNR/TICKETS              │
│ GalileoConnector         │ TRAVEL — FLIGHTS/HOTELS (alternative GDS)        │
│ AmadeusConnector         │ TRAVEL — FLIGHTS/HOTELS (APAC + Europe focus)    │
│ PhantomConnector         │ BLOCKCHAIN — SOLANA/WALLET/SEND/STAKE/DeFi       │
│ MetaMaskConnector        │ BLOCKCHAIN — EVM/ETHEREUM/SIGN_TX/SEND_ETH       │
│ LayerZeroConnector       │ BLOCKCHAIN — BRIDGE_TOKENS/CROSS_CHAIN           │
│ ChainlinkConnector       │ BLOCKCHAIN — PRICE_ORACLE/DATA_FEEDS              │
│ OpenAIConnector          │ AI — COMPLETIONS/EMBEDDINGS/IMAGES/AUDIO         │
│ ClaudeConnector          │ AI — COMPLETIONS/ANALYSIS/DOCUMENT_UNDERSTANDING │
│ GeminiConnector          │ AI — COMPLETIONS/VISION/GROUNDING/SEARCH         │
│ ZebraConnector           │ IOT/INDUSTRY — ASSET_TRACKING/INVENTORY/RFID     │
│ OpenBankingConnector     │ FINANCE — PIX/ACCOUNTS/INVESTMENTS/CREDIT_SCORE  │
│ PortalConnector          │ TRAVEL — PORTAL_TURISMO (específico BR)          │
└──────────────────────────┴───────────────────────────────────────────────────┘
```

---

# PARTE XI — MARKETPLACE

---

## 8. Estrutura do Marketplace

```typescript
interface MarketplaceItem {
  itemId:             string;
  type:               "CONNECTOR" | "SPECIALIST" | "SKILL" | "WORKFLOW" | "TEMPLATE" | "POLICY" | "AGENT" | "PROMPT";
  name:               string;
  vendor:             string;
  description:        string;
  certificationLevel: "CERTIFIED" | "PARTNER" | "COMMUNITY";
  pricing: {
    model:       "FREE" | "FREEMIUM" | "PAID" | "CREDITS";
    monthlyCost?: number;
    creditCost?:  number;  // por execução
    trialDays?:   number;
  };
  stats: { installs: number; rating: number; reviewCount: number; };
  versions:      MarketplaceVersion[];
  latestVersion: string;
  requiredPlan:  "FREE" | "PRO" | "ENTERPRISE";
  sdkCompatibility: string;
  screenshots:   string[];
  changelog:     ChangelogEntry[];
}

// Revenue Share
const REVENUE_SHARE = {
  CERTIFIED: { developer: 0.70, platform: 0.30 },
  PARTNER:   { developer: 0.75, platform: 0.25 },
  COMMUNITY: { developer: 0.80, platform: 0.20 },
} as const;

// Instalação — fluxo completo
async function installPlugin(
  itemId:  string,
  userId:  string,
  config?: PluginInstallConfig
): Promise<InstallResult> {
  const item = await marketplace.get(itemId);
  await billingService.authorize(userId, item.pricing);
  const bundle = await cdn.download(item.latestVersion.bundleUrl);
  verifySignature(bundle, item.publisherPublicKey);  // Ed25519
  const sandbox = await sandboxManager.create({ maxMemoryMb: 256, networkAllowlist: item.networkDomains });
  await sandbox.load(bundle);
  await registry.register(sandbox.plugin);           // Hot Plug (MCIS)
  return { success: true, pluginId: item.itemId, installedVersion: item.latestVersion.version };
}
```

---

# PARTE XV — SPRINT ZERO

---

## 9. Sprint Zero — Validação da Fundação Arquitetural

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          SPRINT ZERO                                         │
│         Validação da Fundação Arquitetural — NÃO implementa negócio         │
│                    Duração estimada: 1 semana                                │
└──────────────────────────────────────────────────────────────────────────────┘

OBJETIVO:
  Garantir que todos os motores, serviços e integrações de infraestrutura
  funcionam corretamente ANTES da Sprint 1 de negócio começar.

CRITÉRIO DE ACEITE DA SPRINT ZERO:
  Todos os testes de validação PASS antes de avançar para Sprint 1.
  Sprint Zero não possui user stories ou features de negócio.
  Apenas infraestrutura, inicialização e comunicação entre módulos.
```

### Sprint Zero — Checklist Completo

```typescript
// tests/sprint-zero/foundation-validation.test.ts

describe("SPRINT ZERO — Foundation Validation", () => {

  // ─── CORE ENGINE ────────────────────────────────────────────────────────

  describe("Core Engine Initialization", () => {
    it("IntentEngine initializes without errors", async () => {
      const engine = new IntentEngine(mockLLM(), mockMemory(), mockContext());
      expect(engine).toBeDefined();
      expect(engine.isReady()).toBe(true);
    });

    it("GoalEngine initializes and loads GoalOntology", async () => {
      const engine = await GoalEngine.create(testConfig);
      expect(engine.ontology.domains).toContain("TRAVEL");
      expect(engine.ontology.domains).toContain("FINANCE");
    });

    it("MemoryEngine connects to PostgreSQL and pgvector", async () => {
      const engine = new MemoryEngine(testPgConfig);
      await expect(engine.healthCheck()).resolves.toBe("OK");
      const testEmbedding = await engine.embedder.embed("test");
      expect(testEmbedding).toHaveLength(1536);
    });

    it("Planner instantiates with GoalEngine and MCISRuntime", async () => {
      const planner = new Planner(mockGoalEngine(), mockMCIS());
      expect(planner).toBeDefined();
    });
  });

  // ─── MCIS RUNTIME ─────────────────────────────────────────────────────

  describe("MCIS Runtime", () => {
    it("CapabilityRegistry initializes empty and accepts registration", async () => {
      const registry = new CapabilityRegistry();
      await registry.register(mockCapabilityDescriptor());
      expect(await registry.count()).toBe(1);
    });

    it("CapabilityGraph accepts edges and resolves paths", () => {
      const graph = new CapabilityGraph();
      graph.addEdge("SEND_EMAIL", "READ_EMAIL", "EQUIVALENT");
      expect(graph.hasEdge("SEND_EMAIL", "READ_EMAIL")).toBe(true);
    });

    it("ConnectorSelectionEngine ranks candidates by score", async () => {
      const engine = new ConnectorSelectionEngine(mockMetrics());
      const candidates = [mockCapability("gmail", 0.9), mockCapability("outlook", 0.7)];
      const ranked = await engine.rank(candidates, mockGoalContext());
      expect(ranked[0].connectorId).toBe("gmail");
    });
  });

  // ─── CONNECTOR MANAGER ────────────────────────────────────────────────

  describe("Connector Manager", () => {
    it("loads and initializes connector from catalog", async () => {
      const manager = new ConnectorManager(testConfig);
      await manager.load("gmail", mockGmailConfig());
      expect(manager.isLoaded("gmail")).toBe(true);
    });

    it("sandbox isolates connector execution", async () => {
      const sandbox = await ConnectorSandbox.create({ maxMemoryMb: 64, networkAllowlist: [] });
      expect(sandbox.isIsolated()).toBe(true);
    });

    it("CircuitBreaker starts CLOSED and opens after 5 failures", async () => {
      const cb = new CircuitBreaker("test", DEFAULT_CB_CONFIG);
      expect(cb.state).toBe("CLOSED");
      for (let i = 0; i < 5; i++) cb.recordFailure();
      expect(cb.state).toBe("OPEN");
    });

    it("Fallback registry returns alternative connector when primary fails", async () => {
      const registry = new FallbackRegistry();
      registry.register("gmail", ["outlook"]);
      const fallback = await registry.getFallback("gmail");
      expect(fallback?.connectorId).toBe("outlook");
    });
  });

  // ─── EXECUTION ENGINE ─────────────────────────────────────────────────

  describe("Execution Engine", () => {
    it("executes single-step plan successfully", async () => {
      const engine = new ExecutionEngine(mockManager(), mockCB(), mockMetrics(), mockBus());
      const plan   = buildSingleStepPlan("gmail", "SEND_EMAIL");
      const result = await engine.execute(plan, mockCtx());
      expect(result.status).toBe("COMPLETED");
    });

    it("executes parallel steps concurrently", async () => {
      const t0 = Date.now();
      const engine  = new ExecutionEngine(mockManager({ latencyMs: 100 }), mockCB(), mockMetrics(), mockBus());
      const plan    = buildParallelPlan(["gmail.SEND_EMAIL", "bling.CREATE_INVOICE"]);
      await engine.execute(plan, mockCtx());
      expect(Date.now() - t0).toBeLessThan(250); // paralelo = < 200ms, não 200ms sequencial
    });

    it("retries on CONNECTOR_TIMEOUT and succeeds on 3rd attempt", async () => {
      const manager = mockManagerWithTransientFailures(2); // falha 2x, sucesso na 3ª
      const engine  = new ExecutionEngine(manager, mockCB(), mockMetrics(), mockBus());
      const plan    = buildSingleStepPlan("gmail", "SEND_EMAIL");
      const result  = await engine.execute(plan, mockCtx());
      expect(result.status).toBe("COMPLETED");
      expect(manager.callCount).toBe(3);
    });
  });

  // ─── EVENT BUS ────────────────────────────────────────────────────────

  describe("Universal Event Bus", () => {
    it("publishes and consumes event", async () => {
      const bus = new UniversalEventBus(testKafkaConfig);
      await bus.connect();
      const received: unknown[] = [];
      bus.subscribe("test.event", (e) => { received.push(e); });
      await bus.publish("test.event", { hello: "world" });
      await waitFor(() => received.length > 0, 5000);
      expect(received[0]).toMatchObject({ payload: { hello: "world" } });
      await bus.disconnect();
    });

    it("Redis local bus delivers in < 5ms", async () => {
      const bus = new UniversalEventBus(testConfig);
      const t0  = Date.now();
      const received = new Promise(resolve => bus.subscribeLocal("ch", resolve));
      bus.publishLocal("ch", { ping: true });
      await received;
      expect(Date.now() - t0).toBeLessThan(5);
    });
  });

  // ─── SCHEDULER ────────────────────────────────────────────────────────

  describe("Scheduler", () => {
    it("schedules and fires job at specified interval", async () => {
      const scheduler = new Scheduler(testConfig);
      let firedCount  = 0;
      scheduler.schedule("test-job", "*/1 * * * * *", () => firedCount++); // every second
      await sleep(2500);
      expect(firedCount).toBeGreaterThanOrEqual(2);
      scheduler.cancel("test-job");
    });
  });

  // ─── PERSISTÊNCIA ─────────────────────────────────────────────────────

  describe("Persistence", () => {
    it("Goal can be persisted and retrieved from PostgreSQL", async () => {
      const repo = new PostgresGoalRepository(testPgUrl);
      const agg  = GoalFactory.create(mockIntent(), mockCtx());
      await repo.save(agg);
      const found = await repo.findById(agg.id);
      expect(found?.id).toBe(agg.id);
      expect(found?.snapshot().state).toBe("CREATED");
    });

    it("MemoryRecord vector search returns similar results", async () => {
      const store = new MemoryStore(testPgUrl);
      await store.create({ userId: "u1", content: "Reunião com João amanhã", type: "FACT",
                           embedding: mockEmbedding(), confidence: 1.0 });
      const results = await store.vectorSearch("u1", mockEmbedding(), 5, 0.5);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ─── COMUNICAÇÃO ENTRE MÓDULOS ────────────────────────────────────────

  describe("Inter-Module Communication", () => {
    it("gRPC channel between core-service and connector-service is reachable", async () => {
      const channel = await gRPCHealthCheck("localhost:50051");
      expect(channel.status).toBe("SERVING");
    });

    it("WebSocket gateway accepts connection and authenticates", async () => {
      const ws = new WebSocketClient("ws://localhost:3001/v1/stream");
      await ws.connect();
      ws.send({ type: "AUTH", token: testJwt });
      const response = await ws.waitFor("AUTH_OK", 3000);
      expect(response.userId).toBe("test-user");
      await ws.disconnect();
    });
  });

  // ─── OBSERVABILIDADE ──────────────────────────────────────────────────

  describe("Observability", () => {
    it("OpenTelemetry tracer is initialized and exportable", async () => {
      const tracer = trace.getTracer("sprint-zero-test");
      const span   = tracer.startSpan("test-span");
      span.end();
      // Não lança erro = OTel configurado corretamente
      expect(true).toBe(true);
    });

    it("Prometheus metrics endpoint returns 200", async () => {
      const res = await fetch("http://localhost:9090/metrics");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("goal_processing_duration_ms");
    });
  });

  // ─── MARKETPLACE RUNTIME ──────────────────────────────────────────────

  describe("Marketplace Runtime", () => {
    it("plugin catalog loads from DB on startup", async () => {
      const marketplace = await MarketplaceRuntime.create(testConfig);
      const catalog     = await marketplace.getCatalog({ type: "CONNECTOR", limit: 10 });
      expect(catalog.items).toBeDefined();
    });

    it("connector install flow completes: download → verify → sandbox → register", async () => {
      const result = await installPlugin("gmail", "test-user", {});
      expect(result.success).toBe(true);
      expect(result.pluginId).toBe("gmail");
    });
  });

  // ─── DISCOVERY AUTOMÁTICO DE CAPABILITIES ─────────────────────────────

  describe("Capability Auto-Discovery", () => {
    it("after connector install, capabilities are immediately discoverable", async () => {
      await installPlugin("gmail", "test-user", {});
      const caps = await mcisRuntime.discoverForGoal(
        mockGoal({ semanticVerb: "SEND", ontologyDomain: "COMMUNICATION" })
      );
      expect(caps.some(c => c.connectorId === "gmail")).toBe(true);
    });
  });

});

// ─── CRITÉRIO FINAL ──────────────────────────────────────────────────────────
// Sprint Zero: APROVADA apenas se 100% dos testes PASS
// Qualquer falha → bloqueio da Sprint 1 até resolução
```

---

# CHECKLISTS OFICIAIS

---

## 10. Checklist de Implementação de Connector

```
CONNECTOR IMPLEMENTATION CHECKLIST v1.0

MCF — ESTRUTURA
  ☐ Estende BaseConnector (ou BaseOfficialConnector)
  ☐ ConnectorManifest completo e válido
  ☐ initialize() conecta ao serviço externo
  ☐ execute() implementado para TODAS as actions declaradas
  ☐ connect() / disconnect() / destroy() funcionais
  ☐ Todos os inputs validados com Zod
  ☐ Todos os erros tipados (subclasses de MemoryOSError)
  ☐ Rate limiting respeitado + exponential backoff
  ☐ Timeouts configuráveis com defaults razoáveis

MCIS — SELF-DESCRIPTION
  ☐ describe() retorna ConnectorSelfDescription completo
  ☐ Ontologia mapeada (domain, subdomain, category)
  ☐ NaturalLanguageDescription em pt-BR e en-US
  ☐ InputContract com JSONSchema para cada action
  ☐ OutputContract com JSONSchema para cada action
  ☐ Capability Graph edges: composableWith, requiresCapabilities
  ☐ MemoryRequirements declaradas
  ☐ ContextRequirements declaradas
  ☐ SelectionMetrics inicializadas
  ☐ Hot Plug: auto-register no initialize()
  ☐ Hot Remove: auto-unregister no destroy()

SEGURANÇA
  ☐ OAuth tokens criptografados (AES-256) — nunca plaintext
  ☐ Refresh token rotation implementado
  ☐ Network allowlist declarada no manifesto (sem wildcard *)
  ☐ Zero secrets hardcoded (variáveis de ambiente)
  ☐ Bundle assinado com Ed25519

QUALIDADE
  ☐ Testes unitários ≥ 80% cobertura
  ☐ Testes de integração com serviço real (sandbox/mock)
  ☐ Testes de isolamento
  ☐ CHANGELOG.md atualizado
  ☐ README.md com exemplos canônicos
  ☐ Sprint Zero: connector passa em todos os testes de validação
```

## 11. Checklist de Segurança

```
SECURITY CHECKLIST — PRE-RELEASE

CÓDIGO
  ☐ Semgrep / Snyk SAST: zero HIGH/CRITICAL
  ☐ npm audit: zero HIGH/CRITICAL em dependências
  ☐ Secrets scan (GitGuardian / truffleHog): zero detecções
  ☐ SBOM (Software Bill of Materials) gerado

INFRAESTRUTURA
  ☐ TLS 1.3 enforced + HSTS configurado
  ☐ Security headers: CSP, X-Frame-Options, X-Content-Type-Options
  ☐ Rate limiting em /auth/* (5 tentativas → lockout 15min)
  ☐ MFA habilitado para Enterprise
  ☐ Vulnerability scan da imagem Docker (Trivy)

LGPD
  ☐ Consentimento implementado antes de processar dados pessoais
  ☐ DELETE /v1/users/:id remove TODOS os dados (cascade)
  ☐ GET /v1/users/:id/export disponível e completo
  ☐ Dados pessoais ausentes dos logs
  ☐ DPA assinado com sub-processadores

CONNECTORS
  ☐ Sandbox: network allowlist sem wildcard
  ☐ Sandbox: memory limit 256MB
  ☐ Bundle: assinatura verificada
  ☐ OAuth: PKCE implementado
```

## 12. Checklist de Publicação no Marketplace

```
MARKETPLACE PUBLISHING CHECKLIST

TÉCNICO
  ☐ Implementation Checklist: 100% PASS
  ☐ Security Checklist: 100% PASS
  ☐ Sprint Zero tests: PASS
  ☐ Performance: P95 < 2s para actions principais

DOCUMENTAÇÃO
  ☐ README com exemplos funcionais (pt-BR e en-US)
  ☐ CHANGELOG com semantic versioning
  ☐ API reference completa
  ☐ Guia de troubleshooting

MARKETPLACE
  ☐ Ícone (512×512 PNG, fundo transparente)
  ☐ Screenshots (mínimo 3)
  ☐ Pricing declarado
  ☐ Política de privacidade
  ☐ Termos de uso
  ☐ SLA declarado
  ☐ Canal de suporte

CERTIFICAÇÃO (CERTIFIED tier)
  ☐ Code review pela equipe MemoryOS
  ☐ Security audit externo
  ☐ Testes de carga documentados
  ☐ Contrato de parceria assinado
```

---

## Declaração Oficial do MDS

O MemoryOS Developer Specification (MDS) é declarado oficialmente como o **Manual Oficial de Engenharia do MemoryOS**.

Ele traduz a visão estratégica do MV, a especificação de produto do MPS, a arquitetura do MAS, os padrões de engenharia do MES, o framework de Connectors do MCF, a inteligência de Connectors do MCIS e a inteligência de Goals do MGIS em **especificações técnicas completas, implementáveis e auditáveis**.

**Toda implementação futura do MemoryOS deverá seguir rigorosamente esta especificação.**

Qualquer equipe de engenharia que seguir o MDS em conjunto com toda a Biblioteca Oficial estará apta a construir, manter e evoluir o MemoryOS com:

- Consistência arquitetural total com os princípios do MAS
- Escalabilidade de 1 a 1 bilhão de usuários
- Extensibilidade para milhões de Connectors via MCF + MCIS
- Compreensão profunda de objetivos humanos via MGIS
- Qualidade, segurança e compliance desde o primeiro commit

---

**MDS — MemoryOS Developer Specification**  
**Versão:** 1.0 · **Status:** Manual Oficial de Engenharia · **Data:** 2026-07-08  
**Documentos:** MDS · MDS-Engines · MDS-Platform · MDS-Connectors