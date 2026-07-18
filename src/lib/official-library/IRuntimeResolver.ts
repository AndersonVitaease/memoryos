/**
 * IRuntimeResolver.ts — Sprint EF-7.2.6
 *
 * Contract for resolving the active IRuntimeProvider.
 * OfficialLibraryRuntimeProvider depends ONLY on this interface.
 * RuntimeRegistry is unknown to the Provider layer.
 *
 * SRP: resolution contract only.
 * DIP: consumers depend on abstraction, not on RuntimeRegistry.
 */

import type { IRuntimeProvider }    from "./IRuntimeProvider";
import type { RuntimeReasonResult } from "./RuntimeReason";

export interface IRuntimeResolver {
  /** Return the currently active provider (cached or freshly selected). */
  getActive(): IRuntimeProvider;
  /** Force re-evaluation and return newly selected provider. */
  refresh(): IRuntimeProvider;
  /** All registered providers sorted by score. */
  list(): readonly IRuntimeProvider[];
  /** Explain selection decisions for all providers. */
  explain(): readonly RuntimeReasonResult[];
}