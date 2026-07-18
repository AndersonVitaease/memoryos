/**
 * OfficialLibraryRuntimeProvider.ts — Sprint EF-7.2.5
 *
 * Facade that Bootstrap uses for all infrastructure resolution.
 * Exposes only interfaces — zero concrete imports.
 *
 * EF-7.2.5: refresh() now uses public RuntimeRegistry.refresh() API
 * — no private state access, no globalThis hacks.
 *
 * Bootstrap usage:
 *   const runtime   = OfficialLibraryRuntimeProvider.runtime();
 *   const discovery = runtime.discovery();
 *   const loader    = runtime.loader();
 */

import type { IRuntimeProvider }       from "./IRuntimeProvider";
import type { IDocumentDiscovery }     from "./DocumentDiscovery";
import type { IDocumentLoader }        from "./DocumentLoaderFactory";
import { RuntimeRegistry }             from "./RuntimeRegistry";
import { RuntimeScore }                from "./RuntimeScore";
import { RuntimeReason }               from "./RuntimeReason";
import { detectEnvironment }           from "./RuntimeEnvironment";
import type { RuntimeReasonResult }    from "./RuntimeReason";
import type { RuntimeScoreResult }     from "./RuntimeScore";

class OfficialLibraryRuntimeProviderImpl {

  runtime():     IRuntimeProvider  { return RuntimeRegistry.getActive(); }
  getRuntime():  IRuntimeProvider  { return this.runtime(); }
  getDiscovery(): IDocumentDiscovery { return this.runtime().discovery(); }
  getLoader():    IDocumentLoader    { return this.runtime().loader(); }

  getReason(): RuntimeReasonResult {
    const provider = this.runtime();
    const score    = RuntimeScore.score(provider);
    const env      = detectEnvironment();
    return RuntimeReason.explain(provider, score, true, env);
  }

  getScore(): RuntimeScoreResult {
    return RuntimeScore.score(this.runtime());
  }

  getAllReasons(): RuntimeReasonResult[] {
    return RuntimeRegistry.explain();
  }

  /** Force re-evaluation — uses public API only, no private state access. */
  refresh(): IRuntimeProvider {
    RuntimeRegistry.refresh();
    return RuntimeRegistry.getActive();
  }
}

const G = globalThis as typeof globalThis & { __OL_RUNTIME_PROVIDER__?: OfficialLibraryRuntimeProviderImpl };
if (!G.__OL_RUNTIME_PROVIDER__) G.__OL_RUNTIME_PROVIDER__ = new OfficialLibraryRuntimeProviderImpl();
export const OfficialLibraryRuntimeProvider: OfficialLibraryRuntimeProviderImpl = G.__OL_RUNTIME_PROVIDER__;