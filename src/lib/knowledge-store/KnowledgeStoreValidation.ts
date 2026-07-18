// KnowledgeStoreValidation.ts — Sprint EF-38.0
// All validation rules for KnowledgeStore inputs

import type { KnowledgeRecordDraft, KnowledgeRecordPatch, KnowledgeQuery, KnowledgeSearchQuery } from "./KnowledgeStoreTypes";
import { KnowledgeStoreErrorFactory, type KnowledgeStoreError } from "./KnowledgeStoreErrors";

const VALID_MEMORY_TYPES = new Set([
  "Temporary","Working","LongTerm","Permanent",
  "Procedural","Semantic","Project","Engineering","Business","Personal",
]);

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly KnowledgeStoreError[];
}

export const KnowledgeStoreValidation = {
  validateDraft(draft: KnowledgeRecordDraft): ValidationResult {
    const errors: KnowledgeStoreError[] = [];

    if (!draft.content || draft.content.trim().length === 0) {
      errors.push(KnowledgeStoreErrorFactory.contentEmpty());
    }
    if (!draft.evidence) {
      errors.push(KnowledgeStoreErrorFactory.evidenceMissing());
    } else {
      if (!draft.evidence.source)         errors.push(KnowledgeStoreErrorFactory.validationFailed("evidence.source is required"));
      if (!draft.evidence.conversationId) errors.push(KnowledgeStoreErrorFactory.validationFailed("evidence.conversationId is required"));
      if (!draft.evidence.messageId)      errors.push(KnowledgeStoreErrorFactory.validationFailed("evidence.messageId is required"));
      if (typeof draft.evidence.confidence !== "number" || draft.evidence.confidence < 0 || draft.evidence.confidence > 1) {
        errors.push(KnowledgeStoreErrorFactory.validationFailed("evidence.confidence must be a number between 0 and 1"));
      }
    }
    if (!draft.type || !VALID_MEMORY_TYPES.has(draft.type)) {
      errors.push(KnowledgeStoreErrorFactory.validationFailed(`Invalid memory type: ${draft.type}`));
    }

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  },

  validatePatch(patch: KnowledgeRecordPatch): ValidationResult {
    const errors: KnowledgeStoreError[] = [];
    if (patch.content !== undefined && patch.content.trim().length === 0) {
      errors.push(KnowledgeStoreErrorFactory.contentEmpty());
    }
    const VALID_STATUSES = new Set(["active","archived","deleted","pending"]);
    if (patch.status !== undefined && !VALID_STATUSES.has(patch.status)) {
      errors.push(KnowledgeStoreErrorFactory.validationFailed(`Invalid status: ${patch.status}`));
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  },

  validateQuery(query: KnowledgeQuery): ValidationResult {
    const errors: KnowledgeStoreError[] = [];
    if (query.minConfidence !== undefined && (query.minConfidence < 0 || query.minConfidence > 1)) {
      errors.push(KnowledgeStoreErrorFactory.invalidQuery("minConfidence must be between 0 and 1"));
    }
    if (query.limit !== undefined && query.limit < 1) {
      errors.push(KnowledgeStoreErrorFactory.invalidQuery("limit must be >= 1"));
    }
    if (query.offset !== undefined && query.offset < 0) {
      errors.push(KnowledgeStoreErrorFactory.invalidQuery("offset must be >= 0"));
    }
    if (query.createdAfter !== undefined && query.createdBefore !== undefined &&
        query.createdAfter > query.createdBefore) {
      errors.push(KnowledgeStoreErrorFactory.invalidQuery("createdAfter must be <= createdBefore"));
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  },

  validateSearchQuery(query: KnowledgeSearchQuery): ValidationResult {
    const errors: KnowledgeStoreError[] = [];
    if (!query.text || query.text.trim().length === 0) {
      errors.push(KnowledgeStoreErrorFactory.invalidQuery("search text must not be empty"));
    }
    if (query.limit !== undefined && query.limit < 1) {
      errors.push(KnowledgeStoreErrorFactory.invalidQuery("limit must be >= 1"));
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  },
};