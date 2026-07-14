/**
 * CalendarCapability.ts
 * Sprint 6.4.2 — Google Workspace Reference Connector
 *
 * Google Calendar capability — all event operations.
 * NO OAuth logic. NO token management.
 * SRP: Calendar operations only.
 */

import type { ConnectorOperation, ConnectorCapability } from '../../../connector-runtime-v2/UCRTypes';
import type { GWOperationInput, GWOperationOutput, GWCalendarEvent } from '../GWTypes';
import { GW_OPERATIONS } from '../GWTypes';

export const CALENDAR_CAPABILITIES: ConnectorCapability[] = ['READ_CALENDAR', 'CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT'];

export const CALENDAR_OPERATIONS: ConnectorOperation[] = [
  {
    id:           GW_OPERATIONS.CALENDAR_LIST,
    name:         'List Calendars',
    description:  'Returns all calendars for the authenticated account.',
    capability:   'READ_CALENDAR',
    inputSchema:  {},
    outputSchema: { items: 'GWCalendar[]' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.CALENDAR_LIST_EVENTS,
    name:         'List Events',
    description:  'Lists calendar events within a time range.',
    capability:   'READ_CALENDAR',
    inputSchema:  { calendarId: 'string', timeMin: 'string', timeMax: 'string', maxResults: 'number' },
    outputSchema: { items: 'GWCalendarEvent[]', total: 'number', nextPage: 'string' },
    requiresAuth: true,
    rateLimit:    { requests: 100, windowMs: 1000 },
  },
  {
    id:           GW_OPERATIONS.CALENDAR_CREATE_EVENT,
    name:         'Create Event',
    description:  'Creates a new calendar event.',
    capability:   'CREATE_EVENT',
    inputSchema:  { calendarId: 'string', event: 'GWCalendarEvent' },
    outputSchema: { item: 'GWCalendarEvent', success: 'boolean' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.CALENDAR_UPDATE_EVENT,
    name:         'Update Event',
    description:  'Updates an existing calendar event.',
    capability:   'UPDATE_EVENT',
    inputSchema:  { calendarId: 'string', eventId: 'string', event: 'GWCalendarEvent' },
    outputSchema: { item: 'GWCalendarEvent', success: 'boolean' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.CALENDAR_DELETE_EVENT,
    name:         'Delete Event',
    description:  'Deletes a calendar event.',
    capability:   'DELETE_EVENT',
    inputSchema:  { calendarId: 'string', eventId: 'string' },
    outputSchema: { success: 'boolean' },
    requiresAuth: true,
  },
];

export class CalendarCapability {
  async execute(operationId: string, input: GWOperationInput): Promise<GWOperationOutput> {
    switch (operationId) {
      case GW_OPERATIONS.CALENDAR_LIST:
        return this._listCalendars(input);
      case GW_OPERATIONS.CALENDAR_LIST_EVENTS:
        return this._listEvents(input);
      case GW_OPERATIONS.CALENDAR_CREATE_EVENT:
        return this._createEvent(input);
      case GW_OPERATIONS.CALENDAR_UPDATE_EVENT:
        return this._updateEvent(input);
      case GW_OPERATIONS.CALENDAR_DELETE_EVENT:
        return this._deleteEvent(input);
      default:
        throw new Error(`[CalendarCapability] Unknown operationId: ${operationId}`);
    }
  }

  private async _listCalendars(_input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    return {
      items: [
        { id: 'primary', name: 'Primary Calendar', accessRole: 'owner' },
        { id: 'work',    name: 'Work',             accessRole: 'owner' },
        { id: 'shared',  name: 'Team Calendar',    accessRole: 'reader' },
      ],
      total: 3,
    };
  }

  private async _listEvents(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    const events = mockEvents(input.maxResults ?? 10);
    return { items: events, total: events.length };
  }

  private async _createEvent(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.event) throw new Error('[CalendarCapability] event is required');
    const created: GWCalendarEvent = {
      id:          `evt-${Date.now()}`,
      calendarId:  input.calendarId ?? 'primary',
      title:       (input.event as any).title ?? 'New Event',
      description: (input.event as any).description ?? '',
      start:       (input.event as any).start ?? new Date().toISOString(),
      end:         (input.event as any).end   ?? new Date(Date.now() + 3_600_000).toISOString(),
      attendees:   (input.event as any).attendees ?? [],
      location:    (input.event as any).location  ?? '',
      status:      'confirmed',
      isAllDay:    false,
    };
    return { item: created, success: true };
  }

  private async _updateEvent(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.eventId) throw new Error('[CalendarCapability] eventId is required');
    return { item: { ...mockEvents(1)[0], id: input.eventId, ...input.event }, success: true };
  }

  private async _deleteEvent(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.eventId) throw new Error('[CalendarCapability] eventId is required');
    return { success: true };
  }
}

function tick(): Promise<void> { return new Promise((r) => setTimeout(r, 2)); }

function mockEvents(n: number): GWCalendarEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `evt-${i + 1}`,
    calendarId:  'primary',
    title:       `Event ${i + 1}`,
    description: '',
    start:       new Date(Date.now() + i * 3_600_000).toISOString(),
    end:         new Date(Date.now() + i * 3_600_000 + 3_600_000).toISOString(),
    attendees:   [],
    location:    '',
    status:      'confirmed' as const,
    isAllDay:    false,
  }));
}