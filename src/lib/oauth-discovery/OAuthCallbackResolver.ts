/**
 * OAuthCallbackResolver.ts — Sprint 6.4.1A
 * Resolves and validates OAuth callback parameters from the current URL.
 * Used by the GIP and all future connectors to handle redirects.
 */

export interface CallbackParams {
  code:        string | null;
  state:       string | null;
  error:       string | null;
  errorDesc:   string | null;
  provider:    string | null;
  isCallback:  boolean;
}

export class OAuthCallbackResolver {
  /**
   * Parse OAuth callback params from current URL or a given URL string.
   */
  parse(url?: string): CallbackParams {
    const src = url ?? (typeof window !== "undefined" ? window.location.href : "");
    const qIndex = src.indexOf("?");
    if (qIndex === -1) return this._empty();
    const params = new URLSearchParams(src.slice(qIndex + 1));
    const code  = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    return {
      code,
      state,
      error,
      errorDesc: params.get("error_description"),
      provider:  this._extractProvider(src),
      isCallback: !!(code || error),
    };
  }

  /**
   * Check if the current page is an OAuth callback.
   */
  isCurrentPageCallback(): boolean {
    if (typeof window === "undefined") return false;
    return window.location.pathname.includes("/oauth/callback/") || this.parse().isCallback;
  }

  /**
   * Extract provider name from callback URL path.
   * e.g. /oauth/callback/google → "google"
   */
  private _extractProvider(url: string): string | null {
    const match = url.match(/\/oauth\/callback\/([a-z_]+)/);
    return match ? match[1] : null;
  }

  private _empty(): CallbackParams {
    return { code: null, state: null, error: null, errorDesc: null, provider: null, isCallback: false };
  }
}