/**
 * GmailCapability.ts
 * Sprint 6.4.2 — Google Workspace Reference Connector
 *
 * Gmail capability — all read/write/search operations.
 * NO OAuth logic. NO token management.
 * Input/output via ConnectorContext — token resolution is done by the Runtime.
 *
 * SRP: Gmail operations only.
 */

import type { ConnectorOperation, ConnectorCapability } from '../../../connector-runtime-v2/UCRTypes';
import type { GWOperationInput, GWOperationOutput, GWEmailMessage, GWLabel } from '../GWTypes';
import { GW_OPERATIONS } from '../GWTypes';

export const GMAIL_CAPABILITIES: ConnectorCapability[] = ['READ_EMAIL', 'SEND_EMAIL', 'SEARCH'];

export const GMAIL_OPERATIONS: ConnectorOperation[] = [
  {
    id:           GW_OPERATIONS.GMAIL_LIST_MESSAGES,
    name:         'List Messages',
    description:  'Lists email messages in the user inbox.',
    capability:   'READ_EMAIL',
    inputSchema:  { maxResults: 'number', pageToken: 'string', labelIds: 'string[]' },
    outputSchema: { items: 'GWEmailMessage[]', nextPage: 'string', total: 'number' },
    requiresAuth: true,
    rateLimit:    { requests: 250, windowMs: 1000 },
  },
  {
    id:           GW_OPERATIONS.GMAIL_GET_MESSAGE,
    name:         'Get Message',
    description:  'Retrieves a full email message by ID.',
    capability:   'READ_EMAIL',
    inputSchema:  { messageId: 'string' },
    outputSchema: { item: 'GWEmailMessage' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.GMAIL_READ_THREAD,
    name:         'Read Thread',
    description:  'Retrieves all messages in an email thread.',
    capability:   'READ_EMAIL',
    inputSchema:  { threadId: 'string' },
    outputSchema: { item: 'GWEmailThread' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.GMAIL_SEND,
    name:         'Send Email',
    description:  'Sends an email from the authenticated account.',
    capability:   'SEND_EMAIL',
    inputSchema:  { to: 'string[]', subject: 'string', body: 'string' },
    outputSchema: { success: 'boolean', item: 'GWEmailMessage' },
    requiresAuth: true,
    rateLimit:    { requests: 100, windowMs: 1000 },
  },
  {
    id:           GW_OPERATIONS.GMAIL_SEARCH,
    name:         'Search Email',
    description:  'Searches messages using Gmail query syntax.',
    capability:   'SEARCH',
    inputSchema:  { query: 'string', maxResults: 'number' },
    outputSchema: { items: 'GWEmailMessage[]', total: 'number' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.GMAIL_LIST_LABELS,
    name:         'List Labels',
    description:  'Returns all labels for the authenticated account.',
    capability:   'READ_EMAIL',
    inputSchema:  {},
    outputSchema: { items: 'GWLabel[]' },
    requiresAuth: true,
  },
];

/**
 * GmailCapability — pure executor, no auth, no state.
 * In production: receives resolved access token from Runtime context
 * and calls https://gmail.googleapis.com/gmail/v1/
 */
export class GmailCapability {
  async execute(operationId: string, input: GWOperationInput): Promise<GWOperationOutput> {
    switch (operationId) {
      case GW_OPERATIONS.GMAIL_LIST_MESSAGES:
        return this._listMessages(input);
      case GW_OPERATIONS.GMAIL_GET_MESSAGE:
        return this._getMessage(input);
      case GW_OPERATIONS.GMAIL_READ_THREAD:
        return this._readThread(input);
      case GW_OPERATIONS.GMAIL_SEND:
        return this._sendEmail(input);
      case GW_OPERATIONS.GMAIL_SEARCH:
        return this._searchEmail(input);
      case GW_OPERATIONS.GMAIL_LIST_LABELS:
        return this._listLabels(input);
      default:
        throw new Error(`[GmailCapability] Unknown operationId: ${operationId}`);
    }
  }

  private async _listMessages(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    const messages = mockMessages(input.maxResults ?? 10);
    return { items: messages, total: messages.length, nextPage: undefined };
  }

  private async _getMessage(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.messageId) throw new Error('[GmailCapability] messageId is required');
    return { item: mockMessage(input.messageId) };
  }

  private async _readThread(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.threadId) throw new Error('[GmailCapability] threadId is required');
    return { item: { id: input.threadId, messages: mockMessages(3), subject: 'Thread Subject' } };
  }

  private async _sendEmail(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.to?.length || !input.subject) throw new Error('[GmailCapability] to and subject are required');
    return { success: true, item: mockMessage('sent-' + Date.now()) };
  }

  private async _searchEmail(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    const messages = mockMessages(Math.min(input.maxResults ?? 5, 50)).filter(() => Math.random() > 0.3);
    return { items: messages, total: messages.length };
  }

  private async _listLabels(_input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    const labels: GWLabel[] = [
      { id: 'INBOX', name: 'Inbox', type: 'system' },
      { id: 'SENT', name: 'Sent', type: 'system' },
      { id: 'TRASH', name: 'Trash', type: 'system' },
      { id: 'SPAM', name: 'Spam', type: 'system' },
      { id: 'label-1', name: 'Work', type: 'user' },
      { id: 'label-2', name: 'Personal', type: 'user' },
    ];
    return { items: labels, total: labels.length };
  }
}

function tick(): Promise<void> { return new Promise((r) => setTimeout(r, 2)); }

function mockMessage(id: string): GWEmailMessage {
  return {
    id, threadId: `thread-${id}`, subject: `Email ${id}`,
    from: 'sender@example.com', to: ['recipient@example.com'],
    date: new Date().toISOString(), snippet: 'Email content preview...',
    labels: ['INBOX'], isRead: false, hasAttachment: false,
  };
}

function mockMessages(n: number): GWEmailMessage[] {
  return Array.from({ length: n }, (_, i) => mockMessage(`msg-${i + 1}`));
}