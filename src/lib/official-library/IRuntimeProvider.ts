/**
 * IRuntimeProvider.ts — Sprint EF-7.2.6
 *
 * Core interface for a Runtime Provider.
 * EF-7.2.5: added `environment` field.
 * EF-7.2.6: added `supportsEnvironment()` — provider declares its own capability.
 *
 * SRP: provider identity contract only.
 * DIP: Bootstrap depends only on this interface.
 */

import type { IDocumentDiscovery }      from "./DocumentDiscovery";
import type { IDocumentLoader }         from "./DocumentLoaderFactory";
import type { RuntimeEnvironmentType }  from "./RuntimeEnvironment";

export interface IRuntimeProvider {
  readonly runtimeId:    string;
  readonly runtimeName:  string;
  readonly priority:     number;
  readonly isAvailable:  boolean;
  readonly reason:       string;
  /** The environment this provider operates in — declared by provider, consumed by RuntimeReason. */
  readonly environment:  RuntimeEnvironmentType;

  /** Whether this provider supports the current execution environment. */
  supportsEnvironment(): boolean;

  discovery(): IDocumentDiscovery;
  loader():    IDocumentLoader;
}