/**
 * index.ts — P8 Developer Portal
 * Exports oficiais do modulo Developer Portal.
 * MDS v2.0 · P8 · Version: 1.0.0
 */

export { OFFICIAL_DOCS } from "./DeveloperPortalDocs";
export { DeveloperPlayground } from "./DeveloperPortalPlayground";
export { runDeveloperPortalTests } from "./developerPortalTests";
export type {
  DocEntry,
  DocCategory,
  PlaygroundSession,
  PlaygroundTarget,
  CLICommand,
  CLIFlag,
  PortalHealth,
} from "./DeveloperPortalTypes";