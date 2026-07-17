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

  // ── Drive ──────────────────────────────────────────────────────────────────
  // connector id: "google-drive"  (GoogleDriveConnector.ts:118)
  // capabilities: "drive.files.list", "drive.files.get", "drive.files.search",
  //               "drive.about.get", "connectivity.ping", "health.full"
  //
  // Sprint C-01: default params added so every Drive goal produces a valid
  // payload even when the user intent carries no explicit parameters.
  //   drive.files.search requires "q" — default: "trashed=false" (list all non-trashed)
  //   drive.files.list   defaults: pageSize=10, orderBy=modifiedTime desc
  //   drive.files.get    requires "fileId" — no static default possible; goal.parameters must carry it
  {
    goalType: "drive.searchFiles",
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.files.search",
        // Sprint C-01: "q" default prevents [validation] query string 'q' is required.
        // If goal.parameters carries a more specific "q", it overrides this default
        // (Planner merges: { ...desc.params, ...goal.parameters }).
        params: { q: "trashed=false", pageSize: 10, orderBy: "modifiedTime desc" },
      },
    ],
  },
  {
    goalType: "drive.listRecent",
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.files.list",
        params: { pageSize: 10, orderBy: "modifiedTime desc" },
      },
    ],
  },
  {
    goalType: "drive.openDocument",
    descriptors: [
      {
        connector: "google-drive",
        capability: "drive.files.get",
        // fileId must come from goal.parameters; no static default possible.
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