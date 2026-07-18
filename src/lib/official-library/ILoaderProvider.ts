/**
 * ILoaderProvider.ts — Sprint EF-7.2.6
 *
 * Contract for resolving the active IDocumentLoader.
 * RuntimeProviders depend ONLY on this interface.
 * DocumentLoaderFactory is unknown to the Provider layer.
 *
 * SRP: loader resolution contract only.
 * DIP: providers depend on abstraction, not on DocumentLoaderFactory.
 */

import type { IDocumentLoader } from "./DocumentLoaderFactory";

export interface ILoaderProvider {
  /** Return the currently active loader. */
  getLoader(): IDocumentLoader;
  /** Loader identifier — for diagnostics. */
  readonly loaderId: string;
  /** Loader name — for diagnostics. */
  readonly loaderName: string;
}