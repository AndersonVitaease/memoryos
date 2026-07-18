/**
 * ConnectorKnowledgeContext.ts
 * Builds the knowledge context for a connector operation request.
 *
 * SRP: Context construction only.
 * Sprint: INTEGRATION-04
 */

export type ConnectorDomain =
  | "GOOGLE_DRIVE" | "GMAIL" | "GOOGLE_CALENDAR" | "GITHUB"
  | "BASE44" | "SLACK" | "NOTION" | "GENERIC";

export type ConnectorPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ConnectorOperation =
  | "READ" | "WRITE" | "DELETE" | "SEARCH" | "SEND"
  | "LIST" | "SYNC" | "WEBHOOK" | "AUTH";

export interface ConnectorRequest {
  readonly requestId:  string;
  readonly connector:  string;
  readonly operation:  ConnectorOperation;
  readonly intent:     string;
  readonly provider:   string;
  readonly parameters: Record<string, unknown>;
  readonly priority:   ConnectorPriority;
  readonly domain:     ConnectorDomain;
  readonly project:    string;
  readonly sprint:     string;
  readonly tags:       string[];
}

export interface ConnectorKnowledgeContext {
  readonly requestId:   string;
  readonly connector:   string;
  readonly operation:   ConnectorOperation;
  readonly intent:      string;
  readonly provider:    string;
  readonly parameters:  Readonly<Record<string, unknown>>;
  readonly priority:    ConnectorPriority;
  readonly domain:      ConnectorDomain;
  readonly project:     string;
  readonly sprint:      string;
  readonly tags:        readonly string[];
  readonly builtAt:     string;
}

export const ConnectorKnowledgeContextBuilder = Object.freeze({
  build(req: ConnectorRequest): ConnectorKnowledgeContext {
    return Object.freeze({
      requestId:  req.requestId,
      connector:  req.connector,
      operation:  req.operation,
      intent:     req.intent.trim(),
      provider:   req.provider,
      parameters: Object.freeze({ ...req.parameters }),
      priority:   req.priority,
      domain:     req.domain,
      project:    req.project  ?? "",
      sprint:     req.sprint   ?? "",
      tags:       Object.freeze([...(req.tags ?? [])]),
      builtAt:    new Date().toISOString(),
    });
  },
});