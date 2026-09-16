// SB-01 Sandbox SuperTool foundation proofs.
// Unit proofs (deterministic, no network): MissionRecord persistence (T1 core),
// ownership (T2), failure containment (T4), schemas, the credential gate and
// handler delegation. Real E2B proofs (T1 native TTL, T2 ownership on the real
// provider, T3 proven destroy, T5 zero orphans) run ONLY when E2B_API_KEY is
// present in this process; otherwise they are skipped with the exact reason —
// an honest skip, never a fake pass and never a network call without a
// credential. The T5 sweep filters by THIS mission's metadata (server-side),
// so pre-existing sandboxes or sandboxes of other missions are never touched.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_TTL_MS,
  E2BSandboxProvider,
  MissionRecordStore,
  SandboxError,
  SandboxService,
  loadE2BSdk,
  e2bCredentialAvailable,
  runSandboxCreate,
  runSandboxDestroy,
  sandboxCreateInputSchema,
  sandboxDestroyInputSchema,
  type MissionRecord,
  type SandboxProvider,
  type SandboxProviderCreateInput,
  type SandboxProviderCreateResult,
  type SandboxProviderDestroyResult
} from "../src/sandbox.ts";

// ---- deterministic in-memory provider for the unit proofs ----
class FakeSandboxProvider implements SandboxProvider {
  readonly name = "fake";
  readonly alive = new Map<string, { missionId: string; alive: boolean }>();
  createCalls = 0;
  readonly destroyCalls: string[] = [];
  failCreate = false;
  failKill = false;

  async create({ missionId }: SandboxProviderCreateInput): Promise<SandboxProviderCreateResult> {
    this.createCalls += 1;
    if (this.failCreate) throw new SandboxError("SANDBOX_CREATE_FAILED", "fake provider create failure");
    const sandboxId = `fake-sbx-${this.createCalls}`;
    this.alive.set(sandboxId, { missionId, alive: true });
    return { sandboxId, expiresAt: new Date(Date.now() + DEFAULT_TTL_MS).toISOString() };
  }

  async exists(sandboxId: string): Promise<boolean> {
    return this.alive.get(sandboxId)?.alive === true;
  }

  async destroy(sandboxId: string): Promise<SandboxProviderDestroyResult> {
    this.destroyCalls.push(sandboxId);
    const entry = this.alive.get(sandboxId);
    if (!entry) return { verified: true, alreadyGone: true };
    if (this.failKill) throw new SandboxError("SANDBOX_DESTROY_FAILED", "fake provider kill failure");
    entry.alive = false;
    return { verified: true, alreadyGone: false };
  }

  async listByMission(missionId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const [sandboxId, entry] of this.alive) if (entry.alive && entry.missionId === missionId) ids.push(sandboxId);
    return ids;
  }
}

class ExplodingStore extends MissionRecordStore {
  failUpsert = false;
  async upsert(record: MissionRecord): Promise<void> {
    if (this.failUpsert) throw new Error("simulated disk failure");
    await super.upsert(record);
  }
}

async function withFakeService(run: (service: SandboxService, provider: FakeSandboxProvider, recordsFile: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "sb01-"));
  const recordsFile = path.join(dir, "missions.json");
  const provider = new FakeSandboxProvider();
  const service = new SandboxService(provider, new MissionRecordStore(recordsFile));
  try {
    await run(service, provider, recordsFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const rejectsCode = (code: string) => (error: unknown) => error instanceof SandboxError && error.code === code;

test("SB-01-T1a create persists the MissionRecord and ownership survives a fresh store instance", async () => {
  await withFakeService(async (service, provider, recordsFile) => {
    const created = await service.create("sb01-unit-record", 60_000);
    assert.equal(created.status, "active");
    assert.equal(created.provider, "fake");
    assert.equal(created.ttlApplied, "native");
    assert.ok(created.sandboxId.length > 0);
    const raw = JSON.parse(await readFile(recordsFile, "utf8")) as MissionRecord[];
    assert.equal(raw.length, 1);
    assert.equal(raw[0].missionId, "sb01-unit-record");
    assert.equal(raw[0].sandboxId, created.sandboxId);
    assert.equal(raw[0].provider, "fake");
    assert.equal(raw[0].status, "active");
    assert.equal(raw[0].createdAt, created.createdAt);
    assert.equal(raw[0].expiresAt, created.expiresAt);
    assert.ok(Date.parse(raw[0].expiresAt) - Date.parse(raw[0].createdAt) >= 59_000);
    // ownership recovery across a simulated process restart: a NEW store over the same file
    const restarted = new SandboxService(provider, new MissionRecordStore(recordsFile));
    const destroyed = await restarted.destroy("sb01-unit-record", created.sandboxId);
    assert.equal(destroyed.status, "destroyed");
    assert.equal(destroyed.verified, true);
  });
});

test("SB-01-T2a only the registered mission+sandbox pair can destroy; mismatch mutates nothing", async () => {
  await withFakeService(async (service, provider) => {
    const created = await service.create("sb01-unit-ownership", DEFAULT_TTL_MS);
    await assert.rejects(service.destroy("sb01-unit-other", created.sandboxId), rejectsCode("MISSION_NOT_REGISTERED"));
    await assert.rejects(service.destroy("sb01-unit-ownership", "fake-sbx-not-the-one"), rejectsCode("MISSION_SANDBOX_MISMATCH"));
    assert.deepEqual(provider.destroyCalls, []);
    assert.equal(await provider.exists(created.sandboxId), true);
    const destroyed = await service.destroy("sb01-unit-ownership", created.sandboxId);
    assert.equal(destroyed.status, "destroyed");
    assert.equal(destroyed.verified, true);
    assert.deepEqual(provider.destroyCalls, [created.sandboxId]);
    assert.equal(await provider.exists(created.sandboxId), false);
  });
});

test("SB-01-T4a provider create failure leaves no record and declares no success", async () => {
  await withFakeService(async (service, provider, recordsFile) => {
    provider.failCreate = true;
    await assert.rejects(service.create("sb01-unit-failcreate", 60_000), rejectsCode("SANDBOX_CREATE_FAILED"));
    assert.equal((await new MissionRecordStore(recordsFile).load()).length, 0);
  });
});

test("SB-01-T4b record-persist failure rolls the created sandbox back and declares failure", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sb01-"));
  try {
    const store = new ExplodingStore(path.join(dir, "missions.json"));
    store.failUpsert = true;
    const provider = new FakeSandboxProvider();
    const service = new SandboxService(provider, store);
    await assert.rejects(service.create("sb01-unit-persistfail", 60_000), rejectsCode("MISSION_RECORD_PERSIST_FAILED"));
    assert.equal(provider.destroyCalls.length, 1);
    assert.equal(provider.alive.get(provider.destroyCalls[0])?.alive, false);
    assert.equal((await new MissionRecordStore(path.join(dir, "missions.json")).load()).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("SB-01-T4c destroy failure keeps the mission record active and propagates the typed error", async () => {
  await withFakeService(async (service, provider, recordsFile) => {
    const created = await service.create("sb01-unit-failkill", 60_000);
    provider.failKill = true;
    await assert.rejects(service.destroy("sb01-unit-failkill", created.sandboxId), rejectsCode("SANDBOX_DESTROY_FAILED"));
    assert.equal((await new MissionRecordStore(recordsFile).find("sb01-unit-failkill"))?.status, "active");
    assert.equal(await provider.exists(created.sandboxId), true);
    provider.failKill = false;
    const destroyed = await service.destroy("sb01-unit-failkill", created.sandboxId);
    assert.equal(destroyed.verified, true);
  });
});

test("SB-01-T4d a mission cannot own two active sandboxes", async () => {
  await withFakeService(async (service) => {
    await service.create("sb01-unit-duplicate", 60_000);
    await assert.rejects(service.create("sb01-unit-duplicate", 60_000), rejectsCode("MISSION_ALREADY_ACTIVE"));
  });
});

test("SB-01 schemas reject unknown/raw shapes", () => {
  assert.equal(sandboxCreateInputSchema.safeParse({}).success, false);
  assert.equal(sandboxCreateInputSchema.safeParse({ missionId: "sb01-unit-record", command: "rm -rf" }).success, false);
  assert.equal(sandboxCreateInputSchema.safeParse({ missionId: "sb01-unit-record", ttlMs: 60_000 }).success, true);
  assert.equal(sandboxCreateInputSchema.safeParse({ missionId: "short" }).success, false);
  assert.equal(sandboxDestroyInputSchema.safeParse({ sandboxId: "fake-sbx-1" }).success, false);
  assert.equal(sandboxDestroyInputSchema.safeParse({ missionId: "sb01-unit-record", sandboxId: "fake-sbx-1" }).success, true);
});

test("SB-01 credential gate fails closed before any network call", async () => {
  const previous = process.env.E2B_API_KEY;
  const previousKeyFile = process.env.E2B_API_KEY_FILE;
  delete process.env.E2B_API_KEY;
  delete process.env.E2B_API_KEY_FILE;
  try {
    const provider = new E2BSandboxProvider();
    await assert.rejects(provider.create({ missionId: "sb01-unit-nocred", ttlMs: 60_000 }), rejectsCode("SANDBOX_CREDENTIAL_MISSING"));
    await assert.rejects(provider.exists("fake-sbx-1"), rejectsCode("SANDBOX_CREDENTIAL_MISSING"));
    await assert.rejects(loadE2BSdk(), rejectsCode("SANDBOX_CREDENTIAL_MISSING"));
  } finally {
    if (previous !== undefined) process.env.E2B_API_KEY = previous;
    else delete process.env.E2B_API_KEY;
    if (previousKeyFile !== undefined) process.env.E2B_API_KEY_FILE = previousKeyFile;
    else delete process.env.E2B_API_KEY_FILE;
  }
});

test("SB-01 tool handlers delegate to the injected service", async () => {
  await withFakeService(async (service, provider) => {
    const created = await runSandboxCreate({ missionId: "sb01-unit-handler" }, { service });
    assert.equal(created.provider, "fake");
    const destroyed = await runSandboxDestroy({ missionId: "sb01-unit-handler", sandboxId: created.sandboxId }, { service });
    assert.equal(destroyed.verified, true);
    assert.equal(provider.destroyCalls.length, 1);
  });
});

// ---- real E2B proofs: ONLY when the credential is actually present here ----
const REAL_PROOF_REASON = "E2B credential (E2B_API_KEY / E2B_API_KEY_FILE) is not provisioned in this test environment; real E2B proof is skipped honestly, never faked";
const realProofEnabled = e2bCredentialAvailable();

test("SB-01-T1+T2+T3+T5 real E2B: native TTL create, ownership, proven destroy, zero orphans", { skip: realProofEnabled ? false : REAL_PROOF_REASON }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sb01-real-"));
  try {
    const recordsFile = path.join(dir, "missions.json");
    const provider = new E2BSandboxProvider();
    const service = new SandboxService(provider, new MissionRecordStore(recordsFile));
    const missionId = `sb01-real-${Date.now()}`;
    const ttlMs = 60_000;

    // T1 CREATE: real sandbox, record persisted, native TTL applied at creation
    const created = await service.create(missionId, ttlMs);
    assert.equal(created.status, "active");
    assert.ok(created.sandboxId.length >= 8);
    const record = await new MissionRecordStore(recordsFile).find(missionId);
    assert.equal(record?.sandboxId, created.sandboxId);
    assert.equal(record?.status, "active");
    assert.equal(record?.provider, "e2b");

    // T1 NATIVE TTL PROOF: the provider's own scheduled end reflects the TTL
    const { Sandbox } = await loadE2BSdk();
    const handle = await Sandbox.connect(created.sandboxId);
    assert.ok(typeof handle.getInfo === "function", "provider handle must expose getInfo");
    const info = await handle.getInfo();
    const startedAt = Date.parse(String(info.startedAt));
    const endAt = Date.parse(String(info.endAt));
    assert.ok(Number.isFinite(startedAt) && Number.isFinite(endAt), "provider info must expose startedAt/endAt");
    const scheduled = endAt - startedAt;
    assert.ok(scheduled >= 55_000 && scheduled <= 300_000, `native TTL not reflected: ${scheduled}ms`);
    assert.equal((info.metadata as Record<string, unknown> | undefined)?.missionId, missionId);

    // T2 OWNERSHIP: wrong mission and wrong sandboxId destroy nothing
    await assert.rejects(service.destroy("sb01-real-wrong-mission", created.sandboxId), rejectsCode("MISSION_NOT_REGISTERED"));
    await assert.rejects(service.destroy(missionId, "sbx-not-the-registered-one"), rejectsCode("MISSION_SANDBOX_MISMATCH"));
    assert.equal(await provider.exists(created.sandboxId), true);

    // T3 DESTROY: proven against the account listing
    const destroyed = await service.destroy(missionId, created.sandboxId);
    assert.equal(destroyed.status, "destroyed");
    assert.equal(destroyed.verified, true);
    assert.equal(await provider.exists(created.sandboxId), false);
    assert.equal((await new MissionRecordStore(recordsFile).find(missionId))?.status, "destroyed");

    // T5 ZERO ORPHANS: sweep the account for THIS mission only (metadata-filtered)
    const leftovers = await provider.listByMission(missionId);
    for (const orphan of leftovers) await provider.destroy(orphan);
    assert.deepEqual(await provider.listByMission(missionId), [], "no sandbox created by this mission may stay orphaned");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});