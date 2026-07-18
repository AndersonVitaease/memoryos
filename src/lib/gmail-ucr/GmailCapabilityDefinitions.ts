/**
 * GmailCapabilityDefinitions.ts — Sprint EF-6.6.0
 *
 * Declarative capability descriptors for Gmail.
 * Mirrors the pattern from GoogleDriveCapabilityRegistry.
 * Registers with GoalCapabilityRegistry — zero changes to that registry.
 */

import { GoalCapabilityRegistry } from "@/lib/planning-engine-e022/GoalCapabilityRegistry";

const _registered = { done: false };

export function bootstrapGmailCapabilities(): void {
  if (_registered.done) return;
  _registered.done = true;

  // gmail.readInbox → gmail.listMessages
  GoalCapabilityRegistry.register({
    goalType: "gmail.readInbox",
    descriptors: [
      { connector: "gmail", capability: "gmail.listMessages", params: { labelIds: "INBOX", maxResults: 20 } },
    ],
  });

  // gmail.searchMessages → gmail.searchMessages
  GoalCapabilityRegistry.register({
    goalType: "gmail.searchMessages",
    descriptors: [
      { connector: "gmail", capability: "gmail.searchMessages", params: {} },
    ],
  });

  // gmail.readMessage → gmail.getMessage
  GoalCapabilityRegistry.register({
    goalType: "gmail.readMessage",
    descriptors: [
      { connector: "gmail", capability: "gmail.getMessage", params: { format: "full" } },
    ],
  });
}

bootstrapGmailCapabilities();