/**
 * LoaderProvider.ts — Sprint EF-7.2.6
 *
 * Concrete implementation of ILoaderProvider.
 * Encapsulates DocumentLoaderFactory — only class that knows it.
 *
 * SRP: loader resolution only.
 * Cache: returns the same loader unless refreshed.
 * Telemetry: cacheHits, cacheMisses, refreshCount.
 */

import type { ILoaderProvider } from "./ILoaderProvider";
import type { IDocumentLoader } from "./DocumentLoaderFactory";
import { DocumentLoaderFactory } from "./DocumentLoaderFactory";

class LoaderProviderImpl implements ILoaderProvider {
  private _cached:       IDocumentLoader | null = null;
  private _cacheHits    = 0;
  private _cacheMisses  = 0;
  private _refreshCount = 0;

  getLoader(): IDocumentLoader {
    if (this._cached) {
      this._cacheHits++;
      return this._cached;
    }
    this._cacheMisses++;
    this._cached = DocumentLoaderFactory.getActive();
    return this._cached;
  }

  get loaderId():   string { return this.getLoader().loaderId; }
  get loaderName(): string { return this.getLoader().loaderName; }
  get cacheHits():  number { return this._cacheHits; }
  get cacheMisses():number { return this._cacheMisses; }
  get refreshCount():number { return this._refreshCount; }

  /** Invalidate loader cache — next getLoader() re-resolves. */
  refresh(): IDocumentLoader {
    this._cached = null;
    this._refreshCount++;
    return this.getLoader();
  }
}

const G = globalThis as typeof globalThis & { __LOADER_PROVIDER__?: LoaderProviderImpl };
if (!G.__LOADER_PROVIDER__) G.__LOADER_PROVIDER__ = new LoaderProviderImpl();
export const LoaderProvider: LoaderProviderImpl = G.__LOADER_PROVIDER__;