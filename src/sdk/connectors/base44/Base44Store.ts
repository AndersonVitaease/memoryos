/**
 * Base44Store.ts
 * EF-32 — In-memory simulated Base44 workspace store.
 * Represents what would come from the real Base44 API.
 * No external HTTP calls — all data is deterministic and testable.
 * EF-32 · 2026-07-12 · Version: 1.0.0
 */

export interface B44Workspace {
  id: string;
  name: string;
  ownerId: string;
  region: string;
  createdAt: string;
  projectCount: number;
}

export interface B44Project {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  framework: string;
}

export interface B44FileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  extension?: string;
  sizeBytes: number;
  modifiedAt: string;
  hash?: string;
  encoding: string;
}

export interface B44FileContent {
  path: string;
  content: string;
  encoding: string;
  sizeBytes: number;
  modifiedAt: string;
  hash: string;
  mimeType: string;
}

export interface B44SyncSnapshot {
  projectId: string;
  snapshotAt: string;
  totalFiles: number;
  changes: B44Change[];
}

export interface B44Change {
  path: string;
  type: 'added' | 'modified' | 'removed';
  detectedAt: string;
}

// ── Deterministic simulated data ───────────────────────────────────────────

export const WORKSPACES: B44Workspace[] = [
  { id: 'ws-001', name: 'MemoryOS Workspace', ownerId: 'user-ef32', region: 'us-east-1', createdAt: '2026-01-01T00:00:00Z', projectCount: 2 },
  { id: 'ws-002', name: 'Development Workspace', ownerId: 'user-ef32', region: 'us-east-1', createdAt: '2026-02-01T00:00:00Z', projectCount: 1 },
];

export const PROJECTS: B44Project[] = [
  { id: 'proj-001', workspaceId: 'ws-001', name: 'MemoryOS Core', slug: 'memoryos-core', description: 'Primary MemoryOS project', tags: ['ef-32', 'core', 'sdk'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', fileCount: 6, framework: 'react-vite' },
  { id: 'proj-002', workspaceId: 'ws-001', name: 'MemoryOS SDK', slug: 'memoryos-sdk', description: 'Connector SDK project', tags: ['sdk', 'connectors'], createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', fileCount: 3, framework: 'typescript' },
  { id: 'proj-003', workspaceId: 'ws-002', name: 'Dev Sandbox', slug: 'dev-sandbox', description: 'Sandbox for experiments', tags: ['sandbox'], createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z', fileCount: 2, framework: 'vanilla' },
];

export const FILES: Record<string, B44FileEntry[]> = {
  'proj-001': [
    { path: 'src/App.jsx', name: 'App.jsx', type: 'file', extension: '.jsx', sizeBytes: 4200, modifiedAt: '2026-07-12T10:00:00Z', hash: 'sha256-app001', encoding: 'utf-8' },
    { path: 'src/index.css', name: 'index.css', type: 'file', extension: '.css', sizeBytes: 1800, modifiedAt: '2026-07-12T10:00:00Z', hash: 'sha256-css001', encoding: 'utf-8' },
    { path: 'src/pages', name: 'pages', type: 'directory', sizeBytes: 0, modifiedAt: '2026-07-12T10:00:00Z', encoding: 'utf-8' },
    { path: 'src/pages/Home.jsx', name: 'Home.jsx', type: 'file', extension: '.jsx', sizeBytes: 2100, modifiedAt: '2026-07-12T09:00:00Z', hash: 'sha256-home001', encoding: 'utf-8' },
    { path: 'src/sdk', name: 'sdk', type: 'directory', sizeBytes: 0, modifiedAt: '2026-07-12T10:00:00Z', encoding: 'utf-8' },
    { path: 'package.json', name: 'package.json', type: 'file', extension: '.json', sizeBytes: 3100, modifiedAt: '2026-07-11T00:00:00Z', hash: 'sha256-pkg001', encoding: 'utf-8' },
  ],
  'proj-002': [
    { path: 'src/sdk/connector/BaseConnector.ts', name: 'BaseConnector.ts', type: 'file', extension: '.ts', sizeBytes: 5200, modifiedAt: '2026-07-12T08:00:00Z', hash: 'sha256-base001', encoding: 'utf-8' },
    { path: 'src/sdk/connector/ConnectorBuilder.ts', name: 'ConnectorBuilder.ts', type: 'file', extension: '.ts', sizeBytes: 6100, modifiedAt: '2026-07-12T08:00:00Z', hash: 'sha256-builder001', encoding: 'utf-8' },
    { path: 'src/sdk/connector/index.ts', name: 'index.ts', type: 'file', extension: '.ts', sizeBytes: 1500, modifiedAt: '2026-07-12T08:00:00Z', hash: 'sha256-idx001', encoding: 'utf-8' },
  ],
  'proj-003': [
    { path: 'index.html', name: 'index.html', type: 'file', extension: '.html', sizeBytes: 800, modifiedAt: '2026-06-01T00:00:00Z', hash: 'sha256-html001', encoding: 'utf-8' },
    { path: 'main.js', name: 'main.js', type: 'file', extension: '.js', sizeBytes: 420, modifiedAt: '2026-07-01T00:00:00Z', hash: 'sha256-main001', encoding: 'utf-8' },
  ],
};

export const FILE_CONTENTS: Record<string, string> = {
  'proj-001/src/App.jsx': '// MemoryOS App.jsx — entry point\nimport React from "react";\nexport default function App() { return <div>MemoryOS</div>; }',
  'proj-001/src/index.css': '/* MemoryOS global styles */\nbody { background: #09090b; color: #fafafa; }',
  'proj-001/src/pages/Home.jsx': '// Home page\nexport default function Home() { return <main>Home</main>; }',
  'proj-001/package.json': '{\n  "name": "memoryos-core",\n  "version": "1.0.0",\n  "dependencies": {}\n}',
  'proj-002/src/sdk/connector/BaseConnector.ts': '// BaseConnector — abstract base for all connectors',
  'proj-002/src/sdk/connector/ConnectorBuilder.ts': '// ConnectorBuilder — fluent builder for manifests',
  'proj-002/src/sdk/connector/index.ts': '// SDK public API',
  'proj-003/index.html': '<!DOCTYPE html><html><body><h1>Sandbox</h1></body></html>',
  'proj-003/main.js': '// Dev Sandbox\nconsole.log("Base44 Connector EF-32");',
};

export const SYNC_SNAPSHOTS: Record<string, B44Change[]> = {
  'proj-001': [
    { path: 'src/sdk/connectors/base44/Base44Connector.ts', type: 'added', detectedAt: '2026-07-12T10:05:00Z' },
    { path: 'src/pages/EF32Page.jsx', type: 'added', detectedAt: '2026-07-12T10:05:00Z' },
    { path: 'src/App.jsx', type: 'modified', detectedAt: '2026-07-12T10:06:00Z' },
  ],
  'proj-002': [
    { path: 'src/sdk/connector/HelloConnector.ts', type: 'modified', detectedAt: '2026-07-12T08:30:00Z' },
  ],
  'proj-003': [],
};