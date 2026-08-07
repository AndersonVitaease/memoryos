# MDS-Platform — Frontend, Voice, Enterprise, Specialists, Testes, DevOps e Segurança

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 3 de 4 do MDS

---

# PARTE VI — FRONTEND

---

## 1. Arquitetura Frontend

```
STACK OFICIAL:
  Web:      React 19 + Vite 5 + TypeScript 5 (strict)
  Mobile:   React Native 0.74 + Expo SDK 51
  Desktop:  Electron 30 wrapping web app
  Estilo:   Tailwind CSS + shadcn/ui (web) | NativeWind (mobile)
  Estado:   Zustand (UI) + TanStack Query v5 (server state)
  Forms:    React Hook Form + Zod
  Roteamento: React Router 6 (web) | Expo Router (mobile)
  Real-time:  WebSocket client (native + reconnect)
  Offline:    Dexie.js (IndexedDB) + Service Worker

apps/web/src/
├── pages/              # Uma página = um arquivo, rota 1:1
├── components/
│   ├── ui/             # shadcn/ui base
│   ├── chat/           # ChatInterface, VoiceButton, ProcessingBubble
│   ├── goals/          # GoalCard, GoalTimeline, GoalGraph
│   ├── memory/         # MemorySearch, MemoryCard, MemoryTimeline
│   ├── connectors/     # ConnectorCard, ConnectorOAuth, ConnectorStatus
│   └── layout/         # AppLayout, Sidebar, Header, BottomNav (mobile)
├── stores/
│   ├── goalStore.ts    # Goals ativos, histórico
│   ├── voiceStore.ts   # Estado da sessão de voz
│   ├── uiStore.ts      # Tema, sidebar, notifications
│   └── wsStore.ts      # Conexão WebSocket
├── hooks/
│   ├── useGoalStream.ts       # Assina updates de goal via WS
│   ├── useVoicePipeline.ts    # Pipeline de voz
│   ├── useMemorySearch.ts     # Busca semântica de memória
│   └── useConnectorOAuth.ts   # Flow OAuth de connector
└── lib/
    ├── api/            # Axios client com interceptors (auth + retry)
    ├── ws/             # WebSocket client com auto-reconnect
    └── offline/        # IndexedDB + Service Worker sync
```

## 2. Design System

```typescript
// src/lib/design-system/tokens.ts
export const tokens = {
  colors: {
    brand:   { 50: "#F5F3FF", 500: "#7C3AED", 900: "#2E1065" },
    surface: { base: "#09090B", elevated: "#18181B", overlay: "#27272A", border: "#3F3F46" },
    text:    { primary: "#FAFAFA", secondary: "#A1A1AA", muted: "#71717A", disabled: "#52525B" },
    semantic:{ success: "#22C55E", warning: "#F59E0B", error: "#EF4444", info: "#3B82F6" },
  },
  typography: {
    fonts: { heading: "'Inter Variable'", body: "'Inter Variable'", mono: "'JetBrains Mono'" },
    scale: { xs: ".75rem", sm: ".875rem", base: "1rem", lg: "1.125rem", xl: "1.25rem",
             "2xl": "1.5rem", "3xl": "1.875rem", "4xl": "2.25rem" },
    weight:{ normal: 400, medium: 500, semibold: 600, bold: 700 },
  },
  spacing:    { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px", 12: "48px", 16: "64px" },
  radius:     { sm: "4px", md: "8px", lg: "12px", xl: "16px", full: "9999px" },
  breakpoints:{ sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },
  animation:  { fast: "100ms ease-out", normal: "200ms ease-out", slow: "300ms ease-in-out" },
  zIndex:     { base: 0, overlay: 10, modal: 20, toast: 30, tooltip: 40 },
} as const;
```

## 3. Device Matrix e Responsividade

```
┌──────────────────┬──────────────────────────────────────────────────────────┐
│ Device           │ UX Adaptations                                          │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ Desktop ≥ 1280px │ Full sidebar, multi-panel, keyboard shortcuts           │
│                  │ Hover states, dense information, drag & drop            │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ Laptop 1024-1279 │ Collapsible sidebar, single panel, most features       │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ Tablet 768-1023  │ Modal/drawer sidebar, touch targets ≥ 44px             │
│                  │ Swipe gestures, simplified navigation                   │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ Mobile < 768px   │ Bottom navigation, full-screen chat, voice-first        │
│                  │ Swipe to dismiss, haptic feedback                       │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ Wearable         │ Notifications only, voice responses, minimal UI         │
│                  │ WearOS / watchOS companion app (futuro)                 │
└──────────────────┴──────────────────────────────────────────────────────────┘

OFFLINE FIRST:
  Service Worker: cache de assets (Cache API) + API responses (network-first)
  Background Sync: queue de mutations quando offline, sync ao reconectar
  IndexedDB (Dexie): últimas 1000 memory records + goals ativos + preferences
  Conflict resolution: server-wins (timestamp-based merge)
```

## 4. i18n e Acessibilidade

```typescript
// i18n — next-intl
export const SUPPORTED_LOCALES  = ["pt-BR", "en-US", "es-ES"] as const;
export const DEFAULT_LOCALE     = "pt-BR" as const;
// locales/<locale>/common.json, goals.json, connectors.json, errors.json

// REGRAS:
// 1. Zero strings hardcoded em JSX
// 2. Pluralização via ICU message format
// 3. Datas/moedas via Intl API nativa (respeita locale)
// 4. RTL: Arabic/Hebrew via CSS logical properties (padding-inline-start, etc.)

// ACESSIBILIDADE — WCAG 2.1 AA obrigatório
// Checklist por componente:
// ✅ Roles ARIA semânticos (role="dialog", "navigation", "main", "alert")
// ✅ Labels descritivos (aria-label, aria-labelledby, aria-describedby)
// ✅ Focus trap em modais + focus-visible style
// ✅ Keyboard navigation: Tab, Shift+Tab, Enter, Escape, Arrow keys
// ✅ Contrast ratio ≥ 4.5:1 (texto normal) | 3:1 (texto grande / UI)
// ✅ Sem info exclusivamente por cor (ícone + texto complementar)
// ✅ Alt text em todas as imagens com conteúdo
// ✅ aria-live="polite" em regiões com conteúdo dinâmico
// ✅ Skip links para leitores de tela
// ✅ motion: prefers-reduced-motion respeitado
```

---

# PARTE VII — VOICE FIRST

---

## 5. Voice Pipeline Completo

```typescript
// apps/voice-service/src/voice-pipeline.ts

export class VoicePipeline {
  constructor(
    private readonly stt:          STTEngine,        // Whisper API / Web Speech API
    private readonly tts:          TTSEngine,        // ElevenLabs / Web Speech Synth
    private readonly vad:          VoiceActivityDetector,
    private readonly intentEngine: IntentEngine,
    private readonly interruption: InterruptionHandler,
  ) {}

  async startSession(config: VoiceSessionConfig): Promise<VoiceSession> {
    const session: VoiceSession = {
      sessionId: generateId("vss"),
      mode:      config.mode,          // PUSH_TO_TALK | CONTINUOUS
      language:  config.language ?? "pt-BR",
      state:     "LISTENING",
      startedAt: new Date().toISOString(),
    };

    if (config.mode === "CONTINUOUS") {
      await this.vad.start({
        silenceThresholdMs: 1500,
        maxRecordMs:        30_000,
        onSpeechStart: ()      => this.setState(session, "RECORDING"),
        onSpeechEnd:   (audio) => this.processAudio(session, audio),
      });
    }

    return session;
  }

  async processAudio(session: VoiceSession, audio: AudioBuffer): Promise<void> {
    try {
      this.setState(session, "TRANSCRIBING");
      const transcript = await withTimeout(
        this.stt.transcribe(audio, session.language), 10_000
      );

      this.setState(session, "PROCESSING");
      const result = await this.intentEngine.process(transcript, session.context);

      this.setState(session, "SPEAKING");
      const speech = await this.tts.synthesize(result.naturalResponse, {
        voice:    session.preferences?.voice ?? "river",
        language: session.language,
        speed:    session.preferences?.speed ?? 1.0,
      });

      await this.interruption.play(speech, () => {
        // Usuário interrompeu → volta a LISTENING imediatamente
        this.setState(session, "LISTENING");
      });

      this.setState(session, "LISTENING");
    } catch {
      this.setState(session, "ERROR");
      await this.tts.synthesize("Desculpe, não entendi. Pode repetir?");
      await sleep(500);
      this.setState(session, "LISTENING");   // recovery automático
    }
  }
}

// ESTADOS:
// IDLE → LISTENING → RECORDING → TRANSCRIBING → PROCESSING → SPEAKING → LISTENING
//                                                                       ↑ interrupção
// QUALQUER → ERROR → LISTENING (auto-recover)
```

## 6. Voice Config

```typescript
const VOICE_CONFIG = {
  supportedLanguages: ["pt-BR", "en-US", "es-ES"],
  defaultLanguage:    "pt-BR",
  modes:              ["PUSH_TO_TALK", "CONTINUOUS"],
  defaultMode:        "PUSH_TO_TALK",
  voices: {
    "pt-BR": [{ id: "river-ptbr", name: "River", gender: "neutral" },
              { id: "honey-ptbr", name: "Honey", gender: "female" }],
    "en-US": [{ id: "river-enus", name: "River", gender: "neutral" }],
  },
  feedback: { haptic: true, sound: true },
  silenceThresholdMs: 1500,
  maxRecordMs:        30_000,
  interruptionEnabled: true,
  contextMemory: true,     // Manter contexto entre turns da conversa
} as const;
```

---

# PARTE VIII — ENTERPRISE

---

## 7. Multi-Tenant e RBAC

```typescript
// RBAC oficial
const ROLES = {
  SYSTEM_ADMIN:  ["*"],
  ORG_ADMIN:     ["org.*", "user.*", "connector.manage", "policy.manage"],
  DEPT_MANAGER:  ["dept.*", "user.read", "goal.approve", "connector.use_org"],
  ANALYST:       ["goal.read", "memory.read", "connector.use"],
  USER:          ["goal.*", "memory.*", "connector.use_personal"],
  VIEWER:        ["goal.read", "memory.read"],
} as const;

// Hierarquia organizacional
interface Organization {
  orgId:             string;
  name:              string;
  plan:              "ENTERPRISE" | "ENTERPRISE_PLUS";
  ssoProvider:       "SAML" | "OIDC" | "NONE";
  approvalThreshold: number;   // Valor em R$ que exige aprovação
  departments:       Department[];
}

interface Department {
  deptId:              string;
  orgId:               string;
  parentDeptId?:       string;       // Hierarquia de departamentos
  name:                string;
  managerIds:          string[];
  allowedConnectors:   string[];
  budgetMonthly:       number;
  approvalThreshold:   number;
}

// Aprovação hierárquica
interface ApprovalChain {
  goalId:      string;
  steps: Array<{
    order:         number;
    approverRole:  string;
    approverId?:   string;
    status:        "PENDING" | "APPROVED" | "REJECTED";
    decidedAt?:    string;
    comment?:      string;
  }>;
  currentStep: number;
  expiresAt:   string;    // Goal cancelado se expirar sem aprovação
}
```

## 8. Auditoria Enterprise (Append-Only + Hash Chain)

```typescript
// Auditoria imutável com hash chain (prova de integridade)
interface AuditEntry {
  id:         string;
  tenantId:   string;
  userId:     string;
  action:     AuditableAction;
  resource:   string;
  resourceId: string;
  before:     unknown;
  after:      unknown;
  ipAddress:  string;
  userAgent:  string;
  hash:       string;    // SHA-256(prevHash + JSON(entry))
  prevHash:   string;    // Forma chain imutável
  createdAt:  string;
}

// Verificar integridade do log
async function verifyAuditChain(entries: AuditEntry[]): Promise<boolean> {
  for (let i = 1; i < entries.length; i++) {
    const expected = sha256(entries[i - 1].hash + JSON.stringify(entries[i]));
    if (expected !== entries[i].hash) return false;
  }
  return true;
}

const AUDITABLE_ACTIONS: AuditableAction[] = [
  "user.login", "user.logout", "user.role_changed",
  "goal.created", "goal.executed", "goal.cancelled",
  "connector.connected", "connector.executed",
  "memory.accessed", "memory.deleted",
  "approval.granted", "approval.rejected",
  "policy.overridden", "security.mfa_bypass",
];
```

---

# PARTE IX — SPECIALISTS

---

## 9. Arquitetura de Specialists

```typescript
// packages/specialists/base-specialist.ts

abstract class BaseSpecialist implements MemoryOSPlugin {
  abstract readonly domain:  SpecialistDomain;
  abstract readonly version: string;
  readonly type = "SPECIALIST" as const;

  // Enriquecer decomposição de Goals com dimensões do domínio
  abstract enrich(goal: Goal, ctx: GoalContext): Promise<SpecialistEnrichment>;

  // Responder perguntas do domínio com conhecimento especializado
  abstract answer(query: string, ctx: GoalContext, mem: MemoryContext): Promise<SpecialistAnswer>;

  // Validar plano de execução (ex: Medical → verificar contraindicações)
  abstract validate(plan: ExecutionPlan): Promise<SpecialistValidation>;

  // MCIS-compatible self-description
  abstract describe(): SpecialistDescriptor;

  // Knowledge Pack carregado na inicialização
  protected knowledgePack!: KnowledgePackage;

  async onEnable(ctx: PluginContext): Promise<void> {
    this.knowledgePack = await ctx.knowledgeLoader.load(this.domain, this.version);
    await ctx.specialists.register(this);
  }
}

// Knowledge Package
interface KnowledgePackage {
  packId:      string;
  domain:      SpecialistDomain;
  version:     string;
  documents:   KnowledgeDocument[];   // Textos estruturados, JSONs, PDFs processados
  rules:       BusinessRule[];         // Regras determinísticas (ex: "voo < 24h → verificar passaporte")
  embeddings:  EmbeddingCollection;   // Vetores pré-computados para busca semântica rápida
  validUntil?: string;                // Para conhecimento regulatório com prazo
  changelog:   string;
}

// Specialist Bus (MGIS consulta durante decomposição)
interface SpecialistBus {
  consult(goal: Goal): Promise<SpecialistInsight[]>;
  register(specialist: BaseSpecialist): void;
  findByDomain(domain: string): BaseSpecialist | null;
}
```

---

# PARTE XII — TESTES

---

## 10. Estratégia de Testes — Pirâmide Oficial

```typescript
// NÍVEL 1 — UNITÁRIOS (70% da cobertura)
// Vitest — sem I/O, mocks explícitos, < 10ms cada

describe("GoalDecomposer", () => {
  it("decomposes TRAVEL goal into expected subdomains", async () => {
    const decomposer = new GoalDecomposer(mockSpecialistBus(), mockGoalRegistry());
    const goal       = GoalFactory.create(mockIntent({ domain: "TRAVEL" }), mockCtx());
    const result     = await decomposer.decompose(goal, mockCtx(), []);
    expect(result.subGoals.map(s => s.ontologyDomain)).toEqual(
      expect.arrayContaining(["TRAVEL.FLIGHTS", "TRAVEL.HOTELS", "TRAVEL.INSURANCE"])
    );
  });
});

describe("GoalStateMachine", () => {
  it("throws on invalid transition COMPLETED → EXECUTING", () => {
    expect(() => GoalStateMachine.assertValid("COMPLETED", "EXECUTING"))
      .toThrow(InvalidGoalTransitionError);
  });
});

// NÍVEL 2 — INTEGRAÇÃO (20%)
// Testcontainers — DB e Redis reais em container efêmero

describe("MemoryEngine (Integration)", () => {
  let pg: StartedPostgreSqlContainer;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:16-alpine").start();
    await runMigrations(pg.getConnectionUri());
  });

  it("stores and retrieves fact by vector similarity", async () => {
    const engine = buildMemoryEngine(pg.getConnectionUri());
    await engine.store({ userId: "u1", content: "João trabalha na empresa X", type: "FACT", confidence: 0.95 });
    const results = await engine.retrieve({ userId: "u1", text: "Onde João trabalha?", limit: 5 });
    expect(results[0].record.content).toContain("João");
    expect(results[0].similarity).toBeGreaterThan(0.80);
  });

  afterAll(() => pg.stop());
});

// NÍVEL 3 — E2E (10%)
// Playwright — fluxo real no browser

test("user processes travel intent end-to-end", async ({ page }) => {
  await page.goto("/");
  await loginAs(page, "test@memoryos.ai");
  await page.fill("[data-testid='chat-input']", "Quero viajar para Londres em agosto");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-testid='goal-card']")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-testid='goal-subgoals']")).toContainText("Voos");
  await expect(page.locator("[data-testid='goal-subgoals']")).toContainText("Hotéis");
});
```

## 11. Chaos Engineering

```yaml
# chaos/connector-failure.yaml

experiment:
  name: "Gmail Connector Total Failure → Outlook Fallback"
  hypothesis: "When Gmail fails 100%, system falls back to Outlook within 500ms"

  steps:
    - action: inject_http_fault
      target: connector-service
      params:
        selector: { connector_id: "gmail" }
        error_rate: "100%"
        status_code: 503
        duration: "60s"

    - action: send_intent
      params:
        text: "Send email to João confirming the meeting"
        user_id: "chaos-test-user-001"

  assertions:
    - metric: goal.fallback_activated     expected: true
    - metric: goal.fallback_latency_ms    expected: "< 500"
    - metric: goal.completed_successfully expected: true
    - metric: connector.fallback_used     expected: "outlook"

  rollback: restore_connector_health
```

---

# PARTE XIII — DEVOPS

---

## 12. CI/CD Pipeline

```yaml
# .github/workflows/ci.yml

name: MemoryOS CI/CD
on:
  push:    { branches: [main, develop] }
  pull_request: { branches: [main] }

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run typecheck lint
      - run: pnpm turbo run test:unit -- --coverage
      - name: Coverage gate (80% min)
        run: pnpm run coverage:check --threshold=80

  integration:
    needs: quality
    runs-on: ubuntu-latest
    services:
      postgres: { image: "postgres:16-alpine", env: { POSTGRES_PASSWORD: test } }
      redis:    { image: "redis:7-alpine" }
    steps:
      - uses: actions/checkout@v4
      - run: pnpm run test:integration

  deploy-staging:
    needs: integration
    if: github.ref == 'refs/heads/develop'
    steps:
      - uses: azure/k8s-deploy@v4
        with:
          manifests: infra/k8s/staging/
          strategy: rolling

  deploy-production:
    needs: integration
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Canary deploy (5% → 25% → 50% → 100%)
        run: ./infra/scripts/canary-deploy.sh
        env:
          CANARY_STEPS: "5,25,50,100"
          CANARY_PAUSE_MINUTES: "5"
          ROLLBACK_ERROR_THRESHOLD: "1"   # % de erros para rollback automático
```

## 13. Observabilidade (OpenTelemetry)

```typescript
// packages/infra/observability/setup.ts

export function setupObservability(serviceName: string) {
  // Tracing — Tempo (Grafana)
  const provider = new NodeTracerProvider({
    resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: serviceName }),
  });
  provider.addSpanProcessor(new BatchSpanProcessor(
    new OTLPTraceExporter({ url: process.env.MOS_OTLP_ENDPOINT })
  ));
  provider.register();

  // Métricas — Prometheus
  const meter = getMeter(serviceName);

  return {
    goalDuration: meter.createHistogram("goal_processing_duration_ms", {
      description: "Goal processing duration",
      unit:        "ms",
      boundaries:  [50, 100, 250, 500, 1000, 2500, 5000, 10000],
    }),
    connectorCalls: meter.createCounter("connector_execution_total", {
      description: "Total connector executions",
    }),
    memoryStoreLatency: meter.createHistogram("memory_store_latency_ms", {
      description: "Memory store operation latency",
      unit: "ms",
    }),
  };
}

// ALERTAS (Grafana / PagerDuty):
// goal_processing_duration_ms{p95} > 5000ms  → CRITICAL
// connector_error_rate > 5%                  → WARNING
// memory_store_latency_ms{p99} > 200ms       → WARNING
// DB connection pool > 90% utilization       → CRITICAL
// Circuit breaker OPEN duration > 5min       → WARNING
```

---

# PARTE XIV — SEGURANÇA

---

## 14. Arquitetura de Segurança

```
AUTENTICAÇÃO:
  Web/Mobile: OAuth 2.0 + PKCE (Authorization Code Flow)
  API:        API Key (para integrações server-to-server)
  Enterprise: OIDC (OpenID Connect) + SAML 2.0
  JWT:        RS256 | access_token TTL: 15min | refresh_token TTL: 30 dias (rotation)
  MFA:        TOTP (Authenticator App) — obrigatório para Enterprise
  SSO:        Google, Microsoft, Okta (via OIDC)

AUTORIZAÇÃO:
  Personal:   RBAC simples (owner = full access)
  Enterprise: RBAC + ABAC (departamento, budget, horário, geo)
  Policy Engine (MGIS) como última camada de validação antes de execução

CRIPTOGRAFIA:
  Em trânsito:  TLS 1.3 mandatory (HSTS com max-age=31536000)
  Em repouso:   AES-256-GCM com envelope encryption (DEK + KEK via KMS)
  Chaves:       AWS KMS / HashiCorp Vault
  Secrets:      Vault com rotação automática a cada 90 dias
  OAuth tokens: Armazenados criptografados (AES-256) na DB

CONNECTOR SANDBOX:
  Isolamento: Node.js worker_threads com MessageChannel
  CPU:        cgroup limit (200m por execução)
  Memória:    256MB hard limit por worker
  Network:    allowlist de domínios declarada no manifesto (sem wildcard *)
  Filesystem: sem acesso (read-only /tmp max 50MB)
  Timeout:    máx. 60s (configurável por connector)

ASSINATURA DE PLUGINS:
  Todo plugin oficial assinado com Ed25519 (chave privada MemoryOS)
  Verificação no install + a cada inicialização
  Hash SHA-256 do bundle validado no MCIS Registry

LGPD / GDPR:
  Minimização: coletar apenas campos necessários
  Consentimento: explícito antes de processar dados pessoais
  Direito ao esquecimento: DELETE /v1/users/:id apaga todos os dados (cascade)
  Portabilidade: GET /v1/users/:id/export retorna JSON completo
  DPA: assinado com todos os sub-processadores
  Logs de auditoria retidos por 5 anos (LGPD Art. 37)
  DPO designado: contato declarado na política de privacidade
  Privacy by Design: dados pessoais na memory_records nunca em logs

OWASP TOP 10 — ENDEREÇAMENTO:
  A01 Broken Access Control     → RBAC + RLS no DB + ABAC no Policy Engine
  A02 Cryptographic Failures    → AES-256 + TLS 1.3 + no-cache em dados sensíveis
  A03 Injection                 → ORM parametrizado (zero string SQL manual)
  A04 Insecure Design           → Threat modeling por módulo
  A05 Security Misconfiguration → IaC (Terraform) + hardening checklist
  A06 Vulnerable Components     → Dependabot + npm audit no CI
  A07 Auth Failures             → Rate limit em /auth/* + lockout após 5 falhas
  A08 Software Integrity        → Plugin signature + Dependabot + SBOM
  A09 Logging Failures          → Audit log imutável + OTel centralizado
  A10 SSRF                      → Connector allowlist de domínios no Sandbox
```

---

**Documento Oficial:** MDS-Platform  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 3 de 4 do MDS