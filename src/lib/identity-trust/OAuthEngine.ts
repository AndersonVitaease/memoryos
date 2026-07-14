/**
 * OAuthEngine.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Extensible OAuth orchestration engine.
 * Supports: Authorization Code · Authorization Code + PKCE ·
 *           Client Credentials · Device Authorization · Refresh Token
 *
 * Architecture is provider-agnostic — flows are dispatched to IOAuthProvider
 * instances registered in ProviderRegistry. No concrete provider logic here.
 *
 * SRP: flow orchestration + PKCE challenge generation — nothing else.
 */

import type { OAuthFlow, GrantType, AuthRequest, AuthResult, TenantContext } from './ITPTypes';
import type { IOAuthProvider } from './IOAuthProvider';
import { ProviderRegistry } from './ProviderRegistry';
import { IdentityEventBus } from './IdentityEventBus';

// ─── Flow Metadata ────────────────────────────────────────────────────────────

export interface FlowDescriptor {
  flow:       OAuthFlow;
  grantType:  GrantType;
  supportsPKCE: boolean;
  requiresRedirect: boolean;
  requiresUserInteraction: boolean;
  description: string;
}

export const FLOW_DESCRIPTORS: Record<OAuthFlow, FlowDescriptor> = {
  authorization_code: {
    flow:      'authorization_code',
    grantType: 'authorization_code',
    supportsPKCE: false,
    requiresRedirect: true,
    requiresUserInteraction: true,
    description: 'Standard OAuth 2.0 Authorization Code flow — server-side apps.',
  },
  authorization_code_pkce: {
    flow:      'authorization_code_pkce',
    grantType: 'authorization_code',
    supportsPKCE: true,
    requiresRedirect: true,
    requiresUserInteraction: true,
    description: 'Authorization Code + PKCE — SPAs and mobile apps (recommended).',
  },
  client_credentials: {
    flow:      'client_credentials',
    grantType: 'client_credentials',
    supportsPKCE: false,
    requiresRedirect: false,
    requiresUserInteraction: false,
    description: 'Machine-to-machine flows — no user interaction required.',
  },
  device_authorization: {
    flow:      'device_authorization',
    grantType: 'urn:ietf:params:oauth:grant-type:device_code',
    supportsPKCE: false,
    requiresRedirect: false,
    requiresUserInteraction: true,
    description: 'Device Authorization Grant — headless devices and CLIs.',
  },
  refresh_token: {
    flow:      'refresh_token',
    grantType: 'refresh_token',
    supportsPKCE: false,
    requiresRedirect: false,
    requiresUserInteraction: false,
    description: 'Refresh Token flow — silent token renewal.',
  },
};

// ─── PKCE Helper ─────────────────────────────────────────────────────────────

export interface PKCEChallenge {
  codeVerifier:  string;
  codeChallenge: string;
  method:        'S256';
}

/** Generates a PKCE verifier + challenge pair (SHA-256 if available, plain fallback). */
export async function generatePKCEChallenge(): Promise<PKCEChallenge> {
  const array = new Uint8Array(32);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256);
  }

  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  let challenge = verifier;
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const enc  = new TextEncoder().encode(verifier);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', enc);
    challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  return { codeVerifier: verifier, codeChallenge: challenge, method: 'S256' };
}

// ─── OAuthEngine ─────────────────────────────────────────────────────────────

export interface EngineAuthRequest extends AuthRequest {
  correlationId?: string;
  requestId?:     string;
}

export class OAuthEngine {
  /**
   * Dispatches an authentication request to the correct provider.
   * Validates flow support before delegating. Emits identity events.
   */
  static async authenticate(request: EngineAuthRequest): Promise<AuthResult> {
    const provider = ProviderRegistry.get(request.providerId);
    const descriptor = FLOW_DESCRIPTORS[request.flow];

    if (!provider.supports(request.flow, descriptor.grantType)) {
      const err = `Provider "${request.providerId}" does not support flow "${request.flow}"`;
      IdentityEventBus.emit({
        eventType:      'AUTH_FAILED',
        providerId:     request.providerId,
        connectionId:   '',
        organizationId: request.tenant.organizationId,
        actor:          request.tenant.userId,
        requestId:      request.requestId,
        correlationId:  request.correlationId,
        payload:        { error: err, flow: request.flow },
        status:         'FAILURE',
      });
      return {
        success:      false,
        connectionId: '',
        providerId:   request.providerId,
        tenant:       request.tenant,
        scopes:       [],
        expiresAt:    new Date().toISOString(),
        error:        err,
        tokenRef:     '',
      };
    }

    IdentityEventBus.emit({
      eventType:      'AUTH_STARTED',
      providerId:     request.providerId,
      connectionId:   '',
      organizationId: request.tenant.organizationId,
      actor:          request.tenant.userId,
      requestId:      request.requestId,
      correlationId:  request.correlationId,
      payload:        { flow: request.flow, scopes: request.scopes },
      status:         'PENDING',
    });

    const result = await provider.authenticate(request);

    IdentityEventBus.emit({
      eventType:      result.success ? 'AUTH_COMPLETED' : 'AUTH_FAILED',
      providerId:     request.providerId,
      connectionId:   result.connectionId,
      organizationId: request.tenant.organizationId,
      actor:          request.tenant.userId,
      requestId:      request.requestId,
      correlationId:  request.correlationId,
      payload:        { flow: request.flow, scopes: result.scopes, error: result.error },
      status:         result.success ? 'SUCCESS' : 'FAILURE',
    });

    return result;
  }

  /** Returns all registered flows and their descriptors. */
  static listFlows(): FlowDescriptor[] {
    return Object.values(FLOW_DESCRIPTORS);
  }

  /** Returns the descriptor for a specific flow. */
  static getFlowDescriptor(flow: OAuthFlow): FlowDescriptor {
    return FLOW_DESCRIPTORS[flow];
  }

  /** Returns flows supported by a specific provider. */
  static getSupportedFlows(providerId: string): FlowDescriptor[] {
    const provider = ProviderRegistry.get(providerId);
    return Object.values(FLOW_DESCRIPTORS).filter((d) =>
      provider.supports(d.flow, d.grantType)
    );
  }

  static health(): { status: 'ok'; flows: number; registeredProviders: number } {
    return {
      status:             'ok',
      flows:              Object.keys(FLOW_DESCRIPTORS).length,
      registeredProviders: ProviderRegistry.count(),
    };
  }
}