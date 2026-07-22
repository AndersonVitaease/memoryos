/**
 * RuntimeCapabilityRegistry.ts — EF-42 Runtime Introspection Framework
 *
 * SRP: Registrar e consultar capacidades internas do Runtime.
 *
 * OCP: Novas capacidades sao adicionadas APENAS aqui — nenhum outro
 *      componente precisa ser modificado para adicionar suporte a uma
 *      nova pergunta de introspeccao.
 *
 * DOMINIO: "runtime"
 *   Representa exclusivamente o estado interno do sistema.
 *   Nao representa: codigo-fonte, arquivos, conectores, conhecimento.
 *   Representa: estado de execucao, contexto, memoria volatil.
 *
 * GARANTIAS:
 *   - Zero chamadas de rede
 *   - Zero LLM
 *   - Zero Connectors
 *   - Zero Planner
 *   - Zero GoalBridge
 *   - Leitura exclusiva de: RuntimeContextLayer, ExecutionIntentManager,
 *     ConversationStore, ExecutionResultSet
 */

// ── RuntimeCapability ─────────────────────────────────────────────────────────

export type RuntimeCapabilityId =
  | "runtime.context.get"
  | "runtime.context.dump"
  | "runtime.execution.get"
  | "runtime.goal.get"
  | "runtime.connector.get"
  | "runtime.capability.get"
  | "runtime.domain.get"
  | "runtime.artifact.get"
  | "runtime.resultset.get"
  | "runtime.resultset.items"
  | "runtime.intent.get"
  | "runtime.session.get"
  | "runtime.continuation.get"
  | "runtime.pipeline.get";

export interface RuntimeCapabilityDefinition {
  readonly id:          RuntimeCapabilityId;
  /** Human-readable description */
  readonly description: string;
  /** Signal keywords that trigger this capability (lower-case) */
  readonly signals:     readonly string[];
}

// ── Definitions ───────────────────────────────────────────────────────────────

const DEFINITIONS: RuntimeCapabilityDefinition[] = [
  {
    id:          "runtime.context.dump",
    description: "Dump the full RuntimeContext state",
    signals: [
      "mostre o runtimecontext", "mostrar runtimecontext", "show runtimecontext",
      "mostrar runtime context", "mostre o runtime context", "show runtime context",
      "dump runtimecontext", "dump runtime context",
      "estado do runtime", "estado do runtimecontext",
      "contexto do runtime", "contexto runtime",
    ],
  },
  {
    id:          "runtime.resultset.get",
    description: "Check if an ExecutionResultSet is active",
    signals: [
      "resultset ativo", "existe resultset", "existe um resultset",
      "resultset existe", "tem resultset", "há resultset", "ha resultset",
      "active resultset", "is there a resultset", "resultset disponivel",
      "mostre o resultset", "mostrar resultset", "show resultset",
      "executionresultset", "execution result set",
    ],
  },
  {
    id:          "runtime.resultset.items",
    description: "List items in the current ExecutionResultSet",
    signals: [
      "itens do resultset", "items do resultset", "quantos itens",
      "quantos itens no resultset", "lista do resultset", "listar resultset",
      "resultset items", "items in resultset", "list resultset",
      "item selecionado", "selected item", "qual item esta selecionado",
      "qual item selecionado",
    ],
  },
  {
    id:          "runtime.execution.get",
    description: "Get the current executionId",
    signals: [
      "executionid", "execution id", "execucao id", "id da execucao",
      "qual executionid", "qual o executionid", "executionid atual",
      "qual a execucao atual", "execucao atual",
    ],
  },
  {
    id:          "runtime.goal.get",
    description: "Get the active GoalType",
    signals: [
      "qual goal", "goal ativo", "goal atual", "goaltype", "goal type",
      "qual o goal", "qual goaltype", "qual o goaltype",
      "objetivo ativo", "qual objetivo", "active goal",
    ],
  },
  {
    id:          "runtime.connector.get",
    description: "Get the active Connector",
    signals: [
      "qual connector", "connector ativo", "connector atual",
      "qual o connector", "conector ativo", "conector atual",
      "qual conector", "qual o conector", "active connector",
    ],
  },
  {
    id:          "runtime.capability.get",
    description: "Get the active Capability",
    signals: [
      "qual capability", "capability ativa", "capability atual",
      "qual a capability", "qual o capability", "active capability",
      "capacidade ativa", "capacidade atual",
    ],
  },
  {
    id:          "runtime.domain.get",
    description: "Get the active domain",
    signals: [
      "qual dominio", "dominio ativo", "dominio atual",
      "qual o dominio", "qual domínio", "domínio ativo",
      "active domain", "current domain",
    ],
  },
  {
    id:          "runtime.artifact.get",
    description: "Get the current artifact (owner/repo/path/fileId)",
    signals: [
      "artifact atual", "artefato atual", "qual artifact",
      "current artifact", "qual artefato", "qual o artifact",
      "qual o artefato",
    ],
  },
  {
    id:          "runtime.intent.get",
    description: "Check if an ExecutionIntent is stored",
    signals: [
      "executionintent", "execution intent", "intent ativo", "intent atual",
      "existe executionintent", "existe intent", "tem intent",
      "qual intent", "mostrar intent", "mostre o intent",
      "show intent", "active intent",
    ],
  },
  {
    id:          "runtime.continuation.get",
    description: "Check if a continuation is pending",
    signals: [
      "continuacao pendente", "existe continuacao", "continuação pendente",
      "tem continuacao", "continuation pending", "is there a continuation",
      "continuation ativa", "continuation disponivel",
    ],
  },
  {
    id:          "runtime.session.get",
    description: "Get the active SessionId",
    signals: [
      "sessionid", "session id", "sessao id", "id da sessao",
      "qual sessionid", "sessao atual", "session atual",
    ],
  },
  {
    id:          "runtime.context.get",
    description: "Get a summary of the current runtime context",
    signals: [
      "contexto atual", "qual o contexto", "runtime status",
      "estado atual do runtime", "runtime state",
    ],
  },
];

// ── RuntimeCapabilityRegistry ─────────────────────────────────────────────────

class RuntimeCapabilityRegistryClass {
  private readonly _defs: Map<RuntimeCapabilityId, RuntimeCapabilityDefinition>;

  constructor() {
    this._defs = new Map(DEFINITIONS.map((d) => [d.id, d]));
  }

  /**
   * Detects if a message targets runtime introspection.
   * Returns the matching capability definition or null.
   * First-match-wins (DEFINITIONS order = priority).
   */
  detect(userMessage: string): RuntimeCapabilityDefinition | null {
    const lower = userMessage.toLowerCase();
    for (const def of DEFINITIONS) {
      if (def.signals.some((sig) => lower.includes(sig))) {
        return def;
      }
    }
    return null;
  }

  /** Returns a definition by id, or null. */
  get(id: RuntimeCapabilityId): RuntimeCapabilityDefinition | null {
    return this._defs.get(id) ?? null;
  }

  /** All registered definitions. */
  listAll(): readonly RuntimeCapabilityDefinition[] {
    return DEFINITIONS;
  }

  get size(): number {
    return this._defs.size;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__RUNTIME_CAPABILITY_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new RuntimeCapabilityRegistryClass();
}

export const runtimeCapabilityRegistry: RuntimeCapabilityRegistryClass = (
  globalThis as unknown as Record<string, RuntimeCapabilityRegistryClass>
)[_KEY];