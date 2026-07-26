/**
 * CapabilityBootstrap.ts — Phase 1 Integration
 *
 * SRP: discover, instantiate, validate, and register all official capabilities.
 *      Mirrors ConnectorBootstrap pattern for capability-level orchestration.
 *
 * v1.0 launches with:
 *   - GoogleDriveReadCapability (read-01)
 *   - GoogleDriveDownloadCapability (read-02)
 *   - GoogleDriveSummarizeCapability (read-03)
 *   - GoogleDriveExtractCapability (read-04)
 *   - GitHubReadCapability (reference)
 *   - Base44InfoCapability (reference)
 *
 * Later phases (v1.1+) will add:
 *   - GoogleDriveListCapabilities (nav-01, nav-02)
 *   - And others per roadmap
 */

import type { CapabilityRuntime } from "./CapabilityRuntime";
import type { ICapability } from "./ICapability";
import { GoogleDriveReadCapability } from "./capabilities/GoogleDriveReadCapability";
import { GoogleDriveDownloadCapability } from "./capabilities/GoogleDriveDownloadCapability";
import { GoogleDriveSummarizeCapability } from "./capabilities/GoogleDriveSummarizeCapability";
import { GoogleDriveExtractCapability } from "./capabilities/GoogleDriveExtractCapability";
import { GoogleDriveMoveCapability } from "./capabilities/GoogleDriveMoveCapability";
import { GoogleDriveUploadCapability } from "./capabilities/GoogleDriveUploadCapability";
import { GoogleDriveDeleteCapability } from "./capabilities/GoogleDriveDeleteCapability";
import { GoogleDriveCreateFolderCapability } from "./capabilities/GoogleDriveCreateFolderCapability";
import { GoogleDriveRenameCapability } from "./capabilities/GoogleDriveRenameCapability";
import { GoogleDriveCopyCapability } from "./capabilities/GoogleDriveCopyCapability";
import { GitHubReadCapability } from "./capabilities/GitHubReadCapability";
import { Base44InfoCapability } from "./capabilities/Base44InfoCapability";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CapabilityBootstrapResult {
  readonly capabilitiesLoaded: number;
  readonly bootstrapTimeMs: number;
  readonly errors: readonly string[];
  readonly capabilityIds: readonly string[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates that a capability implements ICapability correctly.
 * Returns null if valid, error message if invalid.
 */
function validateCapability(cap: ICapability): string | null {
  if (!cap.id || typeof cap.id !== "string" || cap.id.trim() === "") {
    return "capability id is missing or empty";
  }

  if (typeof cap.metadata !== "function") {
    return `[${cap.id}] metadata() is not a function`;
  }

  if (typeof cap.validate !== "function") {
    return `[${cap.id}] validate() is not a function`;
  }

  if (typeof cap.initialize !== "function") {
    return `[${cap.id}] initialize() is not a function`;
  }

  if (typeof cap.shutdown !== "function") {
    return `[${cap.id}] shutdown() is not a function`;
  }

  if (typeof cap.execute !== "function") {
    return `[${cap.id}] execute() is not a function`;
  }

  try {
    const meta = cap.metadata();
    if (!meta?.id || typeof meta.id !== "string") {
      return `[${cap.id}] metadata().id must be a non-empty string`;
    }
    if (!meta?.operations || !Array.isArray(meta.operations)) {
      return `[${cap.id}] metadata().operations must be a string[]`;
    }
    if (meta.operations.length === 0) {
      return `[${cap.id}] metadata().operations is empty`;
    }
  } catch (e) {
    return `[${cap.id}] metadata() threw: ${(e as Error).message}`;
  }

  if (!cap.validate()) {
    return `[${cap.id}] validate() returned false`;
  }

  return null;
}

// ─── Official capability factories ────────────────────────────────────────────

type CapabilityFactory = () => ICapability | Promise<ICapability>;

/**
 * OFFICIAL_FACTORIES defines all capabilities officially supported in v1.0+.
 * SRP: Add new capabilities here ONLY. No other file changes required.
 *
 * Phase 1 (v1.0): read-01, read-02, read-03, read-04, org-02, plus reference implementations
 * Future: nav-01, nav-02, search-01, search-02, ... (per roadmap)
 */
const OFFICIAL_FACTORIES: CapabilityFactory[] = [
  // ─── Phase 1 Delivery ─────────────────────────────────────────────────────
  // read-01: Ler metadados de arquivo
  () => new GoogleDriveReadCapability(),
  // read-02: Baixar arquivo
  () => new GoogleDriveDownloadCapability(),
  // read-03: Resumir documento
  () => new GoogleDriveSummarizeCapability(),
  // read-04: Extrair seções
  () => new GoogleDriveExtractCapability(),
  // org-02: Mover arquivo para pasta
  () => new GoogleDriveMoveCapability(),
  // upload-01: Upload de arquivo
  () => new GoogleDriveUploadCapability(),
  // delete-01: Deletar arquivo
  () => new GoogleDriveDeleteCapability(),
  // create-folder-01: Criar pasta
  () => new GoogleDriveCreateFolderCapability(),
  // rename-01: Renomear arquivo
  () => new GoogleDriveRenameCapability(),
  // copy-01: Duplicar arquivo
  () => new GoogleDriveCopyCapability(),

  // ─── Reference implementations ───────────────────────────────────────────────
  // These demonstrate the capability pattern for other capabilities.
  () => new GitHubReadCapability(),
  () => new Base44InfoCapability(),
];

// ─── CapabilityBootstrap ──────────────────────────────────────────────────────

export const CapabilityBootstrap = Object.freeze({
  /**
   * Discovers, validates, initializes, and registers all official capabilities.
   *
   * Process:
   *   1. For each factory:
   *      a. Create capability instance
   *      b. Validate against ICapability interface
   *      c. Call initialize() to set up state
   *      d. Register in CapabilityRuntime
   *
   * Never aborts on a single capability failure — continues with remaining.
   * Returns an immutable CapabilityBootstrapResult.
   *
   * [RUNTIME-PROBE][CAP-BS-01] Fired when bootstrap begins.
   * [RUNTIME-PROBE][CAP-BS-02] Fired when each capability is registered.
   * [RUNTIME-PROBE][CAP-BS-03] Fired when bootstrap completes.
   */
  async bootstrap(runtime: CapabilityRuntime): Promise<CapabilityBootstrapResult> {
    const t0 = Date.now();
    const errors: string[] = [];
    const loadedIds: string[] = [];

    // [RUNTIME-PROBE][CAP-BS-01] CapabilityBootstrap.bootstrap() started
    console.log("[RUNTIME-PROBE][CAP-BS-01]", {
      probe: "capability_bootstrap:started",
      t: performance.now(),
      ts: Date.now(),
      factoryCount: OFFICIAL_FACTORIES.length,
      runtimeCapabilities: runtime.all().length,
      note: "Capabilities are now loading before any request arrives.",
    });

    for (const factory of OFFICIAL_FACTORIES) {
      let capability: ICapability | null = null;

      // Factory invocation
      try {
        capability = await factory();
      } catch (e) {
        errors.push(`Factory failed: ${(e as Error).message}`);
        continue;
      }

      if (!capability) {
        errors.push("Factory returned null or undefined");
        continue;
      }

      // Validation
      const err = validateCapability(capability);
      if (err) {
        errors.push(`Validation failed — ${err}`);
        continue;
      }

      // Initialization
      try {
        await capability.initialize();
      } catch (e) {
        errors.push(`[${capability.id}] initialize() threw: ${(e as Error).message}`);
        continue;
      }

      // Registration
      try {
        runtime.register(capability);
        loadedIds.push(capability.id);

        // [RUNTIME-PROBE][CAP-BS-02] Capability registered and initialized
        console.log("[RUNTIME-PROBE][CAP-BS-02]", {
          probe: "capability_bootstrap:registered",
          t: performance.now(),
          ts: Date.now(),
          capabilityId: capability.id,
          version: capability.metadata().version,
          operations: capability.metadata().operations,
          runtimeCapabilitiesNow: runtime.all().length,
          allRegistered: loadedIds.slice(),
          note: "Capability is now available to PlanningEngine and RuntimeEngine.",
        });
      } catch (e) {
        errors.push(`[${capability.id}] registry.register() threw: ${(e as Error).message}`);
      }
    }

    const bootstrapTimeMs = Date.now() - t0;

    // [RUNTIME-PROBE][CAP-BS-03] CapabilityBootstrap.bootstrap() complete
    console.log("[RUNTIME-PROBE][CAP-BS-03]", {
      probe: "capability_bootstrap:complete",
      t: performance.now(),
      ts: Date.now(),
      capabilitiesLoaded: loadedIds.length,
      capabilityIds: loadedIds.slice(),
      errors: errors.slice(),
      bootstrapTimeMs,
      note: loadedIds.length === 0
        ? "⚠️ No capabilities loaded — runtime has no capabilities!"
        : `✅ ${loadedIds.length} capabilities ready for planning and execution`,
    });

    return Object.freeze({
      capabilitiesLoaded: loadedIds.length,
      bootstrapTimeMs,
      errors: Object.freeze(errors),
      capabilityIds: Object.freeze(loadedIds),
    });
  },
});
