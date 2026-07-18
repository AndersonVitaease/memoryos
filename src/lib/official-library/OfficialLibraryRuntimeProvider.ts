/**
 * OfficialLibraryRuntimeProvider.ts — Sprint EF-7.2.6
 *
 * Facade that Bootstrap uses for all infrastructure resolution.
 * Depends ONLY on IRuntimeResolver and IRuntimeProvider interfaces.
 * RuntimeRegistry is completely hidden behind RuntimeResolver.
 *
 * EF-7.2.6: no direct RuntimeRegistry import — resolved through RuntimeResolver.
 *
 * Bootstrap usage:
 *   const runtime   = OfficialLibraryRuntimeProvider.runtime();
 *   const discovery = runtime.discovery();
 *   const loader    = runtime.loader();
 */

import type { IRuntimeProvider }       from "./IRuntimeProvider";
import type { IDocumentDiscovery }     from "./DocumentDiscovery";
import type { IDocumentLoader }        from "./DocumentLoaderFactory";
import type { IRuntimeResolver }       from "./IRuntimeResolver";
import { RuntimeResolver }             from "./RuntimeResolver";
import { RuntimeScore }                from "./RuntimeScore";
import { RuntimeReason }               from "./RuntimeReason";
import { detectEnvironment }           from "./RuntimeEnvironment";
import type { RuntimeReasonResult }    from "./RuntimeReason";
import type { RuntimeScoreResult }     from "./RuntimeScore";

class OfficialLibraryRuntimeProviderImpl {
  private readonly _resolver: IRuntimeResolver;

  constructor(resolver: IRuntimeResolver = RuntimeResolver) {
    this._resolver = resolver;
  }

  runtime():      IRuntimeProvider   { return this._resolver.getActive(); }
  getRuntime():   IRuntimeProvider   { return this._resolver.getActive(); }
  getDiscovery(): IDocumentDiscovery { return this._resolver.getActive().discovery(); }
  getLoader():    IDocumentLoader    { return this._resolver.getActive().loader(); }

  getReason(): RuntimeReasonResult {
    const provider = this._resolver.getActive();
    const score    = RuntimeScore.score(provider);
    const env      = detectEnvironment();
    return RuntimeReason.explain(provider, score, true, env);
  }

  getScore(): RuntimeScoreResult {
    return RuntimeScore.score(this._resolver.getActive());
  }

  getAllReasons(): RuntimeReasonResult[] {
    return [...this._resolver.explain()];
  }

  /** Force re-evaluation using the resolver's public API. */
  refresh(): IRuntimeProvider {
    return this._resolver.refresh();
  }
}

const G = globalThis as typeof globalThis & { __OL_RUNTIME_PROVIDER__?: OfficialLibraryRuntimeProviderImpl };
if (!G.__OL_RUNTIME_PROVIDER__) G.__OL_RUNTIME_PROVIDER__ = new OfficialLibraryRuntimeProviderImpl();
export const OfficialLibraryRuntimeProvider: OfficialLibraryRuntimeProviderImpl = G.__OL_RUNTIME_PROVIDER__;