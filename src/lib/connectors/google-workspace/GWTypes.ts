/**
 * GWTypes.ts
 * Sprint 6.4.2 — Google Workspace Reference Connector
 *
 * Types, operation IDs, and scope definitions for all Google Workspace capabilities.
 * No OAuth logic — no token management. Pure type contracts.
 *
 * Principles: SRP · Immutability · Zero Circular Dependencies
 */

// ─── Supported Google Services ────────────────────────────────────────────────

export type GoogleService = 'gmail' | 'calendar' | 'drive' | 'profile';

// ─── Operation IDs ────────────────────────────────────────────────────────────

export const GW_OPERATIONS = {
  // Gmail
  GMAIL_LIST_MESSAGES:  'gmail.list_messages',
  GMAIL_GET_MESSAGE:    'gmail.get_message',
  GMAIL_READ_THREAD:    'gmail.read_thread',
  GMAIL_SEND:           'gmail.send',
  GMAIL_SEARCH:         'gmail.search',
  GMAIL_LIST_LABELS:    'gmail.list_labels',
  // Calendar
  CALENDAR_LIST:        'calendar.list',
  CALENDAR_LIST_EVENTS: 'calendar.list_events',
  CALENDAR_CREATE_EVENT:'calendar.create_event',
  CALENDAR_UPDATE_EVENT:'calendar.update_event',
  CALENDAR_DELETE_EVENT:'calendar.delete_event',
  // Drive
  DRIVE_LIST_FILES:     'drive.list_files',
  DRIVE_SEARCH_FILES:   'drive.search_files',
  DRIVE_UPLOAD_FILE:    'drive.upload_file',
  DRIVE_DOWNLOAD_FILE:  'drive.download_file',
  DRIVE_DELETE_FILE:    'drive.delete_file',
  DRIVE_CREATE_FOLDER:  'drive.create_folder',
  // Profile
  PROFILE_READ:         'profile.read',
  PROFILE_READ_ACCOUNT: 'profile.read_account',
  PROFILE_READ_SCOPES:  'profile.read_scopes',
  PROFILE_CONNECTION:   'profile.read_connection_info',
} as const;

export type GWOperationId = typeof GW_OPERATIONS[keyof typeof GW_OPERATIONS];

// ─── OAuth Scopes ─────────────────────────────────────────────────────────────

export const GW_SCOPES = {
  // Gmail
  GMAIL_READONLY:   'https://www.googleapis.com/auth/gmail.readonly',
  GMAIL_SEND:       'https://www.googleapis.com/auth/gmail.send',
  GMAIL_MODIFY:     'https://www.googleapis.com/auth/gmail.modify',
  // Calendar
  CALENDAR:         'https://www.googleapis.com/auth/calendar',
  CALENDAR_READONLY:'https://www.googleapis.com/auth/calendar.readonly',
  // Drive
  DRIVE:            'https://www.googleapis.com/auth/drive',
  DRIVE_READONLY:   'https://www.googleapis.com/auth/drive.readonly',
  DRIVE_FILE:       'https://www.googleapis.com/auth/drive.file',
  // Profile
  PROFILE:          'https://www.googleapis.com/auth/userinfo.profile',
  EMAIL:            'https://www.googleapis.com/auth/userinfo.email',
  OPENID:           'openid',
} as const;

export type GWScope = typeof GW_SCOPES[keyof typeof GW_SCOPES];

// ─── Data Models (minimal — no API-specific shapes) ───────────────────────────

export interface GWEmailMessage {
  id:          string;
  threadId:    string;
  subject:     string;
  from:        string;
  to:          string[];
  date:        string;
  snippet:     string;
  labels:      string[];
  isRead:      boolean;
  hasAttachment: boolean;
}

export interface GWEmailThread {
  id:       string;
  messages: GWEmailMessage[];
  subject:  string;
}

export interface GWLabel {
  id:   string;
  name: string;
  type: 'system' | 'user';
}

export interface GWCalendarEvent {
  id:          string;
  calendarId:  string;
  title:       string;
  description: string;
  start:       string;
  end:         string;
  attendees:   string[];
  location:    string;
  status:      'confirmed' | 'tentative' | 'cancelled';
  isAllDay:    boolean;
  meetLink?:   string;
}

export interface GWFile {
  id:           string;
  name:         string;
  mimeType:     string;
  size:         number;
  createdTime:  string;
  modifiedTime: string;
  webViewLink:  string;
  parents:      string[];
  isFolder:     boolean;
}

export interface GWProfile {
  id:          string;
  email:       string;
  displayName: string;
  avatarUrl:   string;
  locale:      string;
  domain:      string;
}

// ─── Operation Input/Output shapes ───────────────────────────────────────────

export interface GWOperationInput {
  // Gmail
  maxResults?:   number;
  pageToken?:    string;
  query?:        string;
  messageId?:    string;
  threadId?:     string;
  labelIds?:     string[];
  // Send
  to?:           string[];
  subject?:      string;
  body?:         string;
  attachments?:  unknown[];
  // Calendar
  calendarId?:   string;
  timeMin?:      string;
  timeMax?:      string;
  eventId?:      string;
  event?:        Partial<GWCalendarEvent>;
  // Drive
  fileId?:       string;
  folderId?:     string;
  fileName?:     string;
  mimeType?:     string;
  content?:      unknown;
  fields?:       string;
}

export interface GWOperationOutput {
  items?:      unknown[];
  item?:       unknown;
  success?:    boolean;
  nextPage?:   string;
  total?:      number;
  metadata?:   Record<string, unknown>;
}