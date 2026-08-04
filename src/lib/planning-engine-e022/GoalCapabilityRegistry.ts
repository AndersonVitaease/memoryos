/**
 * GoalCapabilityRegistry.ts — Engineering Sprint E-02.2A (aligned Sprint 8.8.3)
 * Goal → Capability mapping registry.
 *
 * Replaces GoalPlanTemplates entirely.
 *
 * SRP: registrar e consultar CapabilityMappings (GoalType → ExecutionStep[]).
 *
 * Open/Closed: novos Connectors registram suas proprias capabilities
 *              via GoalCapabilityRegistry.register() — o Planner nao muda.
 *
 * Dependency Inversion: o Planner depende deste Registry (abstrato),
 *                       nao de implementacoes concretas de Connectors.
 *
 * Planning Engine NAO conhece:
 *   - Runtime
 *   - OAuth / sessao
 *   - Retry / timeout
 *   - Summarize / noop
 *   - Nenhum Connector concreto
 *
 * Cada entrada mapeia um GoalType para uma lista de CapabilityDescriptors.
 * O Runtime e responsavel por envolver cada step com autenticacao,
 * retry, timeout, summarize, auditoria etc.
 *
 * Sprint 8.8.3 — ALIGNMENT:
 *   All connector IDs and capability names now exactly match the declarations
 *   in the official Runtime Connectors (connector-runtime/connectors/).
 *
 *   Gmail    → id="gmail"           caps: "readInbox", "searchEmails", "readMessage"
 *   Calendar → id="google-calendar" caps: "calendar.events.list", "calendar.events.get", "calendar.calendars.list"
 *   Drive    → id="google-drive"    caps: "drive.files.list", "drive.files.search", "drive.files.get"
 *
 *   Memory goals (memory.query, memory.summarize) are handled by the internal
 *   memory reasoning path (memoryReasoningPlanner.js) — NOT by the UCR.
 *   They produce empty plans so the Pipeline falls through to the LLM/memory path.
 */

import type { GoalType }    from "@/lib/goals/GoalTypes";
import type { ConnectorId } from "./ExecutionPlanTypes";

// ── CapabilityDescriptor ───────────────────────────────────────────────────────

export interface CapabilityDescriptor {
  /** Target connector id — must exactly match IConnector.id in the Runtime */
  readonly connector:  ConnectorId;
  /** Capability name — must exactly match metadata().capabilities[] entry */
  readonly capability: string;
  /** Static default parameters — merged with goal parameters at plan time */
  readonly params:     Record<string, unknown>;
}

// ── CapabilityMapping ──────────────────────────────────────────────────────────

export interface CapabilityMapping {
  readonly goalType:    GoalType;
  readonly descriptors: readonly CapabilityDescriptor[];
}

// ── GoalCapabilityRegistry ────────────────────────────────────────────────────

class GoalCapabilityRegistryClass {
  private readonly _mappings = new Map<GoalType, CapabilityMapping>();

  /**
   * Registers a GoalType → CapabilityDescriptor[] mapping.
   * Idempotent: subsequent calls for the same goalType are ignored.
   * Connectors call this during their initialization phase.
   */
  register(mapping: CapabilityMapping): void {
    if (this._mappings.has(mapping.goalType)) return; // idempotent
    this._mappings.set(mapping.goalType, mapping);
  }

  /**
   * Returns the capability descriptors for a given GoalType, or null.
   */
  resolve(goalType: GoalType): readonly CapabilityDescriptor[] | null {
    return this._mappings.get(goalType)?.descriptors ?? null;
  }

  /** Total number of registered mappings. */
  get size(): number { return this._mappings.size; }

  /** All registered mappings (immutable copy). */
  listAll(): readonly CapabilityMapping[] {
    return [...this._mappings.values()];
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__GOAL_CAP_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new GoalCapabilityRegistryClass();
}

export const GoalCapabilityRegistry: GoalCapabilityRegistryClass = (
  globalThis as unknown as Record<string, GoalCapabilityRegistryClass>
)[_KEY];

// ── Built-in capability mappings (registered at module load) ──────────────────
// Each entry maps a GoalType to pure connector capability descriptors.
// NO validate_session, NO summarize, NO noop — those belong to the Runtime.
//
// ALIGNMENT (Sprint 8.8.3):
//   connector IDs and capability names verified against Runtime Connector source:
//     GmailConnector.ts:33         → id = "gmail"
//     GmailConnector.ts:23-30      → capabilities = ["readInbox","searchEmails",...]
//     GoogleCalendarConnector.ts:115 → id = "google-calendar"
//     GoogleCalendarConnector.ts:132 → capabilities = ["calendar.events.list",...]
//     GoogleDriveConnector.ts:118  → id = "google-drive"
//     GoogleDriveConnector.ts:134  → capabilities = ["drive.files.list",...]

const _builtins: CapabilityMapping[] = [

  // ── Gmail ──────────────────────────────────────────────────────────────────
  // connector id: "gmail"  (GmailConnector.ts:33)
  {
    goalType: "gmail.readInbox",
    descriptors: [
      { connector: "gmail", capability: "readInbox", params: {} },
    ],
  },
  {
    goalType: "gmail.searchMessages",
    descriptors: [
      // GmailConnector.ts:26 declares "searchEmails" — that is the capability name
      { connector: "gmail", capability: "searchEmails", params: {} },
    ],
  },
  {
    goalType: "gmail.readMessage",
    descriptors: [
      { connector: "gmail", capability: "readMessage", params: {} },
    ],
  },
  {
    goalType: "gmail.readEmail",
    descriptors: [
      { connector: "gmail", capability: "readEmail", params: {} },
    ],
  },
  {
    goalType: "gmail.getThread" as GoalType,
    descriptors: [
      { connector: "gmail", capability: "getThread", params: {} },
    ],
  },
  {
    goalType: "gmail.getAttachment" as GoalType,
    descriptors: [
      { connector: "gmail", capability: "getAttachment", params: {} },
    ],
  },
  {
    goalType: "gmail.listLabels" as GoalType,
    descriptors: [
      { connector: "gmail", capability: "listLabels", params: {} },
    ],
  },
  {
    goalType: "gmail.createDraft" as GoalType,
    descriptors: [
      { connector: "gmail", capability: "createDraft", params: {} },
    ],
  },
  {
    goalType: "gmail.sendEmail" as GoalType,
    descriptors: [
      { connector: "gmail", capability: "sendEmail", params: {} },
    ],
  },

  // ── Microsoft 365 / Outlook (2026-08-04, preenche gap achado em producao —
  // conector existia e estava conectado, mas sem mapeamento de goal nenhum,
  // entao o Planner nunca conseguia rotear pra ele) ───────────────────────────
  // connector id: "microsoft365"  (MicrosoftGraphConnector.ts)
  {
    goalType: "microsoft365.readInbox" as GoalType,
    descriptors: [
      { connector: "microsoft365", capability: "mail.list", params: {} },
    ],
  },
  {
    goalType: "microsoft365.searchMessages" as GoalType,
    descriptors: [
      { connector: "microsoft365", capability: "mail.search", params: {} },
    ],
  },
  {
    goalType: "microsoft365.readMessage" as GoalType,
    descriptors: [
      { connector: "microsoft365", capability: "mail.read", params: {} },
    ],
  },
  {
    goalType: "microsoft365.sendEmail" as GoalType,
    descriptors: [
      { connector: "microsoft365", capability: "mail.send", params: {} },
    ],
  },
  {
    goalType: "microsoft365.listEvents" as GoalType,
    descriptors: [
      { connector: "microsoft365", capability: "calendar.list", params: {} },
    ],
  },
  {
    goalType: "microsoft365.createEvent" as GoalType,
    descriptors: [
      { connector: "microsoft365", capability: "calendar.create", params: {} },
    ],
  },
  {
    goalType: "microsoft365.listFiles" as GoalType,
    descriptors: [
      { connector: "microsoft365", capability: "files.list", params: {} },
    ],
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  // connector id: "google-calendar"  (GoogleCalendarConnector.ts:115)
  // capabilities: "calendar.events.list", "calendar.events.get",
  //               "calendar.calendars.list", "connectivity.ping", "health.full"
  {
    goalType: "calendar.listToday",
    descriptors: [
      {
        connector: "google-calendar",
        capability: "calendar.events.list",
        // today's date range injected at plan time via goal.parameters;
        // Runtime connector defaults to "primary" calendar when calendarId absent
        params: {},
      },
    ],
  },
  {
    goalType: "calendar.listTomorrow",
    descriptors: [
      { connector: "google-calendar", capability: "calendar.events.list", params: {} },
    ],
  },
  {
    goalType: "calendar.listWeek",
    descriptors: [
      { connector: "google-calendar", capability: "calendar.events.list", params: {} },
    ],
  },
  {
    goalType: "calendar.createEvent",
    descriptors: [
      // No write capability exists in GoogleCalendarConnector — connector is read-only.
      // Mapping to calendar.events.list so the plan is routable; synthesis will
      // explain that event creation is not yet supported.
      { connector: "google-calendar", capability: "calendar.events.list", params: {} },
    ],
  },
  {
    goalType: "calendar.listCalendars",
    descriptors: [
      { connector: "google-calendar", capability: "calendar.calendars.list", params: {} },
    ],
  },

  // ── OpenRouter ─────────────────────────────────────────────────────────────
  {
    goalType: "openrouter.chatCompletion" as GoalType,
    descriptors: [
      { connector: "openrouter", capability: "openrouter.chatCompletion", params: {} },
    ],
  },
  {
    goalType: "openrouter.listModels" as GoalType,
    descriptors: [
      { connector: "openrouter", capability: "openrouter.listModels", params: {} },
    ],
  },

  // ── Memori ─────────────────────────────────────────────────────────────────
  {
    goalType: "memori.remember" as GoalType,
    descriptors: [
      { connector: "memori", capability: "memori.remember", params: {} },
    ],
  },
  {
    goalType: "memori.recall" as GoalType,
    descriptors: [
      { connector: "memori", capability: "memori.recall", params: {} },
    ],
  },

  // ── Drive ──────────────────────────────────────────────────────────────────
  // connector id: "google-drive"  (GoogleDriveConnector.ts:118)
  // capabilities: "drive.files.list", "drive.files.get", "drive.files.search",
  //               "drive.about.get", "drive.createFolder", "drive.uploadFile", "drive.moveFile",
  //               "drive.deleteFile", "drive.renameFile", "drive.copyFile", "drive.summarizeDocument", "drive.extractSections", "connectivity.ping", "health.full"
  //
  // Sprint C-01: default params added so every Drive goal produces a valid
  // payload even when the user intent carries no explicit parameters.
  //   drive.files.search requires "q" — default: "trashed=false" (list all non-trashed)
  //   drive.files.list   defaults: pageSize=10, orderBy=modifiedTime desc
  //   drive.files.get    requires "fileId" — no static default possible; goal.parameters must carry it
  {
    goalType: "drive.createFolder" as GoalType,
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.createFolder",
        params: {},
      },
    ],
  },
  {
    goalType: "drive.uploadFile" as GoalType,
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.uploadFile",
        params: {},
      },
    ],
  },
  {
    goalType: "drive.moveFile" as GoalType,
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.moveFile",
        params: {},
      },
    ],
  },
  {
    goalType: "drive.deleteFile" as GoalType,
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.deleteFile",
        params: {},
      },
    ],
  },
  {
    goalType: "drive.renameFile" as GoalType,
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.renameFile",
        params: {},
      },
    ],
  },
  {
    goalType: "drive.copyFile" as GoalType,
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.copyFile",
        params: {},
      },
    ],
  },
  {
    goalType: "drive.summarizeDocument" as GoalType,
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.summarizeDocument",
        params: {},
      },
    ],
  },
  {
    goalType: "drive.extractSections" as GoalType,
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.extractSections",
        params: {},
      },
    ],
  },
  {
    goalType: "drive.searchFiles",
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.files.search",
        params: { q: "trashed=false", pageSize: 10, orderBy: "modifiedTime desc" },
      },
    ],
  },
  // drive.listPDFs — "Liste apenas PDFs", "Liste PDFs", "Tenho CNH em PDF?"
  {
    goalType: "drive.listPDFs" as GoalType,
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.files.listByMime",
        params: { mimeType: "application/pdf", pageSize: 20 },
      },
    ],
  },
  {
    goalType: "drive.listRecent",
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.files.list",
        params: { pageSize: 50, orderBy: "modifiedTime desc" },
      },
    ],
  },
  // drive.downloadFile — routes to the high-level drive.downloadFile capability.
  // GoogleDriveConnector.execute("drive.downloadFile") delegates entirely to
  // DriveDownloadExecutor, which owns all fileId resolution logic:
  //   1. Use explicit fileId when present in goal.parameters
  //   2. Use lastFileId (from previous search results in conversation context)
  //   3. Search by fileName / query as last resort
  // drive.files.get (low-level) must NEVER be called directly for download goals.
  {
    goalType: "drive.downloadFile",
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.downloadFile",
        params: {},
      },
    ],
  },
  {
    goalType: "drive.openDocument",
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.downloadFile",
        params: {},
      },
    ],
  },

  // ── GitHub — Sprint M-02 ─────────────────────────────────────────────────
  // Connector id: "github"  (GitHubConnector.ts:161 → readonly id = "github")
  // Capabilities verified against GitHubConnector.metadata().capabilities[]
  // (GitHubConnector.ts:184-205). Zero new capabilities created.
  {
    goalType: "github.listRepos",
    descriptors: [
      { connector: "github", capability: "repos.list", params: { per_page: 10 } },
    ],
  },
  {
    goalType: "github.listBranches",
    descriptors: [
      { connector: "github", capability: "branches.list", params: {} },
    ],
  },
  {
    goalType: "github.listCommits",
    descriptors: [
      { connector: "github", capability: "commits.list", params: { per_page: 20 } },
    ],
  },
  {
    goalType: "github.listFiles",
    descriptors: [
      { connector: "github", capability: "files.list", params: {} },
    ],
  },
  {
    goalType: "github.getFile",
    descriptors: [
      { connector: "github", capability: "files.get", params: {} },
    ],
  },
  {
    goalType: "github.searchCode",
    descriptors: [
      { connector: "github", capability: "search.symbol", params: {} },
    ],
  },
  {
    goalType: "github.listPullRequests",
    descriptors: [
      { connector: "github", capability: "pullRequests.list", params: { state: "open" } },
    ],
  },
  {
    goalType: "github.listIssues",
    descriptors: [
      { connector: "github", capability: "issues.list", params: { state: "open" } },
    ],
  },
  {
    goalType: "github.commitTimeline",
    descriptors: [
      { connector: "github", capability: "commit.timeline", params: { per_page: 30 } },
    ],
  },
  {
    goalType: "github.repoStatistics",
    descriptors: [
      { connector: "github", capability: "repository.statistics", params: {} },
    ],
  },

  // ── Memory ─────────────────────────────────────────────────────────────────
  // Validated in Sprint 8.8.2.a: Memory is an INTERNAL service, not a UCR connector.
  // There is no MemoryConnector in ConnectorBootstrap.
  // Memory goals produce EMPTY plans so ConversationPipeline falls through to
  // the memoryReasoningPlanner.js (LLM/DB path) which handles them natively.
  {
    goalType: "memory.query",
    descriptors: [],
  },
  {
    goalType: "memory.summarize",
    descriptors: [],
  },

  // ── Microsoft Graph (Contacts + To Do) — Fase 2 (MS-EXP-02) RFC-006/ADR-013
  // Connector id: "microsoft-graph"  (MicrosoftGraphConnector.ts)
  // Capabilities via Capability Executors: contacts.* , todo.*
  {
    goalType: "ms.contacts.list" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "contacts.list", params: {} },
    ],
  },
  {
    goalType: "ms.contacts.search" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "contacts.search", params: {} },
    ],
  },
  {
    goalType: "ms.contacts.create" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "contacts.create", params: {} },
    ],
  },
  {
    goalType: "ms.todo.listLists" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "todo.listLists", params: {} },
    ],
  },
  {
    goalType: "ms.todo.listTasks" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "todo.listTasks", params: {} },
    ],
  },
  {
    goalType: "ms.todo.createTask" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "todo.createTask", params: {} },
    ],
  },
  {
    goalType: "ms.todo.completeTask" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "todo.completeTask", params: {} },
    ],
  },

  // ── Microsoft Graph (OneNote + Teams + SharePoint) — Fase 3 (MS-EXP-03) RFC-006/ADR-013
  // Connector id: "microsoft-graph"  (MicrosoftGraphConnector.ts)
  // CAVEAT: Teams/SharePoint exigem tenant corporativo (contas pessoais podem 403).
  {
    goalType: "ms.onenote.listNotebooks" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "onenote.listNotebooks", params: {} },
    ],
  },
  {
    goalType: "ms.onenote.listPages" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "onenote.listPages", params: {} },
    ],
  },
  {
    goalType: "ms.onenote.createPage" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "onenote.createPage", params: {} },
    ],
  },
  {
    goalType: "ms.teams.listChats" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "teams.listChats", params: {} },
    ],
  },
  {
    goalType: "ms.teams.listMessages" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "teams.listMessages", params: {} },
    ],
  },
  {
    goalType: "ms.teams.sendMessage" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "teams.sendMessage", params: {} },
    ],
  },
  {
    goalType: "ms.sharepoint.listSites" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "sharepoint.listSites", params: {} },
    ],
  },
  {
    goalType: "ms.sharepoint.listLists" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "sharepoint.listLists", params: {} },
    ],
  },
  {
    goalType: "ms.sharepoint.listItems" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "sharepoint.listItems", params: {} },
    ],
  },
  {
    goalType: "ms.sharepoint.createItem" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "sharepoint.createItem", params: {} },
    ],
  },

  // ── Microsoft Graph (Excel + Word + PowerPoint) — Fase 4 (MS-EXP-04) RFC-006/ADR-013
  // Connector id: "microsoft-graph"  (MicrosoftGraphConnector.ts)
  // Excel = Workbook API real (read/write ranges). Word = texto via documentParser.
  // PowerPoint = metadata/download (Graph REST nao expoe texto de slides).
  {
    goalType: "ms.excel.listWorksheets" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "excel.listWorksheets", params: {} },
    ],
  },
  {
    goalType: "ms.excel.getRange" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "excel.getRange", params: {} },
    ],
  },
  {
    goalType: "ms.excel.updateRange" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "excel.updateRange", params: {} },
    ],
  },
  {
    goalType: "ms.word.listDocuments" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "word.listDocuments", params: {} },
    ],
  },
  {
    goalType: "ms.word.getDocumentText" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "word.getDocumentText", params: {} },
    ],
  },
  {
    goalType: "ms.pptx.listDocuments" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "pptx.listDocuments", params: {} },
    ],
  },
  {
    goalType: "ms.pptx.getDocumentDownload" as GoalType,
    descriptors: [
      { connector: "microsoft-graph", capability: "pptx.getDocumentDownload", params: {} },
    ],
  },

  // ── WhatsApp — Meta Cloud API oficial (Evolution/Baileys como stubs futuros)
  // Connector id: "whatsapp"  (WhatsAppConnector.ts)
  // Capabilities: "whatsapp.sendMessage", "whatsapp.sendTemplate", "whatsapp.getMessageStatus"
  {
    goalType: "whatsapp.sendMessage" as GoalType,
    descriptors: [
      { connector: "whatsapp", capability: "whatsapp.sendMessage", params: {} },
    ],
  },
  {
    goalType: "whatsapp.sendTemplate" as GoalType,
    descriptors: [
      { connector: "whatsapp", capability: "whatsapp.sendTemplate", params: {} },
    ],
  },
  {
    goalType: "whatsapp.getMessageStatus" as GoalType,
    descriptors: [
      { connector: "whatsapp", capability: "whatsapp.getMessageStatus", params: {} },
    ],
  },

  // ── Base44 (Entity Writes) — B44-EXP-01 (RFC-009/ADR-016)
  // Connector id: "base44"  (Base44Connector.ts)
  // Capabilities: entities.create/update/delete/filter/bulkCreate/bulkUpdate
  // Reversibility: create/update/bulk* = reversible, delete = irreversible (Safety Gate freia),
  //                filter = safe.
  // User records NAO podem ser criados (platform limit — create retorna 405).
  {
    goalType: "base44.entities.create" as GoalType,
    descriptors: [
      { connector: "base44", capability: "entities.create", params: {} },
    ],
  },
  {
    goalType: "base44.entities.update" as GoalType,
    descriptors: [
      { connector: "base44", capability: "entities.update", params: {} },
    ],
  },
  {
    goalType: "base44.entities.delete" as GoalType,
    descriptors: [
      { connector: "base44", capability: "entities.delete", params: {} },
    ],
  },
  {
    goalType: "base44.entities.filter" as GoalType,
    descriptors: [
      { connector: "base44", capability: "entities.filter", params: {} },
    ],
  },
  {
    goalType: "base44.entities.bulkCreate" as GoalType,
    descriptors: [
      { connector: "base44", capability: "entities.bulkCreate", params: {} },
    ],
  },
  {
    goalType: "base44.entities.bulkUpdate" as GoalType,
    descriptors: [
      { connector: "base44", capability: "entities.bulkUpdate", params: {} },
    ],
  },

  // ── Base44 (Core Integrations) — B44-EXP-02 (RFC-009/ADR-016)
  // Connector id: "base44"  (Base44Connector.ts)
  // Capabilities: ai.invokeLLM, ai.generateImage, ai.generateSpeech,
  //               files.upload, files.extractData, email.send
  // Reversibility: LLM/Image/Speech/Extract = safe; upload = reversible; email = irreversible.
  {
    goalType: "base44.ai.invokeLLM" as GoalType,
    descriptors: [
      { connector: "base44", capability: "ai.invokeLLM", params: {} },
    ],
  },
  {
    goalType: "base44.ai.generateImage" as GoalType,
    descriptors: [
      { connector: "base44", capability: "ai.generateImage", params: {} },
    ],
  },
  {
    goalType: "base44.ai.generateSpeech" as GoalType,
    descriptors: [
      { connector: "base44", capability: "ai.generateSpeech", params: {} },
    ],
  },
  {
    goalType: "base44.files.upload" as GoalType,
    descriptors: [
      { connector: "base44", capability: "files.upload", params: {} },
    ],
  },
  {
    goalType: "base44.files.extractData" as GoalType,
    descriptors: [
      { connector: "base44", capability: "files.extractData", params: {} },
    ],
  },
  {
    goalType: "base44.email.send" as GoalType,
    descriptors: [
      { connector: "base44", capability: "email.send", params: {} },
    ],
  },

  // ── Base44 (User Management) — B44-EXP-03 (RFC-009/ADR-016)
  // Connector id: "base44"  (Base44Connector.ts)
  // Capabilities: users.invite, users.list, auth.updateMe, auth.logout
  // Reversibility: invite/updateMe/logout = reversible; list = safe.
  {
    goalType: "base44.users.invite" as GoalType,
    descriptors: [
      { connector: "base44", capability: "users.invite", params: { role: "user" } },
    ],
  },
  {
    goalType: "base44.users.list" as GoalType,
    descriptors: [
      { connector: "base44", capability: "users.list", params: {} },
    ],
  },
  {
    goalType: "base44.auth.updateMe" as GoalType,
    descriptors: [
      { connector: "base44", capability: "auth.updateMe", params: {} },
    ],
  },
  {
    goalType: "base44.auth.logout" as GoalType,
    descriptors: [
      { connector: "base44", capability: "auth.logout", params: {} },
    ],
  },

  // ── General / Unknown — no capability steps; Runtime handles gracefully ───
  {
    goalType: "general.conversation",
    descriptors: [],
  },
  {
    goalType: "unknown",
    descriptors: [],
  },
];

_builtins.forEach((m) => GoalCapabilityRegistry.register(m));