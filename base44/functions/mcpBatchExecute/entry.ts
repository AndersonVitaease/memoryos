/**
 * mcpBatchExecute — MemoryOS batch MCP executor
 *
 * Narrow backend bridge for external agents (e.g. Kilo) that need to submit
 * independent MCP tool calls as one batch. It intentionally does NOT replace
 * the central ExecutionOrchestrator: this path only needs independent
 * operations, per-tool concurrency limits, error isolation, and one MCP
 * session per batch.
 *
 * Security:
 *   - Requires MCP_BATCH_EXECUTE_SECRET via x-batch-token.
 *   - Reads the target MCPServerConfig using service role.
 *   - Rejects disabled/unknown servers.
 *   - Validates requested tools against discovered_tools when available.
 *   - Writes require allowWrites=true and the catalog must mark the tool write.
 *
 * Concurrency:
 *   - Uses MCPServerConfig.tool_policy[toolName].maxConcurrent when present.
 *   - Falls back to DEFAULT_MAX_CONCURRENT per tool.
 *   - Uses Promise.allSettled so one failed operation does not cancel others.
 *   - Reuses one MCP session for the complete batch.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { secrets } from 'base44:runtime';
import {
  connect,
  resolveHeaders,
  truncateError,
  tryRecoverResultFromError,
  readToolCatalog,
  type MCPServerConfigRecord,
} from '../../shared/mcpClient.ts';

const MAX_BATCH_SIZE = 50;
const DEFAULT_MAX_CONCURRENT = 8;
const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;
const MAX_OPERATION_TIMEOUT_MS = 120_000;
const DEFAULT_OVERALL_TIMEOUT_MS = 120_000;
const MAX_OVERALL_TIMEOUT_MS = 300_000;

interface BatchOperation {
  toolName: string;
  arguments?: Record<string, unknown>;
}

interface ToolPolicy {
  maxConcurrent?: number;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function boundedInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function parseJson(v: unknown): any {
  if (typeof v !== 'string' || !v) return v;
  try { return JSON.parse(v); } catch { return null; }
}

async function toolNamesFromCache(v: unknown): Promise<Set<string>> {
  if (typeof v !== 'string' || !v) return new Set();
  try {
    const tools = await readToolCatalog(v);
    return new Set(tools.map((t: any) => str(t?.name)).filter(Boolean));
  } catch {
    return new Set();
  }
}

function toolAccessFromCatalog(v: unknown): Map<string, string> {
  const parsed = parseJson(v);
  const map = new Map<string, string>();
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const name = str(item?.name ?? item?.toolName);
      const access = str(item?.access).toLowerCase();
      if (name && access) map.set(name, access);
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [name, value] of Object.entries(parsed)) {
      const access = str((value as any)?.access ?? value).toLowerCase();
      if (name && access) map.set(name, access);
    }
  }
  return map;
}

class Semaphore {
  private active = 0;
  private readonly limit: number;
  private readonly queue: Array<() => void> = [];

  constructor(limit: number) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  async acquire(): Promise<number> {
    const started = Date.now();
    if (this.active < this.limit) {
      this.active++;
      return 0;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    return Date.now() - started;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function authorize(req: Request): Promise<boolean> {
  const configured = secrets.get('MCP_BATCH_EXECUTE_SECRET');
  const provided = req.headers.get('x-batch-token') ?? '';
  return Boolean(configured && provided && provided === configured);
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  if (req.method !== 'POST') {
    return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }

  if (!(await authorize(req))) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const base44 = createClientFromRequest(req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const serverId = str(body.serverId ?? body.server_id);
  const operations = Array.isArray(body.operations) ? body.operations as BatchOperation[] : [];
  const allowWrites = body.allowWrites === true;
  const operationTimeoutMs = boundedInt(body.operationTimeoutMs, DEFAULT_OPERATION_TIMEOUT_MS, 1_000, MAX_OPERATION_TIMEOUT_MS);
  const overallTimeoutMs = boundedInt(body.overallTimeoutMs, DEFAULT_OVERALL_TIMEOUT_MS, 1_000, MAX_OVERALL_TIMEOUT_MS);

  if (!serverId) return Response.json({ error: 'Missing required field: serverId' }, { status: 400 });
  if (!operations.length) return Response.json({ error: 'Missing required field: operations' }, { status: 400 });
  if (operations.length > MAX_BATCH_SIZE) {
    return Response.json({ error: `Batch exceeds maximum size of ${MAX_BATCH_SIZE}` }, { status: 413 });
  }

  const invalid = operations.find((op) => !op || !str(op.toolName));
  if (invalid) return Response.json({ error: 'Every operation requires a toolName' }, { status: 400 });

  const server = await base44.asServiceRole.entities.MCPServerConfig.get(serverId) as MCPServerConfigRecord & {
    tool_policy?: string | Record<string, ToolPolicy>;
    discovered_tools?: string;
  } | null;

  if (!server) return Response.json({ error: `MCPServerConfig '${serverId}' nao encontrado` }, { status: 404 });
  if (server.enabled === false) {
    return Response.json({ error: `Servidor '${server.name}' esta desabilitado (enabled=false)` }, { status: 409 });
  }

  const cachedTools = await toolNamesFromCache(server.discovered_tools);
  if (cachedTools.size) {
    const unknown = operations.map((op) => op.toolName).filter((name) => !cachedTools.has(name));
    if (unknown.length) {
      return Response.json({ error: 'TOOL_NOT_REGISTERED', tools: unknown }, { status: 400 });
    }
  }

  const catalog = toolAccessFromCatalog((server as any).tool_catalog);
  if (!allowWrites) {
    const writes = operations.map((op) => op.toolName).filter((name) => catalog.get(name) === 'write');
    if (writes.length) {
      return Response.json({ error: 'WRITE_TOOLS_REQUIRE_ALLOW_WRITES', tools: writes }, { status: 403 });
    }
  }

  const { headers, error: headerError } = resolveHeaders(server);
  if (headerError) return Response.json({ error: headerError }, { status: 500 });

  let session: Awaited<ReturnType<typeof connect>> | null = null;
  try {
    session = await connect(server.server_url, headers);
  } catch (e) {
    return Response.json({
      error: 'MCP_CONNECTION_FAILED',
      message: truncateError((e as Error).message),
      totalDurationMs: Date.now() - startedAt,
    }, { status: 502 });
  }

  const policy = parseJson(server.tool_policy) ?? {};
  const semaphores = new Map<string, Semaphore>();
  const semaphoreFor = (toolName: string) => {
    let semaphore = semaphores.get(toolName);
    if (!semaphore) {
      const configured = Number(policy?.[toolName]?.maxConcurrent);
      const limit = Number.isFinite(configured) && configured > 0
        ? Math.min(Math.floor(configured), MAX_BATCH_SIZE)
        : DEFAULT_MAX_CONCURRENT;
      semaphore = new Semaphore(limit);
      semaphores.set(toolName, semaphore);
    }
    return semaphore;
  };

  const deadline = Date.now() + overallTimeoutMs;

  try {
    const results = await withTimeout(
      Promise.all(operations.map(async (operation, index) => {
        const operationStarted = Date.now();
        const semaphore = semaphoreFor(operation.toolName);
        let semaphoreWaitMs = 0;
        let acquired = false;

        try {
          if (Date.now() >= deadline) throw new Error('Overall batch timeout reached');
          semaphoreWaitMs = await semaphore.acquire();
          acquired = true;

          const remaining = Math.max(1, Math.min(operationTimeoutMs, deadline - Date.now()));
          let result: any;
          try {
            result = await withTimeout(
              session!.client.callTool({
                name: operation.toolName,
                arguments: operation.arguments ?? {},
              }),
              remaining,
            );
          } catch (innerErr) {
            const recovered = tryRecoverResultFromError(innerErr);
            if (!recovered) throw innerErr;
            result = recovered;
          }

          if (result?.isError) {
            const message = result?.content?.[0]?.text ?? `Tool error em '${operation.toolName}'`;
            return {
              index,
              toolName: operation.toolName,
              status: 'failed',
              error: truncateError(String(message)),
              semaphoreWaitMs,
              durationMs: Date.now() - operationStarted,
            };
          }

          return {
            index,
            toolName: operation.toolName,
            status: 'success',
            output: result?.structuredContent ?? result?.content ?? null,
            semaphoreWaitMs,
            durationMs: Date.now() - operationStarted,
          };
        } catch (e) {
          return {
            index,
            toolName: operation.toolName,
            status: 'failed',
            error: truncateError((e as Error).message),
            semaphoreWaitMs,
            durationMs: Date.now() - operationStarted,
          };
        } finally {
          if (acquired) semaphore.release();
        }
      })),
      Math.max(1, overallTimeoutMs),
    );

    return Response.json({
      ok: true,
      serverId,
      serverName: server.name,
      count: results.length,
      results,
      totalDurationMs: Date.now() - startedAt,
      transport: session.transportUsed,
    });
  } catch (e) {
    return Response.json({
      error: 'BATCH_TIMEOUT',
      message: truncateError((e as Error).message),
      totalDurationMs: Date.now() - startedAt,
    }, { status: 504 });
  } finally {
    try {
      if (session.transportUsed === 'streamable-http' && typeof (session.transport as any).terminateSession === 'function') {
        await (session.transport as any).terminateSession();
      }
      await session.client.close();
    } catch {
      // Best-effort cleanup.
    }
  }
});