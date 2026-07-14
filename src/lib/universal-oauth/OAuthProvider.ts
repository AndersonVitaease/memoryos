/**
 * OAuthProvider.ts — Sprint 6.4.0
 * Built-in provider configurations for all supported OAuth providers.
 */

import type { OAuthProviderConfig, OAuthProviderName } from "./OAuthTypes";

export const OAUTH_PROVIDERS: Record<OAuthProviderName, OAuthProviderConfig> = {
  google: {
    name: "google",
    displayName: "Google",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl:         "https://oauth2.googleapis.com/token",
    refreshUrl:       "https://oauth2.googleapis.com/token",
    userInfoUrl:      "https://www.googleapis.com/oauth2/v2/userinfo",
    supportedScopes: [
      "openid", "email", "profile",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/tasks",
      "https://www.googleapis.com/auth/tasks.readonly",
    ],
    supportedGrants: ["authorization_code", "refresh_token"],
    supportsRefresh: true,
    supportsRevoke:  true,
    iconEmoji: "🔵",
    color: "blue",
  },
  microsoft: {
    name: "microsoft",
    displayName: "Microsoft",
    authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl:         "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshUrl:       "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl:      "https://graph.microsoft.com/v1.0/me",
    supportedScopes: [
      "openid", "email", "profile", "offline_access",
      "https://graph.microsoft.com/Calendars.ReadWrite",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/Files.ReadWrite",
      "https://graph.microsoft.com/User.Read",
    ],
    supportedGrants: ["authorization_code", "refresh_token"],
    supportsRefresh: true,
    supportsRevoke:  false,
    iconEmoji: "🟦",
    color: "blue",
  },
  slack: {
    name: "slack",
    displayName: "Slack",
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl:         "https://slack.com/api/oauth.v2.access",
    refreshUrl:       "https://slack.com/api/oauth.v2.access",
    userInfoUrl:      "https://slack.com/api/users.identity",
    supportedScopes: [
      "channels:read", "channels:write", "chat:write",
      "users:read", "files:read", "files:write",
    ],
    supportedGrants: ["authorization_code"],
    supportsRefresh: false,
    supportsRevoke:  true,
    iconEmoji: "💬",
    color: "green",
  },
  notion: {
    name: "notion",
    displayName: "Notion",
    authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl:         "https://api.notion.com/v1/oauth/token",
    refreshUrl:       "https://api.notion.com/v1/oauth/token",
    userInfoUrl:      "https://api.notion.com/v1/users/me",
    supportedScopes: ["read_content", "insert_content", "update_content", "read_user_with_email"],
    supportedGrants: ["authorization_code"],
    supportsRefresh: false,
    supportsRevoke:  false,
    iconEmoji: "📝",
    color: "gray",
  },
  dropbox: {
    name: "dropbox",
    displayName: "Dropbox",
    authorizationUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl:         "https://api.dropboxapi.com/oauth2/token",
    refreshUrl:       "https://api.dropboxapi.com/oauth2/token",
    userInfoUrl:      "https://api.dropboxapi.com/2/users/get_current_account",
    supportedScopes: [
      "account_info.read", "files.content.read",
      "files.content.write", "files.metadata.read", "sharing.read",
    ],
    supportedGrants: ["authorization_code", "refresh_token"],
    supportsRefresh: true,
    supportsRevoke:  true,
    iconEmoji: "📦",
    color: "blue",
  },
  hubspot: {
    name: "hubspot",
    displayName: "HubSpot",
    authorizationUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl:         "https://api.hubapi.com/oauth/v1/token",
    refreshUrl:       "https://api.hubapi.com/oauth/v1/token",
    userInfoUrl:      "https://api.hubapi.com/oauth/v1/access-tokens",
    supportedScopes: [
      "contacts", "crm.objects.contacts.read",
      "crm.objects.deals.read", "crm.objects.companies.read",
    ],
    supportedGrants: ["authorization_code", "refresh_token"],
    supportsRefresh: true,
    supportsRevoke:  false,
    iconEmoji: "🟠",
    color: "orange",
  },
  meta: {
    name: "meta",
    displayName: "Meta",
    authorizationUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl:         "https://graph.facebook.com/v18.0/oauth/access_token",
    refreshUrl:       "https://graph.facebook.com/v18.0/oauth/access_token",
    userInfoUrl:      "https://graph.facebook.com/me",
    supportedScopes: [
      "email", "public_profile",
      "pages_read_engagement", "pages_manage_posts",
      "ads_read",
    ],
    supportedGrants: ["authorization_code"],
    supportsRefresh: false,
    supportsRevoke:  true,
    iconEmoji: "🔷",
    color: "blue",
  },
  github: {
    name: "github",
    displayName: "GitHub",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl:         "https://github.com/login/oauth/access_token",
    refreshUrl:       "https://github.com/login/oauth/access_token",
    userInfoUrl:      "https://api.github.com/user",
    supportedScopes: [
      "repo", "repo:status", "read:user", "user:email",
      "read:org", "workflow",
    ],
    supportedGrants: ["authorization_code"],
    supportsRefresh: false,
    supportsRevoke:  true,
    iconEmoji: "⚫",
    color: "gray",
  },
};

export function getProvider(name: OAuthProviderName): OAuthProviderConfig {
  const p = OAUTH_PROVIDERS[name];
  if (!p) throw new Error(`Unknown OAuth provider: ${name}`);
  return p;
}

export function listProviders(): OAuthProviderConfig[] {
  return Object.values(OAUTH_PROVIDERS);
}