/**
 * RuntimeSelector.ts — Sprint EF-7.2.5
 *
 * Single responsibility: select the active IRuntimeProvider from a list.
 * Delegates score calculation to RuntimeScore — never calculates scores itself.
 *
 * SRP: selection only.
 * No registry access. No state. Pure functions.
 *
 * API: select() · selectAvailable() · sort() · best()
 */

import type { IRuntimeProvider } from "./IRuntimeProvider";
import { RuntimeScore }          from "./RuntimeScore";

export const RuntimeSelector = {

  /** Sort providers by score descending. */
  sort(providers: IRuntimeProvider[]): IRuntimeProvider[] {
    if (providers.length === 0) return [];
    const scored = providers.map(p => ({ p, s: RuntimeScore.score(p) }));
    scored.sort((a, b) => b.s.totalScore - a.s.totalScore);
    return scored.map(x => x.p);
  },

  /** Select the single best provider (ignores availability). */
  best(providers: IRuntimeProvider[]): IRuntimeProvider | undefined {
    return RuntimeSelector.sort(providers)[0];
  },

  /** Select the best available provider; falls back to best unavailable. */
  selectAvailable(providers: IRuntimeProvider[]): IRuntimeProvider | undefined {
    const available = providers.filter(p => p.isAvailable);
    return available.length > 0
      ? RuntimeSelector.best(available)
      : RuntimeSelector.best(providers);
  },

  /** Primary entry point: select active provider from a list. */
  select(providers: IRuntimeProvider[]): IRuntimeProvider | undefined {
    return RuntimeSelector.selectAvailable(providers);
  },
};