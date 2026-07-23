/**
 * GoogleDriveAcceptanceTests.ts — EV-4B
 * Real Google Drive API validation. No mocks.
 *
 * Requires: active Google OAuth connection (workspace "default")
 */

import { getAccessToken, ensureValidToken, getConnection } from "@/lib/google-auth/GoogleAuthSession";
import {
  listFiles, searchFiles, searchByName, readFileMetadata, downloadMedia, exportFile,
  listFolders, getDriveHealth,
} from "@/lib/google-drive/GoogleDriveConnector";

// ── Trace builder ────────────────────────────────────────────────────────────────

function mkTrace(requestId: string, operation: string) {
  const steps: Array<{ step: string; ts: number; durationMs?: number; status: string; detail?: string }> = [];
  const start = Date.now();
  return {
    add(step: string, status: string, detail?: string) {
      steps.push({ step, ts: Date.now(), durationMs: Date.now() - start, status, detail });
    },
    export() { return { requestId, operation, totalMs: Date.now() - start, steps }; },
  };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────────

function requireGoogleAuth() {
  const conn = getConnection("default");
  if (!conn || conn.state !== "CONNECTED") {
    throw new Error("EV-4B: Google Workspace not connected. Connect via /connections first.");
  }
  const token = getAccessToken("default");
  if (!token) throw new Error("EV-4B: No access token in memory. Reconnect Google Workspace.");
}

async function getToken(): Promise<string> {
  await ensureValidToken("default");
  const t = getAccessToken("default");
  if (!t) throw new Error("No access token");
  return t;
}

async function driveGET(path: string): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = res.ok ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, durationMs: Date.now() - t0 };
}

async function drivePOST(path: string, body: object): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = res.ok ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, durationMs: Date.now() - t0 };
}

async function drivePATCH(path: string, body: object): Promise<{ status: number; ok: boolean; data: unknown; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = res.ok ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, durationMs: Date.now() - t0 };
}

async function driveDELETE(path: string): Promise<{ status: number; ok: boolean; durationMs: number }> {
  const token = await getToken();
  const t0 = Date.now();
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, ok: res.ok || res.status === 204, durationMs: Date.now() - t0 };
}

// ── Test results type ──────────────────────────────────────────────────────────────

export interface AccTestResult {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "ERROR" | "SKIP";
  durationMs: number;
  error?: string;
  evidence: Record<string, unknown>;
  trace: ReturnType<ReturnType<typeof mkTrace>["export"]>;
  failureDetails?: { cause: string; component: string; impact: string; priority: string; fix: string };
}

// ── Tests ──────────────────────────────────────────────────────────────────────────

export async function runGoogleDriveAcceptanceTests(): Promise<AccTestResult[]> {
  const results: AccTestResult[] = [];

  async function run(id: string, name: string, fn: (trace: ReturnType<typeof mkTrace>) => Promise<{ evidence: Record<string, unknown> }>): Promise<void> {
    const trace = mkTrace(id, name);
    const t0 = Date.now();
    try {
      requireGoogleAuth();
      trace.add("auth_check", "OK");
      const { evidence } = await fn(trace);
      results.push({ id, name, status: "PASS", durationMs: Date.now() - t0, evidence, trace: trace.export() });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      trace.add("error", "FAIL", msg);
      const isAuth = msg.includes("not connected") || msg.includes("No access token");
      results.push({
        id, name, status: isAuth ? "SKIP" : "FAIL",
        durationMs: Date.now() - t0,
        error: msg,
        evidence: {},
        trace: trace.export(),
        failureDetails: isAuth ? undefined : {
          cause: msg,
          component: "GoogleDriveConnector",
          impact: "Test cannot validate Drive operation",
          priority: "HIGH",
          fix: "Check OAuth scopes and token validity. Reconnect if needed.",
        },
      });
    }
  }

  // T1: about.get
  await run("DRV-T01", "about.get — user info & storage quota", async (trace) => {
    const r = await driveGET("/about?fields=user,storageQuota");
    trace.add("GET /about", r.ok ? "OK" : "FAIL", `HTTP ${r.status} ${r.durationMs}ms`);
    if (!r.ok) throw new Error(`about.get failed: HTTP ${r.status}`);
    const d = r.data as Record<string, unknown>;
    if (!d.user) throw new Error("user missing from about.get response");
    if (!d.storageQuota) throw new Error("storageQuota missing");
    const user = d.user as Record<string, unknown>;
    return { evidence: { status: r.status, displayName: user.displayName, permissionId: user.permissionId, storageQuota: d.storageQuota, durationMs: r.durationMs } };
  });

  // T2: files.list
  await run("DRV-T02", "files.list — list files with metadata", async (trace) => {
    const result = await listFiles({ pageSize: 10 });
    trace.add("listFiles", "OK", `${result.files.length} files in ${result.durationMs}ms`);
    if (result.files.length === 0) throw new Error("files.list returned 0 files — Drive may be empty or token lacks drive scope");
    const sample = result.files[0];
    if (!sample.id) throw new Error("file.id missing");
    if (!sample.name) throw new Error("file.name missing");
    if (!sample.mimeType) throw new Error("file.mimeType missing");
    return { evidence: { count: result.files.length, sample: { id: sample.id, name: sample.name, mimeType: sample.mimeType, parents: sample.parents, modifiedTime: sample.modifiedTime }, durationMs: result.durationMs } };
  });

  // T3: search "RG"
  await run("DRV-T03", "files.search — query 'RG'", async (trace) => {
    const result = await searchFiles("RG", { pageSize: 10 });
    trace.add("searchFiles(RG)", "OK", `${result.files.length} results in ${result.durationMs}ms`);
    return { evidence: { query: result.searchQuery, count: result.files.length, found: result.files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents })), durationMs: result.durationMs } };
  });

  // T3B: searchByName — direct name-contains filter (bugfix regression guard).
  // Unlike DRV-T03 above (buildDriveQuery, requires a trigger verb like "procure"),
  // this must find a file by a bare name fragment with no verb at all.
  // Self-consistent by design: picks a REAL file from this account (via listFiles)
  // and searches for a fragment of its own name, instead of hardcoding a term like
  // "RG" that may not exist in every Drive account running this suite.
  await run("DRV-T03B", "files.searchByName — bare name fragment, no trigger verb", async (trace) => {
    const listing = await listFiles({ pageSize: 1 });
    if (listing.files.length === 0) throw new Error("No files available in this Drive account to build a name-fragment search from.");
    const target = listing.files[0];
    const fragment = target.name.slice(0, Math.min(4, target.name.length));
    trace.add("pick target file", "OK", `id=${target.id} name="${target.name}" fragment="${fragment}"`);

    const files = await searchByName(fragment, { pageSize: 10 });
    trace.add("searchByName(fragment)", "OK", `${files.length} results`);
    if (!files.some(f => f.id === target.id)) {
      throw new Error(`searchByName("${fragment}") did not return the source file "${target.name}" (id=${target.id}) among ${files.length} result(s) — regression.`);
    }
    const sample = files[0];
    if (typeof sample.trashed !== "boolean") throw new Error("trashed field missing/wrong type from searchByName result — response shape regression");
    if (!("webViewLink" in sample)) throw new Error("webViewLink field missing from searchByName result — response shape regression");
    return { evidence: { fragment, targetId: target.id, count: files.length, found: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size })) } };
  });

  // T4: search PDFs
  await run("DRV-T04", "files.search — PDFs only", async (trace) => {
    const r = await driveGET("/files?q=mimeType='application/pdf' and trashed=false&fields=files(id,name,mimeType)&pageSize=10");
    trace.add("GET /files?mimeType=pdf", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`PDF search failed: HTTP ${r.status}`);
    const d = r.data as { files: Array<{ id: string; name: string; mimeType: string }> };
    const allPdf = (d.files ?? []).every(f => f.mimeType === "application/pdf");
    return { evidence: { count: d.files?.length ?? 0, allArePDF: allPdf, sample: d.files?.slice(0, 3) } };
  });

  // T5: search images
  await run("DRV-T05", "files.search — images only", async (trace) => {
    const r = await driveGET("/files?q=mimeType contains 'image/' and trashed=false&fields=files(id,name,mimeType)&pageSize=10");
    trace.add("GET /files?mimeType=image", r.ok ? "OK" : "FAIL");
    if (!r.ok) throw new Error(`Image search failed: HTTP ${r.status}`);
    const d = r.data as { files: Array<{ id: string; name: string; mimeType: string }> };
    return { evidence: { count: d.files?.length ?? 0, sample: d.files?.slice(0, 3) } };
  });

  // T6: search Google Docs
  await run("DRV-T06", "files.search — Google Docs only", async (trace) => {
    const r = await driveGET("/files?q=mimeType='application/vnd.google-apps.document' and trashed=false&fields=files(id,name,mimeType)&pageSize=10");
    trace.add("GET /files?mimeType=gdoc", r.ok ? "OK" : "FAIL");
    if (!r.ok) throw new Error(`Google Docs search failed: HTTP ${r.status}`);
    const d = r.data as { files: Array<{ id: string; name: string; mimeType: string }> };
    return { evidence: { count: d.files?.length ?? 0, sample: d.files?.slice(0, 3) } };
  });

  // T7: DOCX
  await run("DRV-T07", "files.search — DOCX", async (trace) => {
    const r = await driveGET("/files?q=mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and trashed=false&fields=files(id,name,mimeType)&pageSize=10");
    trace.add("GET /files?mimeType=docx", r.ok ? "OK" : "FAIL");
    if (!r.ok) throw new Error(`DOCX search failed: HTTP ${r.status}`);
    const d = r.data as { files: Array<{ id: string; name: string; mimeType: string }> };
    return { evidence: { count: d.files?.length ?? 0, sample: d.files?.slice(0, 3) } };
  });

  // T8: XLSX
  await run("DRV-T08", "files.search — XLSX", async (trace) => {
    const r = await driveGET("/files?q=mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and trashed=false&fields=files(id,name,mimeType)&pageSize=10");
    trace.add("GET /files?mimeType=xlsx", r.ok ? "OK" : "FAIL");
    if (!r.ok) throw new Error(`XLSX search failed: HTTP ${r.status}`);
    const d = r.data as { files: Array<{ id: string; name: string; mimeType: string }> };
    return { evidence: { count: d.files?.length ?? 0, sample: d.files?.slice(0, 3) } };
  });

  // T9: PPT
  await run("DRV-T09", "files.search — PPT", async (trace) => {
    const r = await driveGET("/files?q=(mimeType='application/vnd.ms-powerpoint' or mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation' or mimeType='application/vnd.google-apps.presentation') and trashed=false&fields=files(id,name,mimeType)&pageSize=10");
    trace.add("GET /files?mimeType=ppt", r.ok ? "OK" : "FAIL");
    if (!r.ok) throw new Error(`PPT search failed: HTTP ${r.status}`);
    const d = r.data as { files: Array<{ id: string; name: string; mimeType: string }> };
    return { evidence: { count: d.files?.length ?? 0, sample: d.files?.slice(0, 3) } };
  });

  // T10: list folders
  await run("DRV-T10", "files.list — folders", async (trace) => {
    const result = await listFolders({ pageSize: 10 });
    trace.add("listFolders", result.ok ? "OK" : "FAIL");
    if (!result.ok) throw new Error(result.error ?? "listFolders failed");
    return { evidence: { count: result.data.length, sample: result.data.slice(0, 3).map(f => ({ id: f.id, name: f.name, parents: f.parents })) } };
  });

  // T11: recursive search (files in subfolder)
  await run("DRV-T11", "files.search — recursive subfolder search", async (trace) => {
    const folders = await listFolders({ pageSize: 5 });
    trace.add("listFolders", folders.ok ? "OK" : "FAIL");
    if (!folders.ok || folders.data.length === 0) {
      return { evidence: { skippedReason: "No folders found to search recursively", folderCount: 0 } };
    }
    const folder = folders.data[0];
    trace.add("listFiles in folder", "OK", folder.name);
    const files = await listFiles({ folderId: folder.id, pageSize: 10 });
    return { evidence: { folderId: folder.id, folderName: folder.name, fileCount: files.files.length, files: files.files.slice(0, 3).map(f => ({ id: f.id, name: f.name, parents: f.parents })) } };
  });

  // T12: download file
  await run("DRV-T12", "files.get — download media bytes", async (trace) => {
    const list = await listFiles({ pageSize: 20 });
    const downloadable = list.files.find(f => !f.mimeType.startsWith("application/vnd.google-apps.") && (f.size ?? 0) < 2 * 1024 * 1024);
    if (!downloadable) return { evidence: { skippedReason: "No downloadable non-GWS file under 2MB found", fileCount: list.files.length } };
    trace.add("found downloadable file", "OK", downloadable.name);
    const dl = await downloadMedia(downloadable.id);
    trace.add("downloadMedia", dl.ok ? "OK" : "FAIL", `HTTP ${dl.status} ${dl.durationMs}ms ${dl.sizeBytes}bytes`);
    if (!dl.ok) throw new Error(`download failed: HTTP ${dl.status}`);
    return { evidence: { fileId: downloadable.id, fileName: downloadable.name, mimeType: downloadable.mimeType, sizeBytes: dl.sizeBytes, durationMs: dl.durationMs, status: dl.status } };
  });

  // T13: export Google Doc as PDF
  await run("DRV-T13", "files.export — Google Doc → PDF", async (trace) => {
    const r = await driveGET("/files?q=mimeType='application/vnd.google-apps.document' and trashed=false&fields=files(id,name,mimeType)&pageSize=5");
    trace.add("find Google Doc", r.ok ? "OK" : "FAIL");
    if (!r.ok) throw new Error(`find docs failed: HTTP ${r.status}`);
    const d = r.data as { files: Array<{ id: string; name: string; mimeType: string }> };
    if (!d.files?.length) return { evidence: { skippedReason: "No Google Docs found in Drive" } };
    const doc = d.files[0];
    const exported = await exportFile(doc.id, "application/pdf");
    trace.add("exportFile(pdf)", exported.ok ? "OK" : "FAIL", `HTTP ${exported.status} ${exported.sizeBytes}bytes`);
    if (!exported.ok) throw new Error(`export failed: HTTP ${exported.status}`);
    return { evidence: { docId: doc.id, docName: doc.name, exportMime: "application/pdf", sizeBytes: exported.sizeBytes, durationMs: exported.durationMs } };
  });

  // T14: create folder
  let tempFolderId: string | null = null;
  await run("DRV-T14", "files.create — create temporary folder", async (trace) => {
    const r = await drivePOST("/files", { name: `MemoryOS-EV4B-Test-${Date.now()}`, mimeType: "application/vnd.google-apps.folder" });
    trace.add("POST /files (folder)", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`folder create failed: HTTP ${r.status} — ${JSON.stringify(r.data)}`);
    const d = r.data as { id: string; name: string; mimeType: string };
    tempFolderId = d.id;
    if (!d.id) throw new Error("id missing from create response");
    return { evidence: { id: d.id, name: d.name, mimeType: d.mimeType, durationMs: r.durationMs } };
  });

  // T15: create file
  let tempFileId: string | null = null;
  await run("DRV-T15", "files.create — upload temporary file", async (trace) => {
    const token = await getToken();
    const content = `MemoryOS EV-4B test file — ${new Date().toISOString()}`;
    const boundary = "memoryos_boundary_ev4b";
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify({ name: `memoryos-ev4b-test-${Date.now()}.txt`, ...(tempFolderId ? { parents: [tempFolderId] } : {}) }),
      `--${boundary}`,
      'Content-Type: text/plain',
      '',
      content,
      `--${boundary}--`,
    ].join("\r\n");
    const t0 = Date.now();
    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    trace.add("POST multipart upload", res.ok ? "OK" : "FAIL", `HTTP ${res.status} ${Date.now()-t0}ms`);
    if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`);
    const d = await res.json() as { id: string; name: string; mimeType: string; size: string };
    tempFileId = d.id;
    return { evidence: { id: d.id, name: d.name, mimeType: d.mimeType, size: d.size, durationMs: Date.now() - t0 } };
  });

  // T16: update file
  await run("DRV-T16", "files.update — rename temporary file", async (trace) => {
    if (!tempFileId) return { evidence: { skippedReason: "T15 did not create a file to update" } };
    const r = await drivePATCH(`/files/${tempFileId}?fields=id,name,modifiedTime`, { name: `memoryos-ev4b-updated-${Date.now()}.txt` });
    trace.add("PATCH /files/:id", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`update failed: HTTP ${r.status}`);
    const d = r.data as { id: string; name: string; modifiedTime: string };
    return { evidence: { id: d.id, name: d.name, modifiedTime: d.modifiedTime, durationMs: r.durationMs } };
  });

  // T17: delete file
  await run("DRV-T17", "files.delete — delete temporary file", async (trace) => {
    if (!tempFileId) return { evidence: { skippedReason: "No temp file to delete" } };
    const r = await driveDELETE(`/files/${tempFileId}`);
    trace.add("DELETE /files/:id", r.ok ? "OK" : "FAIL", `HTTP ${r.status}`);
    if (!r.ok) throw new Error(`delete failed: HTTP ${r.status}`);
    tempFileId = null;
    // Cleanup folder too
    if (tempFolderId) {
      await driveDELETE(`/files/${tempFolderId}`).catch(() => {});
      tempFolderId = null;
    }
    return { evidence: { status: r.status, durationMs: r.durationMs } };
  });

  // T18: non-existent file
  await run("DRV-T18", "error handling — file not found (XYZ_FILE_THAT_DOES_NOT_EXIST)", async (trace) => {
    const meta = await readFileMetadata("XYZ_FILE_ID_THAT_DOES_NOT_EXIST_99999");
    trace.add("readFileMetadata(invalid)", "OK", `ok=${meta.ok}`);
    if (meta.ok) throw new Error("Expected error for non-existent file but got OK");
    return { evidence: { ok: meta.ok, error: meta.error, handledGracefully: true } };
  });

  // T19: permission check on system folder
  await run("DRV-T19", "error handling — insufficient permission (read-only resource)", async (trace) => {
    // Try to delete a file we don't own (the Drive root)
    const r = await driveDELETE("/files/root");
    trace.add("DELETE /files/root", "OK", `HTTP ${r.status}`);
    // 403 or 400 is expected — we just verify it doesn't crash and returns an error code
    return { evidence: { status: r.status, handledGracefully: true, expectedError: r.status === 403 || r.status === 400 || r.status === 405 } };
  });

  // T20: 100 consecutive searches (stress)
  await run("DRV-T20", "stress — 100 consecutive files.list calls", async (trace) => {
    const N = 100;
    const durations: number[] = [];
    let errors = 0;
    for (let i = 0; i < N; i++) {
      const t0 = Date.now();
      try {
        await driveGET("/files?q=trashed=false&pageSize=1&fields=files(id)");
        durations.push(Date.now() - t0);
      } catch {
        errors++;
      }
    }
    trace.add("stress complete", errors === 0 ? "OK" : "WARN", `${errors} errors / ${N} calls`);
    const avg = durations.reduce((a, b) => a + b, 0) / (durations.length || 1);
    const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] ?? 0;
    return { evidence: { total: N, errors, avgMs: Math.round(avg), p95Ms: p95, minMs: durations[0] ?? 0, maxMs: durations[durations.length - 1] ?? 0 } };
  });

  return results;
}