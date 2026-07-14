/**
 * DriveCapability.ts
 * Sprint 6.4.2 — Google Workspace Reference Connector
 *
 * Google Drive capability — file system operations.
 * NO OAuth logic. NO token management.
 * SRP: Drive operations only.
 */

import type { ConnectorOperation, ConnectorCapability } from '../../../connector-runtime-v2/UCRTypes';
import type { GWOperationInput, GWOperationOutput, GWFile } from '../GWTypes';
import { GW_OPERATIONS } from '../GWTypes';

export const DRIVE_CAPABILITIES: ConnectorCapability[] = ['READ_DRIVE', 'UPLOAD_FILE', 'DOWNLOAD_FILE', 'DELETE_FILE', 'SEARCH'];

export const DRIVE_OPERATIONS: ConnectorOperation[] = [
  {
    id:           GW_OPERATIONS.DRIVE_LIST_FILES,
    name:         'List Files',
    description:  'Lists files and folders in Google Drive.',
    capability:   'READ_DRIVE',
    inputSchema:  { folderId: 'string', maxResults: 'number', pageToken: 'string' },
    outputSchema: { items: 'GWFile[]', nextPage: 'string', total: 'number' },
    requiresAuth: true,
    rateLimit:    { requests: 100, windowMs: 1000 },
  },
  {
    id:           GW_OPERATIONS.DRIVE_SEARCH_FILES,
    name:         'Search Files',
    description:  'Searches files using Drive query language.',
    capability:   'SEARCH',
    inputSchema:  { query: 'string', maxResults: 'number' },
    outputSchema: { items: 'GWFile[]', total: 'number' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.DRIVE_UPLOAD_FILE,
    name:         'Upload File',
    description:  'Uploads a file to Google Drive.',
    capability:   'UPLOAD_FILE',
    inputSchema:  { fileName: 'string', mimeType: 'string', content: 'unknown', folderId: 'string' },
    outputSchema: { item: 'GWFile', success: 'boolean' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.DRIVE_DOWNLOAD_FILE,
    name:         'Download File',
    description:  'Downloads a file from Google Drive.',
    capability:   'DOWNLOAD_FILE',
    inputSchema:  { fileId: 'string' },
    outputSchema: { item: 'unknown', metadata: 'GWFile' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.DRIVE_DELETE_FILE,
    name:         'Delete File',
    description:  'Permanently deletes a file from Google Drive.',
    capability:   'DELETE_FILE',
    inputSchema:  { fileId: 'string' },
    outputSchema: { success: 'boolean' },
    requiresAuth: true,
  },
  {
    id:           GW_OPERATIONS.DRIVE_CREATE_FOLDER,
    name:         'Create Folder',
    description:  'Creates a new folder in Google Drive.',
    capability:   'UPLOAD_FILE',
    inputSchema:  { fileName: 'string', folderId: 'string' },
    outputSchema: { item: 'GWFile', success: 'boolean' },
    requiresAuth: true,
  },
];

export class DriveCapability {
  async execute(operationId: string, input: GWOperationInput): Promise<GWOperationOutput> {
    switch (operationId) {
      case GW_OPERATIONS.DRIVE_LIST_FILES:    return this._listFiles(input);
      case GW_OPERATIONS.DRIVE_SEARCH_FILES:  return this._searchFiles(input);
      case GW_OPERATIONS.DRIVE_UPLOAD_FILE:   return this._uploadFile(input);
      case GW_OPERATIONS.DRIVE_DOWNLOAD_FILE: return this._downloadFile(input);
      case GW_OPERATIONS.DRIVE_DELETE_FILE:   return this._deleteFile(input);
      case GW_OPERATIONS.DRIVE_CREATE_FOLDER: return this._createFolder(input);
      default:
        throw new Error(`[DriveCapability] Unknown operationId: ${operationId}`);
    }
  }

  private async _listFiles(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    const files = mockFiles(input.maxResults ?? 10);
    return { items: files, total: files.length };
  }

  private async _searchFiles(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.query) throw new Error('[DriveCapability] query is required');
    const files = mockFiles(Math.min(input.maxResults ?? 5, 20)).filter(() => Math.random() > 0.3);
    return { items: files, total: files.length };
  }

  private async _uploadFile(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.fileName) throw new Error('[DriveCapability] fileName is required');
    const file: GWFile = {
      id:           `file-${Date.now()}`,
      name:         input.fileName,
      mimeType:     input.mimeType ?? 'application/octet-stream',
      size:         1024,
      createdTime:  new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      webViewLink:  `https://drive.google.com/file/d/file-${Date.now()}/view`,
      parents:      input.folderId ? [input.folderId] : ['root'],
      isFolder:     false,
    };
    return { item: file, success: true };
  }

  private async _downloadFile(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.fileId) throw new Error('[DriveCapability] fileId is required');
    return { item: new Uint8Array(0), metadata: { fileId: input.fileId, mimeType: 'application/octet-stream' } };
  }

  private async _deleteFile(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.fileId) throw new Error('[DriveCapability] fileId is required');
    return { success: true };
  }

  private async _createFolder(input: GWOperationInput): Promise<GWOperationOutput> {
    await tick();
    if (!input.fileName) throw new Error('[DriveCapability] fileName is required');
    const folder: GWFile = {
      id:           `folder-${Date.now()}`,
      name:         input.fileName,
      mimeType:     'application/vnd.google-apps.folder',
      size:         0,
      createdTime:  new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      webViewLink:  `https://drive.google.com/drive/folders/folder-${Date.now()}`,
      parents:      input.folderId ? [input.folderId] : ['root'],
      isFolder:     true,
    };
    return { item: folder, success: true };
  }
}

function tick(): Promise<void> { return new Promise((r) => setTimeout(r, 2)); }

function mockFiles(n: number): GWFile[] {
  return Array.from({ length: n }, (_, i) => ({
    id:           `file-${i + 1}`,
    name:         `Document ${i + 1}.docx`,
    mimeType:     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size:         (i + 1) * 1024,
    createdTime:  new Date(Date.now() - i * 86_400_000).toISOString(),
    modifiedTime: new Date(Date.now() - i * 3_600_000).toISOString(),
    webViewLink:  `https://drive.google.com/file/d/file-${i + 1}/view`,
    parents:      ['root'],
    isFolder:     false,
  }));
}