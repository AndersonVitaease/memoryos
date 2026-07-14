/**
 * ProfileCapability.ts
 * Sprint 6.4.2 — Google Workspace Reference Connector
 *
 * Google Profile capability — account and connection introspection.
 * NO OAuth logic. NO token management.
 * SRP: Profile operations only.
 */

import type { ConnectorOperation, ConnectorCapability } from '../../../connector-runtime-v2/UCRTypes';
import type { GWOperationInput, GWOperationOutput } from '../GWTypes';
import { GW_OPERATIONS } from '../GWTypes';

export const PROFILE_CAPABILITIES: ConnectorCapability[] = ['READ_CONTACTS'];

export const PROFILE_OPERATIONS: ConnectorOperation[] = [
  {
    id:           GW_OPERATIONS.PROFILE_READ,
    name:         'Read Profile',
    description:  'Returns the authenticated user profile.',
    capability:   'READ_CONTACTS',
    inputSchema:  {},
    outputSchema: { item: 'GWProfile' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.PROFILE_READ_ACCOUNT,
    name:         'Read Account',
    description:  'Returns Google Workspace account information.',
    capability:   'READ_CONTACTS',
    inputSchema:  {},
    outputSchema: { item: 'GWAccount' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.PROFILE_READ_SCOPES,
    name:         'Read Scopes',
    description:  'Returns all granted OAuth scopes for the connection.',
    capability:   'READ_CONTACTS',
    inputSchema:  {},
    outputSchema: { items: 'string[]', total: 'number' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.PROFILE_CONNECTION,
    name:         'Read Connection Info',
    description:  'Returns runtime metadata for the current connection.',
    capability:   'READ_CONTACTS',
    inputSchema:  {},
    outputSchema: { item: 'GWConnectionInfo' },
    requiresAuth: true,
  },
];

export class ProfileCapability {
  async execute(operationId: string, input: GWOperationInput, connectionId?: string): Promise<GWOperationOutput> {
    switch (operationId) {
      case GW_OPERATIONS.PROFILE_READ:         return this._readProfile(connectionId);
      case GW_OPERATIONS.PROFILE_READ_ACCOUNT: return this._readAccount(connectionId);
      case GW_OPERATIONS.PROFILE_READ_SCOPES:  return this._readScopes(connectionId);
      case GW_OPERATIONS.PROFILE_CONNECTION:   return this._readConnectionInfo(connectionId);
      default:
        throw new Error(`[ProfileCapability] Unknown operationId: ${operationId}`);
    }
  }

  private async _readProfile(connectionId?: string): Promise<GWOperationOutput> {
    await tick();
    return {
      item: {
        id:          `user-${connectionId}`,
        email:       `user@gmail.com`,
        displayName: 'Google Workspace User',
        avatarUrl:   '',
        locale:      'en-US',
        domain:      'gmail.com',
      },
    };
  }

  private async _readAccount(connectionId?: string): Promise<GWOperationOutput> {
    await tick();
    return {
      item: {
        accountId:   `acc-${connectionId}`,
        email:       `user@gmail.com`,
        workspace:   'google.com',
        plan:        'workspace-business',
        isAdmin:     false,
        createdAt:   new Date(Date.now() - 365 * 86_400_000).toISOString(),
      },
    };
  }

  private async _readScopes(_connectionId?: string): Promise<GWOperationOutput> {
    await tick();
    return {
      items: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
        'openid',
      ],
      total: 6,
    };
  }

  private async _readConnectionInfo(connectionId?: string): Promise<GWOperationOutput> {
    await tick();
    return {
      item: {
        connectionId,
        connectorId:  'google-workspace',
        providerId:   'google-workspace',
        status:       'active',
        connectedAt:  new Date(Date.now() - 86_400_000).toISOString(),
        lastActivity: new Date().toISOString(),
        version:      '1.0.0',
      },
    };
  }
}

function tick(): Promise<void> { return new Promise((r) => setTimeout(r, 2)); }