/**
 * DeveloperPortalTypes.ts — P8 Developer Portal
 * Tipos imutaveis para o portal de desenvolvedores.
 * MDS v2.0 · P8 · Version: 1.0.0
 */

export type DocCategory =
  | "getting-started"
  | "sdk"
  | "connectors"
  | "specialists"
  | "knowledge-packages"
  | "marketplace"
  | "architecture"
  | "api-reference";

export type PlaygroundTarget = "specialist" | "knowledge_package" | "connector";

export interface DocEntry {
  readonly id: string;
  readonly title: string;
  readonly category: DocCategory;
  readonly description: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly version: string;
  readonly updatedAt: string;
}

export interface PlaygroundSession {
  readonly id: string;
  readonly target: PlaygroundTarget;
  readonly capabilityId: string;
  readonly input: string;
  readonly output: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly status: "pending" | "running" | "success" | "error";
  readonly error?: string;
}

export interface CLICommand {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  readonly example: string;
  readonly flags: readonly CLIFlag[];
}

export interface CLIFlag {
  readonly flag: string;
  readonly description: string;
  readonly required: boolean;
  readonly default?: string;
}

export interface PortalHealth {
  readonly docsCount: number;
  readonly playgroundSessionsCount: number;
  readonly registeredCapabilities: number;
  readonly healthy: boolean;
  readonly checkedAt: string;
}