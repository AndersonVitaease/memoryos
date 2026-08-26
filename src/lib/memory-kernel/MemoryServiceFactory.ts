/**
 * MemoryServiceFactory.ts — Memory Kernel v1.0
 * Sprint EF-40.8
 *
 * UNICO responsavel por decidir qual implementacao de MemoryService e utilizada.
 * Nenhum outro componente do sistema conhece essa decisao.
 *
 * Modos:
 *   LEGACY  — Usa LegacyMemoryService (runMemoryPipeline)
 *   UCME    — Usa UCMEMemoryService (UnifiedMemoryEngine)
 *   SHADOW  — Usa LegacyMemoryService para o Planner +
 *             UCMEMemoryService em paralelo fire-and-forget (diagnostico)
 *
 * Rollback: mudar MEMORY_KERNEL_MODE para "LEGACY".
 * Nenhum outro arquivo precisa ser modificado.
 */

import type { MemoryService } from "./MemoryService";
import type { MemoryRequest } from "./MemoryRequest";
import type { MemoryContext } from "./MemoryContext";
import { LegacyMemoryService } from "./LegacyMemoryService";
import { UCMEMemoryService }   from "./UCMEMemoryService";

// ── Feature flag ──────────────────────────────────────────────────────────────
// Alterar APENAS aqui para controlar o modo de toda a Memory Layer.
// Nenhum outro componente conhece esta decisao.
type KernelMode = "LEGACY" | "UCME" | "SHADOW";

const MEMORY_KERNEL_MODE: KernelMode =
  (typeof window !== "undefined"
    ? (window as unknown as Record<string, string>).__MEMORY_KERNEL_MODE__ as KernelMode
    : undefined) ?? "UCME";

// ── Singleton instances ───────────────────────────────────────────────────────
const _legacy = new LegacyMemoryService();
const _ucme   = new UCMEMemoryService();

// ── Shadow diagnostics store (in-memory) ─────────────────────────────────────
export interface ShadowKernelReport {
  readonly timestamp: string;
  readonly sessionId: string;
  readonly legacy: { durationMs: number; memoryCount: number; sources: readonly string[]; error: string | null };
  readonly ucme:   { durationMs: number; memoryCount: number; sources: readonly string[]; error: string | null };
  readonly diff: {
    readonly memoryCountDelta: number;
    readonly durationDelta:    number;
    readonly sourceDiff:       readonly string[];
    readonly ucmeWider:        boolean;
    readonly ucmeFaster:       boolean;
  };
}

const _shadowReports: ShadowKernelReport[] = [];

function pushShadowReport(report: ShadowKernelReport): void {
  _shadowReports.unshift(report);
  if (_shadowReports.length > 50) _shadowReports.pop();
}

// ── Shadow wrapper — delegado ao service que o Planner usa ───────────────────

class ShadowMemoryService implements MemoryService {
  async retrieve(request: MemoryRequest): Promise<MemoryContext> {
    // Planner recebe SEMPRE o Legacy — nunca e afetado pelo UCME
    const legacyPromise = _legacy.retrieve(request);

    // UCME roda em paralelo para diagnostico (fire-and-forget)
    void (async () => {
      try {
        const [legacyResult, ucmeResult] = await Promise.all([legacyPromise, _ucme.retrieve(request)]);
        const ld = legacyResult.diagnostics;
        const ud = ucmeResult.diagnostics;

        pushShadowReport({
          timestamp: new Date().toISOString(),
          sessionId: request.sessionId,
          legacy: { durationMs: ld.durationMs, memoryCount: ld.memoryCount, sources: ld.sources, error: ld.error },
          ucme:   { durationMs: ud.durationMs, memoryCount: ud.memoryCount, sources: ud.sources, error: ud.error },
          diff: {
            memoryCountDelta: ud.memoryCount - ld.memoryCount,
            durationDelta:    ud.durationMs  - ld.durationMs,
            sourceDiff:       ud.sources.filter((s) => !ld.sources.includes(s)),
            ucmeWider:        ud.memoryCount > ld.memoryCount,
            ucmeFaster:       ud.durationMs  < ld.durationMs,
          },
        });
      } catch {
        /* Shadow nunca impacta o Planner */
      }
    })();

    return legacyPromise;
  }
}

const _shadow = new ShadowMemoryService();

// ── Factory API ───────────────────────────────────────────────────────────────

export const MemoryServiceFactory = {
  /**
   * Retorna a implementacao de MemoryService correta para o modo configurado.
   * Esta e a UNICA forma de obter um MemoryService.
   */
  getService(): MemoryService {
    switch (MEMORY_KERNEL_MODE) {
      case "UCME":   return _ucme;
      case "SHADOW": return _shadow;
      default:       return _legacy;
    }
  },

  getMode(): KernelMode {
    return MEMORY_KERNEL_MODE;
  },

  getShadowReports(): readonly ShadowKernelReport[] {
    return _shadowReports;
  },
};

/**
 * Instancia pre-configurada do MemoryService para uso direto pelo Planner.
 * O Planner importa APENAS esta constante — nunca as implementacoes.
 */
export const memoryService: MemoryService = MemoryServiceFactory.getService();