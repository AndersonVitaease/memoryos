/**
 * PKBTypes.ts — Phase 6.0.0
 * Project Knowledge Builder · Type Definitions
 */

export type EntityType =
  | "class" | "interface" | "enum" | "function" | "constant"
  | "type" | "module" | "file" | "directory" | "config";

export type RelationshipType =
  | "imports" | "exports" | "calls" | "extends" | "implements"
  | "depends_on" | "owned_by" | "belongs_to" | "connected_to" | "used_by";

export type ArchitecturalLayer =
  | "presentation" | "orchestration" | "connector" | "engine"
  | "utility" | "type_definition" | "test" | "config" | "unknown";

// ── Architectural Entity ──────────────────────────────────────────────────────

export interface ArchEntity {
  id:              string;
  name:            string;
  type:            EntityType;
  layer:           ArchitecturalLayer;
  filePath:        string;
  description:     string;
  responsibilities: string[];
  exports:         string[];
  imports:         string[];
  dependencies:    string[];   // entity IDs
  dependents:      string[];   // entity IDs
  confidence:      number;
  repo:            string;
  branch:          string;
  commit:          string | null;
  lineCount:       number;
  updatedAt:       number;
}

// ── Relationship ──────────────────────────────────────────────────────────────

export interface ArchRelationship {
  id:         string;
  fromId:     string;   // entity ID
  toId:       string;   // entity ID
  fromName:   string;
  toName:     string;
  type:       RelationshipType;
  filePath:   string;
  confidence: number;
}

// ── Module Node ───────────────────────────────────────────────────────────────

export interface ModuleNode {
  moduleId:    string;
  name:        string;
  path:        string;
  layer:       ArchitecturalLayer;
  entityIds:   string[];
  dependsOn:   string[];   // moduleIds
  usedBy:      string[];   // moduleIds
  fileCount:   number;
  entityCount: number;
}

// ── Project Knowledge Graph ───────────────────────────────────────────────────

export interface ProjectKnowledgeGraph {
  graphId:       string;
  owner:         string;
  repo:          string;
  branch:        string;
  commit:        string | null;
  entities:      ArchEntity[];
  relationships: ArchRelationship[];
  modules:       ModuleNode[];
  layers:        Record<ArchitecturalLayer, string[]>;  // layer -> entityIds
  circularDeps:  string[][];   // cycles as entity name lists
  deadCode:      string[];     // entity names with no dependents
  coverage:      number;       // 0–1
  entityCount:   number;
  relationshipCount: number;
  builtAt:       number;
  durationMs:    number;
}

// ── Knowledge Query Result ────────────────────────────────────────────────────

export interface KnowledgeQueryResult {
  found:       boolean;
  entityName:  string;
  entity:      ArchEntity | null;
  dependents:  ArchEntity[];
  dependencies: ArchEntity[];
  relationships: ArchRelationship[];
  source:      "knowledge_graph" | "not_found";
  confidence:  number;
}

export function makePKBId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}