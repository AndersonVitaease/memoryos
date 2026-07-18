/**
 * IRuntimeProvider.ts — Sprint EF-7.2.5
 *
 * Core interface for a Runtime Provider.
 * EF-7.2.5: added `environment` field — provider declares its own environment.
 * RuntimeReason consumes it; never detects environment itself.
 *
 * SRP: provider identity contract only.
 * DIP: Bootstrap depends only on this interface.
 */

import type { IDocumentDiscovery }  from "./DocumentDiscovery";
import type { IDocumentLoader }     from "./DocumentLoaderFactory";
import type { RuntimeEnvironmentType } from "./RuntimeEnvironment";

export interface IRuntimeProvider {
  readonly runtimeId:    string;
  readonly runtimeName:  string;
  readonly priority:     number;
  readonly isAvailable:  boolean;
  readonly reason:       string;
  /** The environment this provider operates in. */
  readonly environment:  RuntimeEnvironmentType;

  discovery(): IDocumentDiscovery;
  loader():    IDocumentLoader;
}