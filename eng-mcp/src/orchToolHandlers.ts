/**
 * ORCH-TOOLS-01: registro de handlers in-processo para intents `tool_call` do orquestrador.
 *
 * O daemon (orchestrateConsumeDaemon) e o consume do tools.ts injetam ESTE handler
 * no `runOrchestrateConsume` (dep `toolCallHandler`) para executar de forma
 * determinística e in-processo (sem spawn de worker) as tools tier-1
 * (leitura/determinísticas) e tier-2 (escritas governadas; a verificação do artefato
 * preauth é feita ANTES, no consume — aqui apenas executamos a tool).
 *
 * Zero-LLM. Nenhuma tool fora da matriz de tiers chega aqui (o consume classifica;
 * desconhecidas = tier 0 = blocked fail-closed). Falha = retorno tipado
 * {ok:false, error}, nunca exceção sem captura.
 */
import { RepositoryPolicy } from "./policy.ts";
import { RepositoryAdapter } from "./repository.ts";
import { getRoster } from "./sessionRoster.ts";
import { ObservabilityClient } from "./observability.ts";

/** Assinatura do handler de tool_call injetável no consume/daemon. */
export type ToolCallHandler = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<{ ok: boolean; result?: unknown; error?: string }>;

/** Raiz autorizada do repositório (mesma do servidor de produção; override por env). */
const ORCH_TOOL_ROOT = process.env.ENG_MCP_ROOT || "/opt/memoryos/eng-mcp";
/** Subject nominal usado para o heavy-operation gate do repositório. */
const ORCH_TOOL_SUBJECT = "orchestrator-tool-call";

/** Adapter criado lazy (uma única instância por processo). */
let adapterPromise: Promise<RepositoryAdapter> | null = null;
function getAdapter(): Promise<RepositoryAdapter> {
  if (!adapterPromise) {
    adapterPromise = RepositoryPolicy.create(ORCH_TOOL_ROOT).then(
      (policy) => new RepositoryAdapter(policy),
    );
  }
  return adapterPromise;
}

let observability: ObservabilityClient | null = null;
function getObservability(): ObservabilityClient {
  if (!observability) observability = new ObservabilityClient();
  return observability;
}

/** Catálogo opcional: injetado quando disponível (tools.ts fornece o provider real). */
export type CatalogProvider = () => unknown;

/**
 * Cria o handler in-processo. `catalogProvider` (opcional) alimenta
 * engineering.mcp.catalog; sem provider, a chamada de catálogo falha tipada
 * (nunca fabrica catálogo).
 */
export function createToolCallHandler(
  catalogProvider?: CatalogProvider,
): ToolCallHandler {
  return async (tool, args) => {
    try {
      const a = (args && typeof args === "object" && !Array.isArray(args)
        ? args
        : {}) as Record<string, unknown>;
      const repoOpt = (a.repository as "eng-mcp" | "memoryos" | undefined) ?? undefined;

      switch (tool) {
        // ---- Tier 1: leitura/determinísticas (in-processo) ----
        case "engineering.repo.structure": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.structure(a as never) };
        }
        case "engineering.file.read": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.fileRead(a as never, repoOpt) };
        }
        case "engineering.code.search": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.search(ORCH_TOOL_SUBJECT, a as never, repoOpt) };
        }
        case "engineering.code.references": {
          const repo = await getAdapter();
          const symbol = typeof a.symbol === "string" ? a.symbol : "";
          const maxResults = typeof a.maxResults === "number" ? a.maxResults : 100;
          return { ok: true, result: await repo.references(ORCH_TOOL_SUBJECT, symbol, maxResults) };
        }
        case "engineering.git.status": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitStatus(repoOpt) };
        }
        case "engineering.git.diff": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitDiff(a as never, repoOpt) };
        }
        case "engineering.git.log": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitLog(a as never) };
        }
        case "engineering.git.branches": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitBranches(a as never) };
        }
        case "engineering.git.worktrees": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitWorktrees() };
        }
        case "engineering.git.inspect_commit": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitInspectCommit(a as never) };
        }
        case "engineering.git.inspect_changes": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitInspectChanges(a as never) };
        }
        case "engineering.test.run": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.testRun(ORCH_TOOL_SUBJECT, a as never) };
        }
        case "engineering.typecheck.run": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.typeCheckRun(ORCH_TOOL_SUBJECT, a as never) };
        }
        case "engineering.lint.run": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.lint(ORCH_TOOL_SUBJECT) };
        }
        case "engineering.session.roster": {
          return { ok: true, result: getRoster() };
        }
        case "engineering.mcp.catalog": {
          if (!catalogProvider) return { ok: false, error: "ORCH_TOOL_CATALOG_PROVIDER_REQUIRED" };
          return { ok: true, result: catalogProvider() };
        }
        // ---- Tier 2: escritas governadas (pré-filtradas pelo consume com preauth) ----
        case "engineering.git.stage": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitStage(a as never) };
        }
        case "engineering.git.commit": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitCommit(a as never) };
        }
        case "engineering.git.push": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.gitPush(a as never, ORCH_TOOL_SUBJECT) };
        }
        case "engineering.file.create": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.create(a as never) };
        }
        case "engineering.file.patch": {
          const repo = await getAdapter();
          return { ok: true, result: await repo.patch(a as never) };
        }
        default: {
          // engineering.runtime.* (somente leitura) via observability bridge.
          if (tool.startsWith("engineering.runtime.")) {
            const op = tool.replace("engineering.runtime.", "") as never;
            const result = await getObservability().query(op, a as never);
            return { ok: true, result };
          }
          return { ok: false, error: `ORCH_TOOL_NOT_IN_HANDLER_REGISTRY: ${tool}` };
        }
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
