// KnowledgeStoreErrors.ts — Sprint EF-38.0
// All error types for the Universal Knowledge Store

export type KnowledgeStoreErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "VALIDATION_FAILED"
  | "ARCHIVED"
  | "DELETED"
  | "VERSION_CONFLICT"
  | "READ_ONLY"
  | "CAPACITY_EXCEEDED"
  | "UNAVAILABLE"
  | "UNAUTHORIZED"
  | "INVALID_QUERY"
  | "EVIDENCE_MISSING"
  | "CONTENT_EMPTY"
  | "TYPE_INVALID"
  | "UNKNOWN";

export interface KnowledgeStoreError {
  readonly code:      KnowledgeStoreErrorCode;
  readonly message:   string;
  readonly recordId?: string;
  readonly details?:  Record<string, unknown>;
}

export const KnowledgeStoreErrorFactory = {
  notFound(id: string): KnowledgeStoreError {
    return Object.freeze({ code: "NOT_FOUND", message: `Record not found: ${id}`, recordId: id });
  },
  alreadyExists(id: string): KnowledgeStoreError {
    return Object.freeze({ code: "ALREADY_EXISTS", message: `Record already exists: ${id}`, recordId: id });
  },
  validationFailed(message: string, details?: Record<string, unknown>): KnowledgeStoreError {
    return Object.freeze({ code: "VALIDATION_FAILED", message, details });
  },
  archived(id: string): KnowledgeStoreError {
    return Object.freeze({ code: "ARCHIVED", message: `Record is archived: ${id}`, recordId: id });
  },
  deleted(id: string): KnowledgeStoreError {
    return Object.freeze({ code: "DELETED", message: `Record is permanently deleted: ${id}`, recordId: id });
  },
  versionConflict(id: string, expected: number, actual: number): KnowledgeStoreError {
    return Object.freeze({ code: "VERSION_CONFLICT", message: `Version conflict for ${id}: expected ${expected}, actual ${actual}`, recordId: id });
  },
  readOnly(): KnowledgeStoreError {
    return Object.freeze({ code: "READ_ONLY", message: "Store is in read-only mode" });
  },
  capacityExceeded(max: number): KnowledgeStoreError {
    return Object.freeze({ code: "CAPACITY_EXCEEDED", message: `Store capacity exceeded: max ${max} records` });
  },
  unavailable(reason?: string): KnowledgeStoreError {
    return Object.freeze({ code: "UNAVAILABLE", message: reason ?? "Store is unavailable" });
  },
  evidenceMissing(): KnowledgeStoreError {
    return Object.freeze({ code: "EVIDENCE_MISSING", message: "KnowledgeEvidence is required for every record" });
  },
  contentEmpty(): KnowledgeStoreError {
    return Object.freeze({ code: "CONTENT_EMPTY", message: "Record content must not be empty" });
  },
  invalidQuery(reason: string): KnowledgeStoreError {
    return Object.freeze({ code: "INVALID_QUERY", message: `Invalid query: ${reason}` });
  },
  unknown(message: string): KnowledgeStoreError {
    return Object.freeze({ code: "UNKNOWN", message });
  },
};