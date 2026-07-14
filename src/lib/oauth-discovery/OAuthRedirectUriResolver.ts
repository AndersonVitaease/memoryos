/**
 * OAuthRedirectUriResolver.ts — Sprint 6.4.1A
 * Automatically resolves Redirect URIs, Callback URIs, and Authorized Origins
 * from the current runtime environment. No manual configuration required.
 */

export class OAuthRedirectUriResolver {
  private _baseUrl: string;

  constructor() {
    this._baseUrl = this._detectBaseUrl();
  }

  private _detectBaseUrl(): string {
    if (typeof window === "undefined") return "https://app.base44.com";
    const { protocol, hostname, port } = window.location;
    const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
    return `${protocol}//${hostname}${portSuffix}`;
  }

  /**
   * The Redirect URI to register in the OAuth provider's console.
   * This is where the provider sends the user after authorization.
   */
  getRedirectUri(provider: string): string {
    return `${this._baseUrl}/oauth/callback/${provider}`;
  }

  /**
   * The Callback URI — same as redirect in most flows.
   */
  getCallbackUri(provider: string): string {
    return this.getRedirectUri(provider);
  }

  /**
   * Authorized Origins to register in the provider's console.
   */
  getAuthorizedOrigins(): string[] {
    return [
      this._baseUrl,
      // Common Base44 platform origins
      "https://app.base44.com",
      "http://localhost:5173",
      "http://localhost:3000",
    ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate
  }

  /**
   * Full redirect configuration for a provider.
   */
  resolve(provider: string) {
    return {
      provider,
      redirectUri:       this.getRedirectUri(provider),
      callbackUri:       this.getCallbackUri(provider),
      authorizedOrigins: this.getAuthorizedOrigins(),
      callbackPath:      `/oauth/callback/${provider}`,
      redirectPath:      `/oauth/callback/${provider}`,
      baseUrl:           this._baseUrl,
    };
  }

  getBaseUrl(): string { return this._baseUrl; }
}