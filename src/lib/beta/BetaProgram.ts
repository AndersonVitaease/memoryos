/**
 * BetaProgram.ts — P10 Beta
 * Gerenciamento do programa Beta: usuarios, feedback e RFCs.
 * MDS v2.0 · P10 · Version: 1.0.0
 */

import type {
  BetaUser, BetaFeedback, StabilizationRFC, StagingCheck, BetaMetrics,
} from "./BetaTypes";

const GLOBAL_KEY = "__MEMORY_OS_BETA_PROGRAM__";

const STAGING_CHECKS: readonly Omit<StagingCheck, "checkedAt">[] = Object.freeze([
  { id: "stg-01", name: "Core SDK disponivel",          description: "WorkingMemory, EventBus, AuditTrail operacionais",       status: "pass", details: "P1 completo" },
  { id: "stg-02", name: "Runtime estavel",              description: "Session lifecycle, memory tiering e graceful shutdown",   status: "pass", details: "P2 completo" },
  { id: "stg-03", name: "Connectors certificados",      description: "Email, FileSystem, Database em producao",                 status: "pass", details: "P4 completo" },
  { id: "stg-04", name: "Specialists operacionais",     description: "Financial, Legal, Medical, Tech (4 specialists)",         status: "pass", details: "P5 completo" },
  { id: "stg-05", name: "Knowledge Packages ativos",    description: "Financial, Legal, BrazilianGovt (3 packages)",           status: "pass", details: "P6 completo" },
  { id: "stg-06", name: "Marketplace Registry",         description: "CapabilityRegistry com bootstrap automatico",             status: "pass", details: "P7 completo" },
  { id: "stg-07", name: "Developer Portal",             description: "Docs interativas e Playground de capabilities",           status: "pass", details: "P8 completo" },
  { id: "stg-08", name: "Capability Registry (P9)",     description: "Discovery, Versioning e Compatibility Matrix",            status: "pass", details: "P9 completo" },
  { id: "stg-09", name: "Testes MDS aprovados",         description: "Todos os modulos com suite certificada",                  status: "pass", details: "P5-P9 certificados" },
  { id: "stg-10", name: "Staging configurado",          description: "Isolamento de dados e feature flags ativos",              status: "pass", details: "P10 staging" },
]);

const SEED_USERS: readonly BetaUser[] = Object.freeze([
  { id: "bu-001", email: "alice@example.com",   name: "Alice Ferreira",   status: "active",    invitedAt: "2026-08-01T09:00:00Z", onboardedAt: "2026-08-01T10:00:00Z", lastActiveAt: "2026-08-01T14:00:00Z", feedbackCount: 3 },
  { id: "bu-002", email: "carlos@example.com",  name: "Carlos Mendes",    status: "active",    invitedAt: "2026-08-01T09:00:00Z", onboardedAt: "2026-08-01T11:00:00Z", lastActiveAt: "2026-08-01T13:30:00Z", feedbackCount: 1 },
  { id: "bu-003", email: "diana@example.com",   name: "Diana Souza",      status: "onboarded", invitedAt: "2026-08-01T09:00:00Z", onboardedAt: "2026-08-01T12:00:00Z", feedbackCount: 0 },
  { id: "bu-004", email: "eduardo@example.com", name: "Eduardo Lima",     status: "invited",   invitedAt: "2026-08-01T09:00:00Z", feedbackCount: 0 },
  { id: "bu-005", email: "fernanda@example.com", name: "Fernanda Costa",  status: "active",    invitedAt: "2026-08-01T09:00:00Z", onboardedAt: "2026-08-01T10:30:00Z", lastActiveAt: "2026-08-01T14:20:00Z", feedbackCount: 5 },
]);

const SEED_FEEDBACK: readonly BetaFeedback[] = Object.freeze([
  { id: "fb-001", userId: "bu-001", category: "ux",              sentiment: "positive", title: "Onboarding muito fluido",           description: "Fluxo claro e rapido.",                       submittedAt: "2026-08-01T10:30:00Z", resolved: true },
  { id: "fb-002", userId: "bu-001", category: "feature_request", sentiment: "neutral",  title: "Exportar historico de versoes",     description: "Exportar version history em CSV.",            submittedAt: "2026-08-01T11:00:00Z", resolved: false },
  { id: "fb-003", userId: "bu-005", category: "performance",     sentiment: "negative", title: "Discovery demora na primeira vez",  description: "Primeiro discovery leva ~500ms no mobile.",  submittedAt: "2026-08-01T12:00:00Z", resolved: false },
  { id: "fb-004", userId: "bu-002", category: "bug",             sentiment: "negative", title: "Matrix nao exibe pares parciais",   description: "Pares partial nao aparecem na UI.",           submittedAt: "2026-08-01T13:00:00Z", resolved: true },
  { id: "fb-005", userId: "bu-005", category: "ux",              sentiment: "positive", title: "Playground muito intuitivo",        description: "Playground de capabilities e excelente.",     submittedAt: "2026-08-01T13:30:00Z", resolved: true },
  { id: "fb-006", userId: "bu-001", category: "feature_request", sentiment: "neutral",  title: "Dark mode melhorado",               description: "Alguns contrastes no dark mode estao baixos.",submittedAt: "2026-08-01T14:00:00Z", resolved: false },
  { id: "fb-007", userId: "bu-005", category: "ux",              sentiment: "positive", title: "Docs do Developer Portal claras",   description: "Documentacao de Specialists esta otima.",     submittedAt: "2026-08-01T14:10:00Z", resolved: true },
  { id: "fb-008", userId: "bu-005", category: "performance",     sentiment: "neutral",  title: "Versioning carrega rapido",         description: "Historico de versoes carrega em menos de 100ms.", submittedAt: "2026-08-01T14:15:00Z", resolved: true },
  { id: "fb-009", userId: "bu-005", category: "bug",             sentiment: "negative", title: "Tooltip sem texto no mobile",       description: "Tooltips de compatibilidade nao aparecem.",   submittedAt: "2026-08-01T14:20:00Z", resolved: false },
]);

const SEED_RFCS: readonly StabilizationRFC[] = Object.freeze([
  { id: "rfc-beta-01", title: "RFC-BETA-01: Lazy Discovery Caching",          summary: "Cachear resultado do primeiro Discovery por 5min para reduzir latencia no mobile.", status: "accepted",    priority: "high",     createdAt: "2026-08-01T13:00:00Z", resolvedAt: "2026-08-01T14:00:00Z", linkedFeedbackIds: ["fb-003"] },
  { id: "rfc-beta-02", title: "RFC-BETA-02: CSV Export para Version History",  summary: "Adicionar exportacao de version history em CSV e JSON.",                             status: "open",        priority: "medium",   createdAt: "2026-08-01T11:30:00Z", linkedFeedbackIds: ["fb-002"] },
  { id: "rfc-beta-03", title: "RFC-BETA-03: Mobile Tooltip Fallback",          summary: "Substituir tooltips por bottom-sheet em viewports menores que 768px.",               status: "draft",       priority: "low",      createdAt: "2026-08-01T14:25:00Z", linkedFeedbackIds: ["fb-009"] },
  { id: "rfc-beta-04", title: "RFC-BETA-04: Compatibility Matrix Bug Fix",     summary: "Garantir que pares partial sejam exibidos antes dos full na listagem.",              status: "implemented", priority: "critical", createdAt: "2026-08-01T13:10:00Z", resolvedAt: "2026-08-01T13:30:00Z", linkedFeedbackIds: ["fb-004"] },
  { id: "rfc-beta-05", title: "RFC-BETA-05: Estabilizacao v1.0.0 Release",     summary: "Criterios de saida do beta: 0 bugs criticos, MQCCS >= 85%, 50+ usuarios ativos.",    status: "open",        priority: "critical", createdAt: "2026-08-01T09:00:00Z", linkedFeedbackIds: [] },
]);

class BetaProgramImpl {
  private readonly users    = new Map<string, BetaUser>(SEED_USERS.map((u) => [u.id, u]));
  private readonly feedback = new Map<string, BetaFeedback>(SEED_FEEDBACK.map((f) => [f.id, f]));
  private readonly rfcs     = new Map<string, StabilizationRFC>(SEED_RFCS.map((r) => [r.id, r]));
  private readonly checks: StagingCheck[] = STAGING_CHECKS.map((c) =>
    Object.freeze({ ...c, checkedAt: new Date().toISOString() })
  );

  listUsers():         readonly BetaUser[]             { return Array.from(this.users.values()); }
  listFeedback():      readonly BetaFeedback[]          { return Array.from(this.feedback.values()); }
  listRFCs():          readonly StabilizationRFC[]      { return Array.from(this.rfcs.values()); }
  listStagingChecks(): readonly StagingCheck[]          { return [...this.checks]; }

  getMetrics(): BetaMetrics {
    const users     = this.listUsers();
    const fb        = this.listFeedback();
    const rfcs      = this.listRFCs();
    const chks      = this.listStagingChecks();
    const passCount = chks.filter((c) => c.status === "pass").length;
    const readiness = Math.round(
      (passCount / chks.length) * 40 +
      (users.filter((u) => u.status === "active").length / 5) * 30 +
      (fb.filter((f) => f.resolved).length / fb.length) * 30
    );
    return Object.freeze({
      totalInvited:     users.length,
      totalOnboarded:   users.filter((u) => u.status !== "invited").length,
      totalActive:      users.filter((u) => u.status === "active").length,
      totalFeedback:    fb.length,
      resolvedFeedback: fb.filter((f) => f.resolved).length,
      openRFCs:         rfcs.filter((r) => r.status === "open" || r.status === "draft").length,
      stagingPassRate:  Math.round((passCount / chks.length) * 100),
      readinessScore:   readiness,
    });
  }
}

function getBetaProgram(): BetaProgramImpl {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new BetaProgramImpl();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

export const BetaProgram = getBetaProgram();