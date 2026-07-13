/**
 * SDKTypes.ts — MemoryOS Connector SDK v1.0 · Type Definitions
 * Beta-03 · 2026-07-13
 *
 * All models are provider-agnostic — no GitHub, Base44, Slack or any
 * provider-specific references belong here.
 */

import type { CapabilityType } from "../production-connector-standard/PCSTypes";

// ── Auth type ─────────────────────────────────────────────────────────────────

export type AuthType =
  | "api_key"       // Static API key / PAT
  | "oauth2"        // OAuth 2.0 authorization code
  | "session"       // Platform-managed session (e.g. Base44)
  | "basic"         // HTTP Basic
  | "bearer"        // Bearer token
  | "none";         // No authentication

// ── Knowledge provider type ──────────────────────────────────────────────────

export type KnowledgeProviderType =
  | "repository"   // Code / document repository
  | "conversation" // Chat / messaging
  | "calendar"     // Events / scheduling
  | "documents"    // File storage
  | "tasks"        // Task management
  | "crm"          // Customer data
  | "analytics"    // Metrics / reporting
  | "generic";     // Anything else

// ── Manifest ─────────────────────────────────────────────────────────────────

export interface CapabilityDeclaration {
  readonly id: string;
  readonly type: CapabilityType;
  readonly description: string;
  readonly requiredAuth: boolean;
  readonly readOnly: boolean;
  readonly paginated: boolean;
}

export interface ConnectorManifest {
  readonly specVersion: "1.0";
  readonly id: string;                        // kebab-case, e.g. "gmail"
  readonly name: string;                      // Human-readable, e.g. "Gmail Connector"
  readonly provider: string;                  // e.g. "Google", "Slack"
  readonly version: string;                   // semver
  readonly description: string;
  readonly author: string;
  readonly authType: AuthType;
  readonly requiredPermissions: string[];     // scopes / permissions required
  readonly capabilities: CapabilityDeclaration[];
  readonly supportedOperations: string[];     // list of operation ids
  readonly hasKnowledgeProvider: boolean;
  readonly knowledgeProviderType?: KnowledgeProviderType;
  readonly productionLevel: "experimental" | "beta" | "production" | "certified";
  readonly dependencies: string[];            // other connector ids if any
  readonly compatibility: {
    readonly minRuntimeVersion: string;
    readonly pcsVersion: string;
  };
  readonly createdAt: number;
  readonly tags: string[];
}

// ── SDK configuration ────────────────────────────────────────────────────────

export interface ConnectorConfig {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly version?: string;
  readonly description?: string;
  readonly author?: string;
  readonly authType: AuthType;
  readonly requiredPermissions?: string[];
  readonly capabilities: CapabilityDeclaration[];
  readonly hasKnowledgeProvider?: boolean;
  readonly knowledgeProviderType?: KnowledgeProviderType;
  readonly tags?: string[];
}

// ── Generated artifacts ───────────────────────────────────────────────────────

export interface GeneratedConnector {
  readonly id: string;
  readonly manifest: ConnectorManifest;
  readonly connectorCode: string;
  readonly testsCode: string;
  readonly knowledgeProviderCode: string | null;
  readonly readme: string;
  readonly pcsGuide: string;
  readonly certificationGuide: string;
  readonly generatedAt: number;
}

// ── SDK Validation ────────────────────────────────────────────────────────────

export type SDKCheckVerdict = "PASS" | "FAIL" | "WARN";

export interface SDKValidationCheck {
  readonly name: string;
  readonly verdict: SDKCheckVerdict;
  readonly detail: string;
  readonly required: boolean;
}

export interface SDKValidationReport {
  readonly connectorId: string;
  readonly validatedAt: number;
  readonly checks: SDKValidationCheck[];
  readonly passed: number;
  readonly failed: number;
  readonly score: number;
  readonly overall: SDKCheckVerdict;
  readonly summary: string;
}

// ── SDK Test result ───────────────────────────────────────────────────────────

export interface SDKTestResult {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly status: "PASS" | "FAIL" | "SKIP";
  readonly durationMs: number;
  readonly detail: string;
}

export interface SDKTestReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly results: SDKTestResult[];
  readonly passed: number;
  readonly failed: number;
  readonly total: number;
  readonly overallStatus: "PASS" | "FAIL";
  readonly summary: string;
}