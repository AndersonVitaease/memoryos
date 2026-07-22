/**
 * ConnectorContextBootstrap.ts
 *
 * Explicit bootstrap for all ConnectorContextBuilders.
 * This is the ONLY place in the platform where builders are registered.
 *
 * Design:
 *   - No side-effect imports anywhere else. Builders never self-register.
 *   - ConnectorResultSynthesizer imports only the registry (buildContext).
 *   - This file is imported once at app startup (e.g. in ConversationPipeline or main).
 *   - OCP: adding a new connector = implement a builder + one line here. Zero core changes.
 *
 * SRP: sole responsibility is wiring builders into the registry at startup.
 */

import { registerContextBuilder } from "./ConnectorContextBuilderRegistry";

// ── Import all builders ───────────────────────────────────────────────────────
// Each builder exports a default IConnectorContextBuilder object.
// Import the object — not a side-effect. The registration is explicit below.

import { GoogleDriveContextBuilder } from "./providers/GoogleDriveContextBuilder";
import { GmailContextBuilder }       from "./providers/GmailContextBuilder";
import { GitHubContextBuilder }      from "./providers/GitHubContextBuilder"; // EXP-GITHUB-CTX-01
// import { CalendarContextBuilder } from "./providers/CalendarContextBuilder";
// import { NotionContextBuilder }   from "./providers/NotionContextBuilder";
// import { DropboxContextBuilder }  from "./providers/DropboxContextBuilder";
// import { SlackContextBuilder }    from "./providers/SlackContextBuilder";

// ── Bootstrap function ────────────────────────────────────────────────────────

let _bootstrapped = false;

/**
 * Initialize all ConnectorContextBuilders.
 * Safe to call multiple times — executes only once per process lifetime.
 * Call this early in the app startup sequence (ConversationPipeline.init or equivalent).
 */
export function bootstrapConnectorContext(): void {
  if (_bootstrapped) return;
  _bootstrapped = true;

  registerContextBuilder(GoogleDriveContextBuilder);
  registerContextBuilder(GmailContextBuilder);
  registerContextBuilder(GitHubContextBuilder); // EXP-GITHUB-CTX-01
  // registerContextBuilder(CalendarContextBuilder);
  // registerContextBuilder(NotionContextBuilder);
  // registerContextBuilder(DropboxContextBuilder);
  // registerContextBuilder(SlackContextBuilder);
}

/** Reset for testing purposes only. */
export function _resetBootstrap(): void {
  _bootstrapped = false;
}