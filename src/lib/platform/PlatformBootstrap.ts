/**
 * PlatformBootstrap.ts
 *
 * Single initialization point for ALL platform registries.
 *
 * Design:
 *   - Called ONCE at application startup (ConversationPipeline constructor or main.jsx).
 *   - Idempotent — safe to call multiple times; executes only once per process lifetime.
 *   - No functional component (Pipeline, Synthesizer, Runtime, Planner) calls bootstrap.
 *   - OCP: adding a new subsystem = one import + one call here. Zero core changes.
 *
 * SRP: sole responsibility is orchestrating startup initialization of all registries.
 */

import { bootstrapConnectorContext } from "@/lib/connector-context/ConnectorContextBootstrap";

// Future subsystem bootstraps — uncomment as they are implemented:
// import { bootstrapGoalRegistry }      from "@/lib/goals/GoalRegistryBootstrap";
// import { bootstrapSemanticRegistry }  from "@/lib/semantic-registry/SemanticRegistryBootstrap";
// import { bootstrapCapabilityRegistry } from "@/lib/capability-registry/CapabilityRegistryBootstrap";

let _initialized = false;

/**
 * Initialize all platform registries.
 * Must be called before any component that depends on registry state.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initializePlatform(): void {
  if (_initialized) return;
  _initialized = true;

  // ── Connector Context Builders ────────────────────────────────────────────
  bootstrapConnectorContext();

  // ── Future subsystems ─────────────────────────────────────────────────────
  // bootstrapGoalRegistry();
  // bootstrapSemanticRegistry();
  // bootstrapCapabilityRegistry();
}

/** Reset for testing purposes only. */
export function _resetPlatform(): void {
  _initialized = false;
}