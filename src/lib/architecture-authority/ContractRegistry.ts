/**
 * ContractRegistry.ts — Sprint 6.2.3
 * Registers and stores all public contracts for the MemoryOS Core APIs.
 */

import type { PublicContract, CompatibilityStatus } from "./AATypes";

let _seq = 0;
function makeId(): string { return `contract_${Date.now()}_${++_seq}`; }

// ── Built-in baseline contracts ───────────────────────────────────────────────

const BASELINE_CONTRACTS: Omit<PublicContract, "id" | "lockedAt">[] = [
  {
    name: "KnowledgeGraphStore API",
    version: "1.0.0",
    signature: "get|query|isReady|listAllEntities|queryByKeyword|snapshotFields|diagnostics",
    methods: ["get", "query", "isReady", "listAllEntities", "queryByKeyword", "snapshotFields", "diagnostics"],
    exports: ["KnowledgeGraphStore"],
    dependencies: [],
    compatibility: "COMPATIBLE",
  },
  {
    name: "ConversationGateway API",
    version: "1.0.0",
    signature: "process|classify|route|respond",
    methods: ["process", "classify", "route", "respond"],
    exports: ["ConversationCognitiveGateway"],
    dependencies: ["LiveCognitivePipeline", "ConnectorInvocationService"],
    compatibility: "COMPATIBLE",
  },
  {
    name: "Connector API",
    version: "1.0.0",
    signature: "invoke|list|probe|getConnection",
    methods: ["invoke", "list", "probe", "getConnection"],
    exports: ["ConnectorInvocationService", "GitHubConnector", "Base44Connector"],
    dependencies: [],
    compatibility: "COMPATIBLE",
  },
  {
    name: "Workflow API",
    version: "1.0.0",
    signature: "initiate|approve|reject|inspect|generatePlan|generateReport",
    methods: ["initiate", "approve", "reject", "inspect", "generatePlan", "generateReport"],
    exports: ["EngineeringWorkflow"],
    dependencies: ["KnowledgeGraphStore", "ConnectorInvocationService"],
    compatibility: "COMPATIBLE",
  },
  {
    name: "Governance API",
    version: "1.0.0",
    signature: "submit|approve|reject|audit|rollbacks|cpe|perm|policies",
    methods: ["submit", "approve", "reject"],
    exports: ["EngineeringGovernance"],
    dependencies: ["EngineeringWorkflow", "EngineeringIntelligence"],
    compatibility: "COMPATIBLE",
  },
  {
    name: "Engineering API",
    version: "1.0.0",
    signature: "run|approve|reject|timeline",
    methods: ["run", "approve", "reject", "timeline"],
    exports: ["EngineeringIntelligence"],
    dependencies: ["KnowledgeGraphStore", "ConnectorInvocationService"],
    compatibility: "COMPATIBLE",
  },
  {
    name: "Pipeline API",
    version: "1.0.0",
    signature: "process|run|addStage|removeStage",
    methods: ["process", "run"],
    exports: ["LiveCognitivePipeline"],
    dependencies: ["ConnectorInvocationService"],
    compatibility: "COMPATIBLE",
  },
  {
    name: "RepositoryKnowledgeBuilder API",
    version: "1.0.0",
    signature: "build|query|getGraph|isReady|incrementalUpdate",
    methods: ["build", "query", "getGraph", "isReady", "incrementalUpdate"],
    exports: ["RepositoryKnowledgeBuilder"],
    dependencies: ["ConnectorInvocationService", "SourceCodeParser"],
    compatibility: "COMPATIBLE",
  },
];

export class ContractRegistry {
  private readonly _contracts = new Map<string, PublicContract>();

  constructor() {
    // Bootstrap with baseline contracts
    for (const c of BASELINE_CONTRACTS) {
      this._register(c);
    }
  }

  private _register(c: Omit<PublicContract, "id" | "lockedAt">): PublicContract {
    const full: PublicContract = { ...c, id: makeId(), lockedAt: Date.now() };
    this._contracts.set(full.name, full);
    return full;
  }

  register(c: Omit<PublicContract, "id" | "lockedAt">): PublicContract {
    if (this._contracts.has(c.name)) {
      // Return existing — cannot overwrite locked contracts
      return this._contracts.get(c.name)!;
    }
    return this._register(c);
  }

  get(name: string): PublicContract | null {
    return this._contracts.get(name) ?? null;
  }

  all(): PublicContract[] {
    return [...this._contracts.values()];
  }

  findByExport(exportName: string): PublicContract[] {
    return [...this._contracts.values()].filter(c => c.exports.includes(exportName));
  }
}