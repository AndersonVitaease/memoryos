# MDS-Platform — Frontend, Voice, Enterprise, Marketplace, Testes, DevOps e Segurança

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 3 de 4 do MDS

---

# PARTE VI — FRONTEND

---

## 1. Arquitetura Frontend

```
┌─────────────────────────────────────────────────────────────────────┐
│                   FRONTEND ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────┘

STACK OFICIAL:
  Framework:       React 19 (web) | React Native 0.74+ (mobile)
  Language:        TypeScript 5.x (strict mode)
  State:           Zustand (local) + React Query (server state)
  Routing:         React Router 6 (web) | Expo Router (mobile)
  Styling:         Tailwind CSS + shadcn/ui (web) | NativeWind (mobile)
  Build:           Vite (web) | Metro (mobile)
  Testing:         Vitest + Testing Library + Playwright (E2E)

ESTRUTURA DE ESTADO:
  Server State:    @tanstack/react-query (cache + sync + mutations)
  UI State:        Zustand stores (theme, voice, notifications, sidebar)
  Forms:           React Hook Form + Zod validation
  Real-time:       WebSocket (goals, executions, notifications)
  Offline:         IndexedDB via Dexie.js (memory cache local)

apps/web/src/
├── pages/              # Rotas (uma página = um arquivo)
├── components/
│   ├── ui/             # shadcn/ui base components
│   ├── core/           # Core components (ChatInterface, GoalCard, ...)
│   ├── memory/         # Memory visualization components
│   ├── connectors/     # Connector management UI
│   └── layout/         # AppLayout, Sidebar, Header
├── stores/             # Zustand stores
│   ├── goalStore.ts
│   ├── voiceStore.ts
│   └── notificationStore.ts
├── hooks/              # Custom hooks
│   ├── useGoalStream.ts       # WebSocket hook para goals
│   ├── useVoicePipeline.ts
│   └── useMemorySearch.ts
├── lib/
│   ├── api/            # API client (wraps fetch)
│   ├── ws/             # WebSocket client
│   └── offline/        # IndexedDB / Service Worker
└── design-system/      # Tokens, themes, typography
```

## 2. Design System

```typescript
// src/design-system/tokens.ts

export const tokens = {
  // Cores
  colors: {
    brand:    { primary: "#7C3AED", secondary: "#4F46E5" },
    surface:  { base: "#09090B", elevated: "#18181B", overlay: "#27272A" },
    text:     { primary: "#FAFAFA", secondary: "#A1A1AA", muted: "#71717A" },
    semantic: { success: "#22C55E", warning: "#F59E0B", error: "#EF4444", info: "#3B82F6" },
  },

  // Tipografia
  typography: {
    fonts: {
      heading: "'Inter Variable', sans-serif",
      body:    "'Inter Variable', sans-serif",
      mono:    "'JetBrains Mono', monospace",
    },
    scale: {
      xs:   "0.75rem",   // 12px
      sm:   "0.875rem",  // 14px
      base: "1rem",      // 16px
      lg:   "1.125rem",  // 18px
      xl:   "1.25rem",   // 20px
      "2xl":"1.5rem",    // 24px
      "3xl":"1.875rem",  // 30px
      "4xl":"2.25rem",   // 36px
    },
  },

  // Espaçamento
  spacing: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px" },

  // Breakpoints
  breakpoints: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },

  // Animações
  animation: {
    fast:   "100ms ease-out",
    normal: "200ms ease-out",
    slow:   "300ms ease-in-out",
  },
} as const;
```

## 3. Responsividade e Targets de Device

```
┌────────────────────────────────────────────────────────────────────┐
│                    DEVICE MATRIX                                   │
├──────────────────┬─────────────────────────────────────────────────┤
│ Device           │ Considerações de UX                             │
├──────────────────┼─────────────────────────────────────────────────┤
│ Desktop (1280+)  │ Full sidebar, multi-panel, keyboard shortcuts   │
│ Laptop (1024+)   │ Collapsible sidebar, dense information          │
│ Tablet (768+)    │ Modal sidebar, touch-first navigation           │
│ Mobile (< 768)   │ Bottom nav, full-screen chat, voice-first       │
│ Wearable         │ Notifications only, voice responses             │
└──────────────────┴─────────────────────────────────────────────────┘

OFFLINE FIRST:
  Service Worker: cache de assets + API responses
  Background Sync: queue de mutations quando offline
  IndexedDB: last 1000 memory records + active goals
  Conflict resolution: server wins (timestamp-based)
```

## 4. Internacionalização (i18n)

```typescript
// lib/i18n/config.ts — next-intl ou i18next

export const SUPPORTED_LOCALES = ["pt-BR", "en-US", "es-ES", "fr-FR"] as const;
export const DEFAULT_LOCALE     = "pt-BR" as const;

// Estrutura de tradução
// locales/
//   pt-BR/
//     common.json      — botões, labels gerais
//     goals.json       — terminologia de goals
//     connectors.json  — nomes e descrições
//     errors.json      — mensagens de erro

// Regras:
// 1. Nunca string hardcoded em JSX
// 2. Pluralização via ICU message format
// 3. Datas/moedas formatadas via Intl API nativa
// 4. RTL support: Arabic, Hebrew (futuro) via CSS logical properties
```

## 5. Acessibilidade

```
WCAG 2.1 AA — obrigatório em todos os componentes

Checklist por componente:
  ✅ Roles ARIA corretos (role="dialog", "navigation", "main")
  ✅ Labels descritivos (aria-label, aria-labelledby)
  ✅ Focus management (focus trap em modals)
  ✅ Keyboard navigation (Tab, Shift+Tab, Enter, Escape, Arrow keys)
  ✅ Color contrast ratio ≥ 4.5:1 (texto normal), 3:1 (texto grande)
  ✅ Não depender exclusivamente de cor para transmitir info
  ✅ Alt text em todas as imagens
  ✅ Live regions para conteúdo dinâmico (aria-live="polite")
  ✅ Skip links para leitores de tela
```

---

# PARTE VII — VOICE FIRST

---

## 6. Arquitetura de Voz

```typescript
// packages/voice/voice-pipeline.ts

export class VoicePipeline {
  constructor(
    private readonly stt:          SpeechToTextEngine,   // Whisper / Web Speech API
    private readonly intentEngine: IntentEngine,
    private readonly tts:          TextToSpeechEngine,   // ElevenLabs / Web TTS
    private readonly vad:          VoiceActivityDetector,
    private readonly interruption: InterruptionHandler,
  ) {}

  async startSession(mode: VoiceMode): Promise<VoiceSession> {
    const session: VoiceSession = {
      sessionId: generateId("vss"),
      mode,      // PUSH_TO_TALK | CONTINUOUS
      state:     "LISTENING",
      startedAt: new Date().toISOString(),
    };

    if (mode === "CONTINUOUS") {
      await this.vad.start(session.sessionId, {
        silenceThresholdMs: 1500,
        onSpeechStart: () => this.setSessionState(session, "RECORDING"),
        onSpeechEnd:   (audio) => this.processAudio(session, audio),
      });
    }

    return session;
  }

  async processAudio(session: VoiceSession, audio: AudioBuffer): Promise<void> {
    try {
      // 1. Feedback visual: TRANSCRIBING
      this.emitState(session, "TRANSCRIBING");

      // 2. STT com timeout
      const transcript = await withTimeout(
        this.stt.transcribe(audio, session.language),
        10_000,
        new VoiceTimeoutError("STT timeout")
      );

      // 3. Processar como intent normal
      this.emitState(session, "PROCESSING");
      const result = await this.intentEngine.process(transcript, session.context);

      // 4. TTS da resposta
      this.emitState(session, "SPEAKING");
      const speech = await this.tts.synthesize(result.naturalResponse, {
        voice:    session.preferences?.voice ?? "default",
        language: session.language,
      });

      // 5. Reproduzir com suporte a interrupção
      await this.interruption.play(speech, () => {
        // Usuário interrompeu → voltar a LISTENING imediatamente
        this.setSessionState(session, "LISTENING");
      });

      this.setSessionState(session, "LISTENING");
    } catch (error) {
      this.emitState(session, "ERROR");
      await this.tts.synthesize("Desculpe, não entendi. Pode repetir?");
      this.setSessionState(session, "LISTENING");
    }
  }
}

// ESTADOS DA SESSÃO DE VOZ:
type VoiceState =
  | "IDLE"          // Sessão não iniciada
  | "LISTENING"     // Aguardando fala
  | "RECORDING"     // Gravando fala ativa
  | "TRANSCRIBING"  // Convertendo áudio → texto
  | "PROCESSING"    // Intent Engine processando
  | "SPEAKING"      // TTS reproduzindo resposta
  | "ERROR";        // Erro — recovery automático
```

## 7. Idiomas e Personalização de Voz

```typescript
const VOICE_CONFIG = {
  supportedLanguages: ["pt-BR", "en-US", "es-ES"],
  defaultLanguage:    "pt-BR",

  voices: {
    "pt-BR": [
      { id: "pt-br-natural",  name: "Natural", gender: "female" },
      { id: "pt-br-formal",   name: "Formal",  gender: "male"   },
    ],
    "en-US": [
      { id: "en-us-river",    name: "River",   gender: "neutral" },
    ],
  },

  interruptionEnabled: true,     // Usuário pode interromper TTS
  continuousMode:      false,    // Default: Push-to-Talk
  hapticFeedback:      true,     // Vibração em mobile
  soundFeedback:       true,     // Beep no início/fim da gravação

  silenceDetection: {
    thresholdMs:  1500,           // Parar de gravar após 1.5s de silêncio
    maxRecordMs: 30_000,          // Timeout máximo de gravação: 30s
  },
};
```

---

# PARTE VIII — ENTERPRISE

---

## 8. Multi-Tenant e Hierarquia Organizacional

```typescript
// Estrutura de tenant Enterprise

interface Organization {
  orgId:       string;
  name:        string;
  plan:        "ENTERPRISE" | "ENTERPRISE_PLUS";
  ssoProvider: "SAML" | "OIDC" | "NONE";
  ssoConfig:   SSOConfig;
  settings:    OrgSettings;
}

interface Department {
  deptId:        string;
  orgId:         string;
  name:          string;
  parentDeptId?: string;    // Hierarquia de departamentos
  managers:      string[];  // User IDs
  allowedConnectors: string[];
  budgetLimit:   number;
  approvalThreshold: number;
}

// RBAC — Papéis e Permissões
const ROLES = {
  SYSTEM_ADMIN:   ["*"],                          // Tudo
  ORG_ADMIN:      ["org.*", "user.*", "connector.manage"],
  DEPT_MANAGER:   ["dept.*", "user.read", "goal.approve"],
  ANALYST:        ["goal.read", "memory.read", "connector.use"],
  USER:           ["goal.*", "memory.*", "connector.use_personal"],
  VIEWER:         ["goal.read", "memory.read"],
} as const;

// Aprovação hierárquica
interface ApprovalChain {
  goalId:    string;
  steps: Array<{
    order:       number;
    approverRole: string;
    approverId?: string;    // Específico ou pelo role
    status:      "PENDING" | "APPROVED" | "REJECTED";
    decidedAt?:  string;
    comment?:    string;
  }>;
  currentStep: number;
  expiresAt:   string;
}
```

## 9. Auditoria Enterprise

```typescript
// Eventos auditáveis (append-only, imutável)
const AUDITABLE_EVENTS = [
  "user.login", "user.logout", "user.permission_changed",
  "goal.created", "goal.executed", "goal.cancelled",
  "connector.connected", "connector.executed", "connector.disconnected",
  "memory.accessed", "memory.deleted",
  "approval.requested", "approval.granted", "approval.rejected",
  "policy.overridden", "security.suspicious_activity",
] as const;

// Auditoria imutável via append-only table + hash chain
interface AuditEntry {
  id:         string;
  tenantId:   string;
  userId:     string;
  action:     typeof AUDITABLE_EVENTS[number];
  resource:   string;
  resourceId: string;
  before:     unknown;
  after:      unknown;
  ipAddress:  string;
  userAgent:  string;
  hash:       string;   // SHA-256(prev_hash + entry_data)
  prevHash:   string;   // Hash da entrada anterior
  createdAt:  string;
}
// Verificação de integridade: recomputar hash chain e comparar
```

---

# PARTE IX — MARKETPLACE

---

## 10. Marketplace de Connectors

```typescript
// marketplace-service: catálogo público + instalação

interface MarketplaceConnector {
  connectorId:        string;
  name:               string;
  vendor:             string;
  description:        string;
  longDescription:    string;
  category:           string;
  tags:               string[];
  certificationLevel: "CERTIFIED" | "PARTNER" | "COMMUNITY";

  // Pricing
  pricing: {
    model:       "FREE" | "FREEMIUM" | "PAID" | "CREDITS";
    monthlyCost?: number;
    creditCost?:  number;  // Custo em créditos por execução
  };

  // Stats
  stats: {
    installs:     number;
    rating:       number;  // 0-5
    reviewCount:  number;
    weeklyCalls:  number;
  };

  // Versões
  versions:         ConnectorVersion[];
  latestVersion:    string;
  changelog:        ChangelogEntry[];

  // Compatibilidade
  requiredPlan:     "FREE" | "PRO" | "ENTERPRISE";
  sdkCompatibility: string;
}

// Instalação via API
async function installConnector(
  connectorId: string,
  userId: string,
  config?: ConnectorConfig
): Promise<InstallResult> {
  // 1. Verificar compatibilidade e plano
  // 2. Download do bundle do connector (signed)
  // 3. Verificar assinatura digital
  // 4. Desempacotar em sandbox isolado
  // 5. Executar connector.initialize()
  // 6. MCIS Hot Plug: registrar nos Registries
  // 7. Retornar resultado
}
```

## 11. Marketplaces Adicionais

```
MARKETPLACE DE SPECIALISTS:
  Pacotes de conhecimento especializado
  Ex: "Specialist Farmacêutico Premium v2.0"
  Instalação similar a Connectors
  Versionamento independente

MARKETPLACE DE WORKFLOWS:
  Templates de workflows prontos
  Ex: "Workflow: Onboarding de Clientes B2B"
  Composto por: Goals + Connectors + Policies
  Exportável/importável entre organizações

MARKETPLACE DE PROMPTS:
  Templates de prompts otimizados por domínio
  Ex: "Prompt Pack: Análise Jurídica Contratual"
  Versionado e avaliado pela comunidade

MARKETPLACE DE POLICIES:
  Templates de políticas corporativas
  Ex: "Policy Pack: LGPD Compliance"
  Certificado por jurídicos parceiros

LICENCIAMENTO:
  OSS:          Apache 2.0 (connectors community)
  Commercial:   Licença MemoryOS Commercial
  Assinatura:   Mensal/anual com desconto
  Revenue share: 70% desenvolvedor / 30% plataforma
```

---

# PARTE X — SPECIALISTS

---

## 12. Arquitetura de Specialists

```typescript
// packages/specialists/base-specialist.ts

abstract class BaseSpecialist {
  abstract readonly domain: SpecialistDomain;
  abstract readonly version: string;

  // Enriquecer decomposição de Goals
  abstract enrich(
    goal: Goal,
    context: GoalContext
  ): Promise<SpecialistEnrichment>;

  // Responder perguntas no domínio
  abstract answer(
    query: string,
    context: GoalContext,
    memory: MemoryContext
  ): Promise<SpecialistAnswer>;

  // Validar um plano de execução
  abstract validate(
    plan: ExecutionPlan
  ): Promise<SpecialistValidation>;

  // Descrever capacidades (auto-discovery)
  abstract describe(): SpecialistDescriptor;
}

// Knowledge Pack — pacote de conhecimento do Specialist
interface KnowledgePackage {
  packId:      string;
  domain:      SpecialistDomain;
  version:     string;
  documents:   KnowledgeDocument[];  // PDFs, JSONs, textos estruturados
  rules:       BusinessRule[];        // Regras determinísticas
  embeddings:  EmbeddingCollection;  // Vetores pré-computados
  validUntil?: string;               // Para conhecimento com prazo (regulatório)
}

// Atualização de Knowledge Packs
// Estratégia: semantic versioning + diff-patch para updates incrementais
// Compatibilidade: KP 2.x sempre retrocompatível com Specialist 2.x
```

---

# PARTE XII — TESTES

---

## 13. Estratégia de Testes

```typescript
// PIRÂMIDE DE TESTES

// UNITÁRIOS (base) — 70% da cobertura
// Vitest — rápidos, sem I/O
describe("GoalDecomposer", () => {
  it("should decompose TRAVEL goal into required subgoals", () => {
    const decomposer = new GoalDecomposer(mockSpecialistBus);
    const goal = GoalFactory.create(
      mockIntent({ domain: "TRAVEL" }),
      mockContext()
    );
    const result = decomposer.decompose(goal, mockContext(), []);
    expect(result.subGoals).toContainEqual(
      expect.objectContaining({ ontologyDomain: "TRAVEL.FLIGHTS" })
    );
  });
});

// INTEGRAÇÃO (meio) — 20%
// Testcontainers para DB e Redis reais
describe("GoalRepository (Integration)", () => {
  let pg: PostgreSqlContainer;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:16").start();
    await runMigrations(pg.getConnectionUri());
  });

  it("should persist and retrieve a goal", async () => {
    const repo = new PostgresGoalRepository(pg.getConnectionUri());
    const aggregate = GoalFactory.create(mockIntent(), mockContext());
    await repo.save(aggregate);
    const found = await repo.findById(aggregate.id);
    expect(found?.id).toBe(aggregate.id);
  });
});

// E2E (topo) — 10%
// Playwright — fluxo real no browser
test("user can process a travel intent end-to-end", async ({ page }) => {
  await page.goto("/");
  await page.fill("[data-testid='chat-input']", "Quero viajar para Londres");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-testid='goal-card']")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-testid='goal-title']")).toContainText("Londres");
});
```

## 14. Chaos Engineering

```yaml
# chaos/experiments/connector-failure.yaml
# LitmusChaos ou Gremlin

experiment:
  name: "Gmail Connector Failure"
  hypothesis: "When GmailConnector fails, system falls back to Outlook within 500ms"
  
  steps:
    - action: inject_fault
      target: connector-service
      fault: http_error
      params:
        connector_id: "gmail"
        error_rate: 100%
        duration: 60s

    - action: trigger_goal
      params:
        intent: "Send email to João"
        user_id: "test-user-001"

  assertions:
    - metric: "goal.fallback_activated"
      expected: true
    - metric: "goal.fallback_latency_ms"
      expected: "< 500"
    - metric: "goal.completed_successfully"
      expected: true
```

---

# PARTE XIII — DEVOPS

---

## 15. CI/CD Pipeline

```yaml
# .github/workflows/main.yml

name: MemoryOS CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup
        uses: pnpm/action-setup@v3
      - name: Lint
        run: pnpm run lint
      - name: Type check
        run: pnpm run typecheck
      - name: Unit tests
        run: pnpm run test:unit --coverage
      - name: Coverage gate (80%)
        run: pnpm run coverage:check

  integration:
    needs: quality
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16 }
      redis:    { image: redis:7 }
    steps:
      - run: pnpm run test:integration

  deploy-staging:
    needs: integration
    if: github.ref == 'refs/heads/develop'
    steps:
      - name: Deploy to staging (Kubernetes)
        run: kubectl apply -k infra/k8s/staging/

  deploy-production:
    needs: integration
    if: github.ref == 'refs/heads/main'
    strategy:
      type: canary
      steps: [5%, 25%, 50%, 100%]
      pauseAfterEach: 5m
    steps:
      - name: Canary deploy to production
        run: ./infra/scripts/canary-deploy.sh
```

## 16. Observabilidade (OpenTelemetry)

```typescript
// packages/infra/observability/tracing.ts

import { NodeTracerProvider } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

export function initTracing(serviceName: string) {
  const provider = new NodeTracerProvider({
    resource: new Resource({ "service.name": serviceName }),
  });
  provider.addSpanProcessor(
    new BatchSpanProcessor(new OTLPTraceExporter({
      url: process.env.OTLP_ENDPOINT,
    }))
  );
  provider.register();
}

// Métricas — Prometheus
const goalProcessingDuration = new Histogram({
  name:    "goal_processing_duration_ms",
  help:    "Duration of goal processing in milliseconds",
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
  labelNames: ["domain", "complexity", "status"],
});

const connectorExecutionTotal = new Counter({
  name:      "connector_execution_total",
  help:      "Total connector executions",
  labelNames: ["connector_id", "action", "status"],
});

// Alertas — Grafana / PagerDuty
// Goal processing P95 > 5s → CRITICAL
// Connector error rate > 5% → WARNING
// Memory store latency P99 > 100ms → WARNING
// DB connection pool exhausted → CRITICAL
```

---

# PARTE XIV — SEGURANÇA

---

## 17. Arquitetura de Segurança

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SECURITY ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────┘

AUTENTICAÇÃO:
  OAuth 2.0 + PKCE (SPA/mobile)
  OIDC (Enterprise SSO)
  SAML 2.0 (Enterprise SSO legado)
  JWT RS256 (access token: 15min) + refresh token (30 dias, rotation)
  MFA: TOTP (Authenticator app) obrigatório para Enterprise

AUTORIZAÇÃO:
  RBAC (Role-Based) para Personal
  ABAC (Attribute-Based) para Enterprise (departamento, orçamento, etc.)
  Policy Engine (MGIS) como última camada antes de execução

CRIPTOGRAFIA:
  Em trânsito:  TLS 1.3 obrigatório
  Em repouso:   AES-256-GCM (dados sensíveis) via envelope encryption
  Chaves:       AWS KMS / HashiCorp Vault (nunca hardcoded)
  Secrets:      Vault + rotação automática a cada 90 dias

CONNECTOR SANDBOX:
  Execução isolada em processo separado (Node.js worker_threads ou Deno)
  Sem acesso ao filesystem do host
  Network: allowlist apenas de domínios declarados no manifesto
  Memória: limite de 256MB por execução
  CPU: limite via cgroups
  Timeout: máx. 60s por default, configurável

LGPD / GDPR:
  Minimização de dados: coletar apenas o necessário
  Consentimento explícito antes de processar dados pessoais
  Direito ao esquecimento: /v1/users/:id (DELETE) apaga todos os dados
  Portabilidade: /v1/users/:id/export (JSON completo)
  DPA assinado com todos os sub-processadores
  Logs de auditoria retidos por 5 anos (LGPD Art. 37)

ASSINATURA DE CONNECTORS:
  Todo connector oficial assinado com chave privada MemoryOS
  Verificação de assinatura no install e a cada inicialização
  Certificate pinning para comunicação com sistemas externos críticos
```

## 18. OAuth Flow para Connectors

```typescript
// Fluxo OAuth 2.0 Authorization Code + PKCE para Connectors

async function initiateConnectorAuth(
  connectorId: string,
  userId: string
): Promise<OAuthInitResult> {
  const connector = await connectorRegistry.get(connectorId);
  const { codeVerifier, codeChallenge } = generatePKCE();

  // Salvar state e verifier em sessão (Redis, TTL: 10min)
  const state = generateSecureRandom(32);
  await redisClient.setex(
    `oauth:${state}`,
    600,
    JSON.stringify({ connectorId, userId, codeVerifier })
  );

  const authUrl = buildAuthUrl(connector.oauthConfig, {
    state,
    codeChallenge,
    codeChallengeMethod: "S256",
    redirectUri: `${BASE_URL}/v1/connectors/oauth/callback`,
    scope: connector.requiredScopes.join(" "),
  });

  return { authUrl, state };
}

async function handleOAuthCallback(
  code: string,
  state: string
): Promise<ConnectorCredential> {
  const session = await redisClient.get(`oauth:${state}`);
  if (!session) throw new OAuthStateExpiredError();

  const { connectorId, userId, codeVerifier } = JSON.parse(session);
  const tokens = await exchangeCodeForTokens(connectorId, code, codeVerifier);

  // Armazenar tokens criptografados (AES-256)
  await credentialStore.save({
    connectorId,
    userId,
    accessToken:  encrypt(tokens.access_token),
    refreshToken: encrypt(tokens.refresh_token),
    expiresAt:    new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scopes:       tokens.scope.split(" "),
  });

  await redisClient.del(`oauth:${state}`);
  return { connectorId, userId, connected: true };
}
```

---

**Documento Oficial:** MDS-Platform  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 3 de 4 do MDS