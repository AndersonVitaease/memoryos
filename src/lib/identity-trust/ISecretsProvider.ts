/**
 * ISecretsProvider.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Abstract interface for secrets backends.
 * ALL secret reads/writes in the platform MUST go through this interface.
 * No concrete implementation contains secrets logic — providers inject this.
 *
 * Supported backends (future): HashiCorp Vault · AWS Secrets Manager ·
 * Azure Key Vault · Google Secret Manager · Local Encrypted Storage
 */

import type { SecretBackend } from './ITPTypes';

export interface SecretMetadata {
  key:         string;
  backend:     SecretBackend;
  createdAt:   string;
  updatedAt:   string;
  expiresAt?:  string;
  version:     number;
  tags:        Record<string, string>;
}

export interface SecretsHealthReport {
  backend:     SecretBackend;
  status:      'healthy' | 'degraded' | 'unavailable';
  latencyMs:   number;
  checkedAt:   string;
  details:     Record<string, unknown>;
}

/**
 * ISecretsProvider — contract every secrets backend must implement.
 * Raw secret values are intentionally typed as string; callers never
 * receive them via public platform APIs — only via this internal contract.
 */
export interface ISecretsProvider {
  readonly backend: SecretBackend;

  /**
   * Stores a secret. Returns an opaque reference (key) for later retrieval.
   * The raw value must never be logged or returned to public callers.
   */
  set(key: string, value: string, metadata?: Partial<SecretMetadata>): Promise<string>;

  /**
   * Retrieves a raw secret value. Access is audited.
   * @internal — must NEVER be called from public-facing APIs.
   */
  get(key: string): Promise<string | null>;

  /**
   * Rotates a secret: stores the new value, invalidates the old one.
   * Returns the new opaque reference key.
   */
  rotate(key: string, newValue: string): Promise<string>;

  /** Permanently deletes a secret. Irreversible. */
  delete(key: string): Promise<boolean>;

  /** Checks whether a secret key exists (does NOT return the value). */
  exists(key: string): Promise<boolean>;

  /** Returns metadata only — never the raw value. */
  getMetadata(key: string): Promise<SecretMetadata | null>;

  /** Health check for the backend. */
  health(): Promise<SecretsHealthReport>;
}

/**
 * InMemorySecretsProvider — reference implementation for tests only.
 * MUST NOT be used in production. Raw tokens are held in memory.
 */
export class InMemorySecretsProvider implements ISecretsProvider {
  readonly backend: SecretBackend = 'memory';
  private readonly _store = new Map<string, { value: string; meta: SecretMetadata }>();

  async set(key: string, value: string, metadata?: Partial<SecretMetadata>): Promise<string> {
    const now = new Date().toISOString();
    const meta: SecretMetadata = {
      key,
      backend:   'memory',
      createdAt: this._store.has(key) ? (this._store.get(key)!.meta.createdAt) : now,
      updatedAt: now,
      version:   (this._store.get(key)?.meta.version ?? 0) + 1,
      tags:      metadata?.tags ?? {},
      ...metadata,
    };
    this._store.set(key, { value, meta });
    return key;
  }

  async get(key: string): Promise<string | null> {
    return this._store.get(key)?.value ?? null;
  }

  async rotate(key: string, newValue: string): Promise<string> {
    return this.set(key, newValue);
  }

  async delete(key: string): Promise<boolean> {
    return this._store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this._store.has(key);
  }

  async getMetadata(key: string): Promise<SecretMetadata | null> {
    return this._store.get(key)?.meta ?? null;
  }

  async health(): Promise<SecretsHealthReport> {
    return {
      backend:   'memory',
      status:    'healthy',
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      details:   { totalKeys: this._store.size },
    };
  }
}