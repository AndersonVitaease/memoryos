/**
 * OfficialLibraryRuntimeProvider.ts — Sprint EF-7.2.4
 *
 * The single facade that Bootstrap interacts with for infrastructure resolution.
 * Exposes only IRuntimeProvider abstractions — never concrete types.
 *
 * Bootstrap usage:
 *   const runtime   = OfficialLibraryRuntimeProvider.runtime();
 *   const discovery = runtime.discovery();
 *   const loader    = runtime.loader();
 *
 * API: runtime() · getDiscovery() · getLoader() · getReason() · getRuntime() · refresh()
 */

import type { IRuntimeProvider } from "./IRuntimeProvider";
import type { IDocumentDiscovery } from "./DocumentDiscovery";
import type { IDocumentLoader }    from "./DocumentLoaderFactory";
import { RuntimeRegistry }         from "./RuntimeRegistry";
import { RuntimeScore }            from "./RuntimeScore";
import { RuntimeReason }           from "./RuntimeReason";
import type { RuntimeReasonResult } from "./RuntimeReason";
import type { RuntimeScoreResult }  from "./RuntimeScore";

class OfficialLibraryRuntimeProviderImpl {

  /** Get the active IRuntimeProvider (score-based selection). */
  runtime(): IRuntimeProvider {
    return RuntimeRegistry.getActive();
  }

  /** Convenience: get the active discovery implementation. */
  getDiscovery(): IDocumentDiscovery {
    return this.runtime().discovery();
  }

  /** Convenience: get the active loader implementation. */
  getLoader(): IDocumentLoader {
    return this.runtime().loader();
  }

  /** Explain the selection decision for the active provider. */
  getReason(): RuntimeReasonResult {
    const provider = this.runtime();
    const score    = RuntimeScore.score(provider);
    return RuntimeReason.explain(provider, score, true);
  }

  /** Same as runtime() — explicit alias for clarity. */
  getRuntime(): IRuntimeProvider {
    return this.runtime();
  }

  /** All providers with scores and reasons. */
  getAllReasons(): RuntimeReasonResult[] {
    return RuntimeRegistry.explain();
  }

  /** Score for the active provider. */
  getScore(): RuntimeScoreResult {
    return RuntimeScore.score(this.runtime());
  }

  /** Force re-evaluation of the active provider (clears internal cache). */
  refresh(): IRuntimeProvider {
    RuntimeRegistry._reset();
    // Re-registration happens automatically via OfficialLibraryRuntime side-effects
    // but RuntimeRegistry._reset() clears providers — we only clear the selection cache
    // by touching globalThis. Instead, just clear the active cache via unregister trick:
    // Actually: re-initialize properly.
    const G = globalThis as any;
    if (G.__OL_RUNTIME_REGISTRY__) {
      G.__OL_RUNTIME_REGISTRY__._activeId = null;
      // Don't clear providers — just reset selection
    }
    return RuntimeRegistry.getActive();
  }
}

const G = globalThis as typeof globalThis & { __OL_RUNTIME_PROVIDER__?: OfficialLibraryRuntimeProviderImpl };
if (!G.__OL_RUNTIME_PROVIDER__) G.__OL_RUNTIME_PROVIDER__ = new OfficialLibraryRuntimeProviderImpl();
export const OfficialLibraryRuntimeProvider: OfficialLibraryRuntimeProviderImpl = G.__OL_RUNTIME_PROVIDER__;