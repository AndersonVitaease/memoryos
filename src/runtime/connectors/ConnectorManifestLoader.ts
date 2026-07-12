/**
 * ConnectorManifestLoader.ts
 * Loads, validates and caches connector manifests.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorManifest } from './interfaces/IConnectorManifest';
import type { ConnectorValidationResult, ValidationError, ValidationWarning } from './interfaces/IConnector';

interface ManifestEntry {
  readonly manifest: IConnectorManifest;
  readonly loadedAt: string;
  readonly validationResult: ConnectorValidationResult;
}

export class ConnectorManifestLoader {
  private readonly manifests = new Map<string, ManifestEntry>();
  private loadCount = 0;
  private validationFailureCount = 0;

  load(manifest: IConnectorManifest): ConnectorValidationResult {
    this.loadCount++;
    const result = this.validate(manifest);

    if (result.valid) {
      this.manifests.set(manifest.id, {
        manifest,
        loadedAt: new Date().toISOString(),
        validationResult: result,
      });
    } else {
      this.validationFailureCount++;
    }

    return result;
  }

  get(connectorId: string): IConnectorManifest | null {
    return this.manifests.get(connectorId)?.manifest ?? null;
  }

  has(connectorId: string): boolean {
    return this.manifests.has(connectorId);
  }

  unload(connectorId: string): boolean {
    return this.manifests.delete(connectorId);
  }

  listIds(): string[] {
    return Array.from(this.manifests.keys());
  }

  validate(manifest: IConnectorManifest): ConnectorValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required identity fields
    if (!manifest.id || manifest.id.trim().length === 0) {
      errors.push({ field: 'id', code: 'MISSING_ID', message: 'Connector id is required' });
    }
    if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      errors.push({ field: 'version', code: 'INVALID_VERSION', message: 'Version must be semver (X.Y.Z)' });
    }
    if (!manifest.name || manifest.name.trim().length === 0) {
      errors.push({ field: 'name', code: 'MISSING_NAME', message: 'Connector name is required' });
    }
    if (manifest.schemaVersion !== 1) {
      errors.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: `Schema version ${manifest.schemaVersion} is not supported` });
    }

    // Auth
    if (!manifest.auth?.type) {
      errors.push({ field: 'auth.type', code: 'MISSING_AUTH_TYPE', message: 'Auth type is required' });
    }
    if (manifest.auth?.type === 'oauth2' && !manifest.auth.oauth2) {
      errors.push({ field: 'auth.oauth2', code: 'MISSING_OAUTH2_CONFIG', message: 'OAuth2 config required when auth type is oauth2' });
    }
    if (manifest.auth?.type === 'apikey' && !manifest.auth.apikey) {
      errors.push({ field: 'auth.apikey', code: 'MISSING_APIKEY_CONFIG', message: 'ApiKey config required when auth type is apikey' });
    }

    // Health check
    if (manifest.healthCheck) {
      if (manifest.healthCheck.timeoutMs > 100) {
        errors.push({ field: 'healthCheck.timeoutMs', code: 'HEALTH_CHECK_TIMEOUT_TOO_HIGH', message: 'Health check timeout must be <= 100ms (Constitution O-02)' });
      }
    } else {
      errors.push({ field: 'healthCheck', code: 'MISSING_HEALTH_CHECK', message: 'Health check spec is required' });
    }

    // Retry policy
    if (manifest.retryPolicy) {
      const retryOn = new Set(manifest.retryPolicy.retryOnStatusCodes);
      const dontRetryOn = new Set(manifest.retryPolicy.dontRetryOnStatusCodes);
      const overlap = [...retryOn].filter(c => dontRetryOn.has(c));
      if (overlap.length > 0) {
        errors.push({ field: 'retryPolicy', code: 'RETRY_POLICY_CONFLICT', message: `Status codes appear in both retryOn and dontRetryOn: ${overlap.join(', ')}` });
      }
      if (manifest.retryPolicy.maxAttempts < 0 || manifest.retryPolicy.maxAttempts > 10) {
        errors.push({ field: 'retryPolicy.maxAttempts', code: 'INVALID_MAX_ATTEMPTS', message: 'maxAttempts must be 0-10' });
      }
    }

    // Timeout
    if (!manifest.timeoutMs || manifest.timeoutMs <= 0) {
      errors.push({ field: 'timeoutMs', code: 'INVALID_TIMEOUT', message: 'timeoutMs must be > 0' });
    }

    // Webhooks — signature verification
    for (const wh of manifest.webhooks ?? []) {
      if (!wh.signatureVerification.enabled) {
        warnings.push({ field: `webhooks[${wh.id}].signatureVerification`, code: 'WEBHOOK_SIGNATURE_DISABLED', message: 'Webhook signature verification is disabled — not recommended for production' });
      }
    }

    // Telemetry sensitive fields
    if (!manifest.telemetry?.sensitiveFields || manifest.telemetry.sensitiveFields.length === 0) {
      warnings.push({ field: 'telemetry.sensitiveFields', code: 'NO_SENSITIVE_FIELDS_DECLARED', message: 'Consider declaring sensitive fields to prevent PII leakage in logs' });
    }

    return {
      valid: errors.length === 0,
      connectorId: manifest.id,
      errors,
      warnings,
      checkedAt: new Date().toISOString(),
    };
  }

  statistics() {
    return {
      loadedManifestCount: this.manifests.size,
      loadCount: this.loadCount,
      validationFailureCount: this.validationFailureCount,
    };
  }
}