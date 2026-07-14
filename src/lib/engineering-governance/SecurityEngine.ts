/**
 * SecurityEngine.ts — Sprint 6.2.2
 * Validates security constraints before any implementation.
 */

import type { SecurityCheckResult } from "./GovernanceTypes";

const DANGEROUS_PATTERNS = [
  { pattern: /process\.env\.[A-Z_]+/g,          label: "secrets_exposure" },
  { pattern: /password|secret|api_key|token/gi,  label: "credential_leak" },
  { pattern: /fs\.unlink|fs\.rmdir|rimraf/g,     label: "unsafe_fs" },
  { pattern: /deleteMany\(\s*\{\s*\}\s*\)/g,     label: "unsafe_deletion" },
  { pattern: /overwrite.*production|write.*prod/gi, label: "unsafe_overwrite" },
];

export class SecurityEngine {
  validate(objective: string, targetComponents: string[], connectorNames: string[]): SecurityCheckResult {
    const lower    = objective.toLowerCase();
    const findings: string[] = [];

    // Connector permissions
    const connectorPerms = connectorNames.every(c => ["github", "base44", "GitHubConnector", "Base44Connector", "ConnectorInvocationService"].includes(c));
    if (!connectorPerms) findings.push(`Unrecognized connector(s): ${connectorNames.filter(c => !["github","base44","GitHubConnector","Base44Connector","ConnectorInvocationService"].includes(c)).join(", ")}`);

    // Repository permissions
    const repoPerms = !(/write.*repo|push.*main|force.*push/i.test(objective));
    if (!repoPerms) findings.push("Unsafe repository write operation detected");

    // Protected files check (using objective keywords)
    const protectedFiles = !(/overwrite.*core|replace.*core/i.test(objective));
    if (!protectedFiles) findings.push("Attempt to overwrite Core files detected");

    // Pattern-based checks on objective text
    let secretsExposure  = true;
    let credentialLeak   = true;
    let unsafeFs         = true;
    let unsafeConnector  = !(/unsafe.*connector|bypass.*connector/i.test(objective));
    let unsafeDeletion   = !(/delete all|drop all|wipe all/i.test(objective));
    let unsafeOverwrite  = !(/overwrite.*production/i.test(objective));

    for (const { pattern, label } of DANGEROUS_PATTERNS) {
      if (pattern.test(objective)) {
        switch (label) {
          case "secrets_exposure": secretsExposure = false; findings.push("Potential secrets exposure in objective"); break;
          case "credential_leak":  credentialLeak  = false; findings.push("Potential credential reference detected"); break;
          case "unsafe_fs":        unsafeFs        = false; findings.push("Unsafe filesystem operation detected"); break;
          case "unsafe_deletion":  unsafeDeletion  = false; findings.push("Unsafe deletion operation detected"); break;
          case "unsafe_overwrite": unsafeOverwrite = false; findings.push("Unsafe overwrite to production detected"); break;
        }
      }
    }

    const passed = connectorPerms && repoPerms && protectedFiles &&
      secretsExposure && credentialLeak && unsafeFs && unsafeConnector && unsafeDeletion && unsafeOverwrite;

    return {
      passed, connectorPerms, repoPerms, protectedFiles,
      secretsExposure, credentialLeak, unsafeFs,
      unsafeConnector, unsafeDeletion, unsafeOverwrite,
      findings,
    };
  }
}