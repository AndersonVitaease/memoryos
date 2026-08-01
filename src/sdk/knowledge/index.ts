/**
 * MemoryOS Knowledge Package SDK — Public API
 * P3 · Version: 1.0.0
 *
 * This is the ONLY surface Knowledge Package implementors should import from.
 *
 * Usage:
 *   import { BaseKnowledgePackage, KnowledgePackageBuilder } from '@/sdk/knowledge';
 */

export { BaseKnowledgePackage } from "./BaseKnowledgePackage";
export { KnowledgePackageBuilder } from "./KnowledgePackageBuilder";
export type {
  IKnowledgePackage,
  KnowledgePackageManifest,
  KnowledgePackageContent,
  KnowledgeNode,
  KnowledgeEdge,
  OfficialSource,
} from "./IKnowledgePackage";