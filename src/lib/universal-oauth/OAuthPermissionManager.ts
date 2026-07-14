/**
 * OAuthPermissionManager.ts — Sprint 6.4.0
 * Maps service-level permissions to OAuth scopes per provider.
 */

import type { OAuthPermissionMap, OAuthProviderName } from "./OAuthTypes";

const BUILT_IN_PERMISSIONS: OAuthPermissionMap[] = [
  // Google services
  { provider: "google", service: "calendar",    scopes: ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.readonly"],   required: false },
  { provider: "google", service: "gmail",        scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],    required: false },
  { provider: "google", service: "drive",        scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/drive.readonly"],         required: false },
  { provider: "google", service: "tasks",        scopes: ["https://www.googleapis.com/auth/tasks", "https://www.googleapis.com/auth/tasks.readonly"],         required: false },
  { provider: "google", service: "identity",     scopes: ["openid", "email", "profile"],                                                                      required: true  },
  // Microsoft services
  { provider: "microsoft", service: "calendar",  scopes: ["https://graph.microsoft.com/Calendars.ReadWrite"],   required: false },
  { provider: "microsoft", service: "mail",       scopes: ["https://graph.microsoft.com/Mail.ReadWrite"],        required: false },
  { provider: "microsoft", service: "drive",      scopes: ["https://graph.microsoft.com/Files.ReadWrite"],       required: false },
  { provider: "microsoft", service: "identity",   scopes: ["openid", "email", "profile"],                        required: true  },
  // Slack
  { provider: "slack", service: "messaging",     scopes: ["channels:read", "chat:write"],                       required: false },
  { provider: "slack", service: "files",          scopes: ["files:read", "files:write"],                         required: false },
  // GitHub
  { provider: "github", service: "repositories", scopes: ["repo", "read:user"],                                 required: false },
  { provider: "github", service: "identity",      scopes: ["read:user", "user:email"],                           required: false },
  // Notion
  { provider: "notion", service: "content",       scopes: ["read_content", "insert_content"],                   required: false },
  // Dropbox
  { provider: "dropbox", service: "files",        scopes: ["files.content.read", "files.content.write"],        required: false },
  // HubSpot
  { provider: "hubspot", service: "crm",          scopes: ["contacts", "crm.objects.contacts.read"],            required: false },
];

export class OAuthPermissionManager {
  private _permissions: OAuthPermissionMap[] = [...BUILT_IN_PERMISSIONS];
  private _sessionGrants: Map<string, OAuthPermissionMap[]> = new Map();

  register(map: OAuthPermissionMap): void {
    this._permissions.push(map);
  }

  getPermissions(provider: OAuthProviderName, service?: string): OAuthPermissionMap[] {
    return this._permissions.filter(p =>
      p.provider === provider && (!service || p.service === service)
    );
  }

  getScopesForService(provider: OAuthProviderName, service: string): string[] {
    const perms = this._permissions.filter(p => p.provider === provider && p.service === service);
    return [...new Set(perms.flatMap(p => p.scopes))];
  }

  validateSession(sessionId: string, grantedScopes: string[]): {
    valid: boolean;
    missingRequired: string[];
    coveredServices: string[];
  } {
    const grantedSet = new Set(grantedScopes);
    const required = this._permissions.filter(p => p.required);
    const missingRequired: string[] = [];

    for (const perm of required) {
      const missing = perm.scopes.filter(s => !grantedSet.has(s));
      missingRequired.push(...missing);
    }

    const coveredServices = this._permissions
      .filter(p => p.scopes.every(s => grantedSet.has(s)))
      .map(p => `${p.provider}:${p.service}`);

    return {
      valid: missingRequired.length === 0,
      missingRequired: [...new Set(missingRequired)],
      coveredServices: [...new Set(coveredServices)],
    };
  }

  allPermissions(): OAuthPermissionMap[] { return [...this._permissions]; }
  permissionCount(): number { return this._permissions.length; }
}