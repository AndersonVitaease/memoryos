export type {
  IResourceResolutionEngine,
  ResourceCandidateSelector,
  ResourceResolutionAttempt,
  ResourceResolutionGlobalMetrics,
  ResourceResolutionRequest,
  ResourceResolutionResult,
  ResourceResolutionSearchOutcome,
} from "./ResourceResolutionTypes";

export {
  resourceResolutionAuditStore,
  type ResourceResolutionAuditEvent,
  type ResourceResolutionAuditRecord,
} from "./ResourceResolutionAuditStore";

export { resourceResolutionEngine } from "./ResourceResolutionEngine";

export {
  createPreparedSearchAdapter,
  createNotImplementedFallback,
  type ResourceConnectorAdapter,
  type StandardConnectorId,
} from "./ConnectorAdapters";

export { createGmailResolutionAdapter } from "./adapters/GmailResolutionAdapter";
export { createGitHubResolutionAdapter } from "./adapters/GitHubResolutionAdapter";
export { createOneDriveResolutionAdapter } from "./adapters/OneDriveResolutionAdapter";
export { createDropboxResolutionAdapter } from "./adapters/DropboxResolutionAdapter";
export { createSharePointResolutionAdapter } from "./adapters/SharePointResolutionAdapter";
