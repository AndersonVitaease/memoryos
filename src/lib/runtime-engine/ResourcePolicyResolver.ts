/**
 * ResourcePolicyResolver.ts — P2 CORREÇÃO ARQUITETURAL
 *
 * ÚNICA implementação compartilhada de resolução de resource policies.
 * Consumida por ConversationRuntimeEngine (FAST/NORMAL path) e
 * DynamicWaveRunner (ADAPTIVE path) — garante comportamento idêntico.
 *
 * Responsabilidade: ExecutionStep[] → Map<resourceKey, maxConcurrent>
 *
 * MCP:     MCPServerConfig.tool_policy[toolName].maxConcurrent
 * Não-MCP: ConnectorMetadata.capabilityConcurrency[capability]
 *
 * Resource key (preserva convenção certificada):
 *   MCP:     mcp:<serverName|serverId>:<toolName>  (serverName preferido)
 *   Não-MCP: <connector>:<capability>
 *
 * Validação: maxConcurrent deve ser integer > 0 finite.
 * Policy ausente/0/negativa/NaN/float → ignorada (irrestrito, NUNCA fallback=1).
 */

import type { ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import { base44 } from "@/api/base44Client";

// ── Validation ────────────────────────────────────────────────────────────────

function isValidMaxConcurrent(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v > 0;
}

// ── Tool policy parsing ───────────────────────────────────────────────────────

function parseToolPolicy(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === "object" && !Array.isArray(p)
        ? (p as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

// ── Non-MCP: ConnectorMetadata.capabilityConcurrency lookup ───────────────────
// Best-effort via global registry (wired by ConnectorRuntimeProvider).
// Ausente/inválido → undefined (recurso fica irrestrito). Nunca lança.

function lookupCapabilityConcurrency(
  connectorId: string,
  capability: string,
): number | undefined {
  try {
    const reg = (globalThis as unknown as Record<string, unknown>).__REAL_RUNTIME_REGISTRY__;
    if (!reg || typeof (reg as { get?: unknown }).get !== "function") return undefined;
    const conn = (reg as {
      get: (id: string) => {
        metadata?: () => { capabilityConcurrency?: Record<string, number> };
      } | undefined;
    }).get(connectorId);
    const cc = conn?.metadata?.()?.capabilityConcurrency;
    const mc = cc?.[capability];
    if (isValidMaxConcurrent(mc)) return mc;
    return undefined;
  } catch {
    return undefined;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve Map<resourceKey, maxConcurrent> para TODOS os steps.
 *
 * - MCP (connector=mcp, capability=mcp.callTool): resourceKey =
 *   `mcp:<serverName|serverId>:<toolName>` (serverName preferido).
 *   maxConcurrent lido de MCPServerConfig.tool_policy[toolName].
 *   Lookup batched por server (filter por name ou get por id).
 * - Não-MCP: resourceKey = `<connector>:<capability>`. maxConcurrent lido de
 *   ConnectorMetadata.capabilityConcurrency via registry global.
 *
 * Policy inválida (0, negativo, NaN, float) → ignorada.
 * Lookup failure → recurso fica irrestrito (nunca lança).
 * Mapa vazio quando nenhum recurso possui policy válida.
 */
export async function resolveResourcePolicies(
  steps: readonly ExecutionStep[],
): Promise<Map<string, number>> {
  const policies = new Map<string, number>();
  const mcpPairs = new Map<string, { resolveById: boolean; serverKey: string; tool: string }>();
  const serverCache = new Map<string, { tool_policy?: unknown } | null>();

  for (const s of steps) {
    if (s.connector === "mcp" && s.capability === "mcp.callTool") {
      const p = s.parameters as Record<string, unknown>;
      const name = typeof p.serverName === "string" ? p.serverName.trim() : "";
      const id = typeof p.serverId === "string" ? p.serverId.trim() : "";
      const server = name || id; // serverName preferido
      const tool = typeof p.toolName === "string" ? p.toolName.trim() : "";
      if (!server || !tool) continue;
      const key = `mcp:${server}:${tool}`;
      if (!policies.has(key) && !mcpPairs.has(key)) {
        mcpPairs.set(key, { resolveById: !name && !!id, serverKey: server, tool });
      }
    } else {
      const key = `${s.connector}:${s.capability}`;
      if (!policies.has(key)) {
        const mc = lookupCapabilityConcurrency(s.connector, s.capability);
        if (mc !== undefined) policies.set(key, mc);
      }
    }
  }

  for (const [key, { resolveById, serverKey, tool }] of mcpPairs) {
    let record = serverCache.get(serverKey);
    if (record === undefined) {
      try {
        if (resolveById) {
          record = (await base44.entities.MCPServerConfig.get(serverKey)) as
            | { tool_policy?: unknown }
            | null;
        } else {
          const matches = (await base44.entities.MCPServerConfig.filter({
            name: serverKey,
          })) as Array<{ tool_policy?: unknown }>;
          record = matches[0] ?? null;
        }
      } catch {
        record = null;
      }
      serverCache.set(serverKey, record);
    }
    const raw = record?.tool_policy;
    if (!raw) continue;
    const policyObj = parseToolPolicy(raw);
    if (!policyObj) continue;
    const entry = policyObj[tool];
    const mc = (entry as { maxConcurrent?: unknown })?.maxConcurrent;
    if (isValidMaxConcurrent(mc)) {
      policies.set(key, mc);
    }
  }

  return policies;
}