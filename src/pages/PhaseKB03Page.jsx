/**
 * PhaseKB03Page.jsx — Sprint KB-03 Dashboard
 * Knowledge Capture Engine
 * Route: /kb03
 */

import React, { useState, useMemo } from "react";
import { KCEPipeline }   from "@/lib/operational-knowledge/capture/KCEPipeline";
import { KCEValidator }  from "@/lib/operational-knowledge/capture/KCEValidator";
import { KCECaptureStore } from "@/lib/operational-knowledge/capture/KCECaptureStore";

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_TYPES = [
  "MANUAL_FORM", "INCIDENT_REPORT", "SPRINT_RETROSPECTIVE",
  "CODE_REVIEW", "OBSERVATION", "REGRESSION",
  "SEARCH_GAP", "VALIDATION_FAILURE",
];

const PRIORITY_COLORS = {
  CRITICAL: "bg-red-900 text-red-200 border-red-700",
  HIGH:     "bg-orange-900 text-orange-200 border-orange-700",
  MEDIUM:   "bg-yellow-900/60 text-yellow-200 border-yellow-800",
  LOW:      "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const STATUS_COLORS = {
  DRAFT:      "text-zinc-400",
  PENDING:    "text-sky-400",
  CLASSIFIED: "text-violet-400",
  PROMOTED:   "text-emerald-400",
  REJECTED:   "text-red-400",
  ARCHIVED:   "text-zinc-600",
};

const TARGET_COLORS = {
  LESSONS_LEARNED:    "bg-sky-900/50 text-sky-300 border-sky-800",
  ANTI_PATTERNS:      "bg-red-900/50 text-red-300 border-red-800",
  BEST_PRACTICES:     "bg-emerald-900/50 text-emerald-300 border-emerald-800",
  KNOWN_ISSUES:       "bg-amber-900/50 text-amber-300 border-amber-800",
  TROUBLESHOOTING:    "bg-blue-900/50 text-blue-300 border-blue-800",
  ENGINEERING_JOURNAL:"bg-zinc-800 text-zinc-300 border-zinc-700",
  EVIDENCE:           "bg-violet-900/50 text-violet-300 border-violet-800",
  ALL:                "bg-zinc-800 text-zinc-300 border-zinc-700",
};

const TABS = [
  { id: "capture",  label: "Capture"    },
  { id: "pipeline", label: "Pipeline"   },
  { id: "captures", label: "All Captures"},
  { id: "stats",    label: "Stats"      },
];

// ── Empty form state ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title:      "",
  what:       "",
  why:        "",
  how:        "",
  outcome:    "",
  sprint:     "",
  components: "",
  files:      "",
  tags:       "",
  sourceType: "MANUAL_FORM",
  priority:   "MEDIUM",
  capturedBy: "Engineering",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ label, style }) {
  return <span className={`text-xs font-mono px-2 py-0.5 rounded border ${style}`}>{label}</span>;
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-zinc-400 text-xs mb-1 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, className = "" }) {
  return (
    <input
      value={value} onChange={onChange} placeholder={placeholder}
      className={`w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-600 ${className}`}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-600 resize-none"
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={onChange}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-600">
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ClassificationPanel({ classification }) {
  if (!classification) return null;
  return (
    <div className="border border-violet-800 rounded-xl p-4 bg-violet-950/20 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-violet-300 font-mono text-sm font-bold">AUTO-CLASSIFICATION</div>
        <div className="text-violet-400 font-mono text-xs">confidence: {Math.round(classification.confidence * 100)}%</div>
      </div>
      <div className="text-zinc-400 text-xs">{classification.reasoning}</div>
      <div>
        <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Suggested Targets</div>
        <div className="flex flex-wrap gap-1">
          {classification.suggestedTargets.map(t =>
            <Badge key={t} label={t} style={TARGET_COLORS[t] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
          )}
        </div>
      </div>
      <div>
        <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Keywords Extracted</div>
        <div className="flex flex-wrap gap-1">
          {classification.keywords.slice(0, 10).map(k =>
            <Badge key={k} label={k} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
          )}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap text-xs">
        {classification.isLesson       && <span className="text-sky-400">✓ Lesson</span>}
        {classification.isAntiPattern  && <span className="text-red-400">✓ Anti-Pattern</span>}
        {classification.isBestPractice && <span className="text-emerald-400">✓ Best Practice</span>}
        {classification.isKnownIssue   && <span className="text-amber-400">✓ Known Issue</span>}
      </div>
    </div>
  );
}

function PromotionPanel({ promotion }) {
  if (!promotion) return null;
  return (
    <div className="border border-emerald-800 rounded-xl p-4 bg-emerald-950/20 space-y-2">
      <div className="text-emerald-300 font-mono text-sm font-bold">PROMOTED ✓</div>
      <div className="text-zinc-400 text-xs">{promotion.summary}</div>
      <div>
        <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Generated IDs</div>
        <div className="flex flex-wrap gap-1">
          {promotion.generatedIds.map(id =>
            <Badge key={id} label={id} style="bg-zinc-800 text-emerald-400 border-emerald-800" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PhaseKB03Page() {
  const [activeTab,  setActiveTab]  = useState("capture");
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [lastResult, setLastResult] = useState(null);
  const [validation, setValidation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const stats    = useMemo(() => KCEPipeline.getStats(), [refreshKey]);
  const allCaptures = useMemo(() => KCECaptureStore.getAll(), [refreshKey]);

  function field(key) {
    return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) };
  }

  function handlePreview() {
    const raw = buildRaw();
    setValidation(KCEValidator.validate(raw));
  }

  function buildRaw() {
    return {
      title:       form.title,
      what:        form.what,
      why:         form.why,
      how:         form.how,
      outcome:     form.outcome,
      sprint:      form.sprint || undefined,
      components:  form.components ? form.components.split(",").map(s => s.trim()).filter(Boolean) : [],
      files:       form.files      ? form.files.split(",").map(s => s.trim()).filter(Boolean) : [],
      tags:        form.tags       ? form.tags.split(",").map(s => s.trim()).filter(Boolean) : [],
      sourceType:  form.sourceType,
      priority:    form.priority,
      capturedAt:  new Date().toISOString().split("T")[0],
      capturedBy:  form.capturedBy,
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    const raw    = buildRaw();
    const vr     = KCEValidator.validate(raw);
    setValidation(vr);
    if (!vr.valid) return;

    setSubmitting(true);
    const result = KCEPipeline.run(raw);
    setLastResult(result);
    setRefreshKey(k => k + 1);
    setActiveTab("pipeline");
    setForm(EMPTY_FORM);
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT KB-03 — KNOWLEDGE CAPTURE ENGINE</div>
          <div className="text-xl font-bold text-white">Knowledge Capture Engine</div>
          <div className="text-zinc-400 text-sm mt-1">
            Structured capture pipeline: Raw Input → Validation → Classification → Promotion → KB
          </div>
        </div>

        {/* Pipeline Flow */}
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["KCEValidator","KCECaptureStore","KCEClassifier","KCEPromoter","KB Targets"].map((s, i, arr) => (
              <React.Fragment key={s}>
                <span className={`border rounded px-2 py-1 ${
                  i === 0 ? "border-sky-700 text-sky-300" :
                  i === arr.length - 1 ? "border-emerald-700 text-emerald-300" :
                  "border-zinc-700 text-zinc-400"}`}>{s}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-violet-300">{stats.total}</div>
            <div className="text-zinc-500 text-xs mt-1">Total Captures</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{stats.promotedCount}</div>
            <div className="text-zinc-500 text-xs mt-1">Promoted</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-sky-300">{Math.round(stats.avgConfidence * 100)}%</div>
            <div className="text-zinc-500 text-xs mt-1">Avg Confidence</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-amber-300">{stats.topTargets.length}</div>
            <div className="text-zinc-500 text-xs mt-1">Active Targets</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Capture Form */}
        {activeTab === "capture" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900 space-y-4">
              <div className="text-zinc-400 text-xs tracking-widest">CAPTURE FORM — REQUIRED</div>

              <Field label="Title *">
                <Input {...field("title")} placeholder="Short descriptive title" />
              </Field>
              <Field label="What happened? *">
                <Textarea {...field("what")} placeholder="Describe the problem, incident, or observation..." />
              </Field>
              <Field label="Why did it happen? (Root Cause) *">
                <Textarea {...field("why")} placeholder="Root cause after investigation..." />
              </Field>
              <Field label="How was it fixed? (Solution) *">
                <Textarea {...field("how")} placeholder="Steps taken to resolve..." />
              </Field>
              <Field label="Outcome *">
                <Input {...field("outcome")} placeholder="Result after applying the fix" />
              </Field>
            </div>

            <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900 space-y-4">
              <div className="text-zinc-400 text-xs tracking-widest">OPTIONAL METADATA</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Sprint">
                  <Input {...field("sprint")} placeholder="e.g. KB-03" />
                </Field>
                <Field label="Captured By">
                  <Input {...field("capturedBy")} placeholder="Author" />
                </Field>
                <Field label="Source Type">
                  <Select {...field("sourceType")} options={SOURCE_TYPES} />
                </Field>
                <Field label="Priority">
                  <Select {...field("priority")} options={["CRITICAL","HIGH","MEDIUM","LOW"]} />
                </Field>
              </div>

              <Field label="Components (comma-separated)">
                <Input {...field("components")} placeholder="e.g. ExecutionChain, GoogleOAuthToken" />
              </Field>
              <Field label="Files Changed (comma-separated)">
                <Input {...field("files")} placeholder="e.g. src/lib/foo/Bar.ts" />
              </Field>
              <Field label="Tags (comma-separated)">
                <Input {...field("tags")} placeholder="e.g. oauth, token, pipeline" />
              </Field>
            </div>

            {/* Validation feedback */}
            {validation && !validation.valid && (
              <div className="border border-red-800 rounded-lg p-3 bg-red-950/20 space-y-1">
                {validation.errors.map((e, i) => <div key={i} className="text-red-400 text-xs">✗ {e}</div>)}
              </div>
            )}
            {validation?.warnings?.length > 0 && (
              <div className="border border-yellow-800 rounded-lg p-3 bg-yellow-950/10 space-y-1">
                {validation.warnings.map((w, i) => <div key={i} className="text-yellow-400 text-xs">⚠ {w}</div>)}
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={handlePreview}
                className="bg-zinc-700 hover:bg-zinc-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold">
                Preview & Validate
              </button>
              <button type="submit" disabled={submitting}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
                {submitting ? "Capturing..." : "Submit to Pipeline"}
              </button>
            </div>
          </form>
        )}

        {/* Pipeline Result */}
        {activeTab === "pipeline" && (
          <div className="space-y-4">
            {!lastResult && (
              <div className="border border-zinc-700 rounded-lg p-8 text-center text-zinc-500 bg-zinc-900">
                No pipeline result yet. Submit a capture first.
              </div>
            )}
            {lastResult && (
              <>
                <div className={`border-2 rounded-xl p-5 ${lastResult.success ? "border-emerald-600 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
                  <div className={`text-lg font-bold ${lastResult.success ? "text-emerald-400" : "text-red-400"}`}>
                    {lastResult.success ? "✓ CAPTURE PIPELINE COMPLETE" : "✗ PIPELINE ERRORS"}
                  </div>
                  <div className="text-zinc-400 text-sm mt-1">
                    {lastResult.capture.id} · {lastResult.durationMs}ms · Status: {" "}
                    <span className={STATUS_COLORS[lastResult.capture.status]}>{lastResult.capture.status}</span>
                  </div>
                </div>

                <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 space-y-2">
                  <div className="text-zinc-400 text-xs tracking-widest mb-2">CAPTURED RAW INPUT</div>
                  <div className="text-white text-sm font-semibold">{lastResult.capture.raw.title}</div>
                  <div className="text-zinc-400 text-xs">{lastResult.capture.raw.what}</div>
                  <div className="flex gap-2 flex-wrap mt-2">
                    <Badge label={lastResult.capture.raw.priority} style={PRIORITY_COLORS[lastResult.capture.raw.priority] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                    <Badge label={lastResult.capture.raw.sourceType} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
                    {lastResult.capture.raw.sprint && <Badge label={lastResult.capture.raw.sprint} style="bg-zinc-800 text-violet-400 border-violet-800" />}
                  </div>
                </div>

                <ClassificationPanel classification={lastResult.classification} />
                <PromotionPanel promotion={lastResult.promotion} />
              </>
            )}
          </div>
        )}

        {/* All Captures */}
        {activeTab === "captures" && (
          <div className="border border-zinc-700 rounded-lg bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              ALL CAPTURES — {allCaptures.length}
            </div>
            {allCaptures.length === 0 && (
              <div className="px-4 py-8 text-center text-zinc-500 text-sm">No captures yet. Submit one from the Capture tab.</div>
            )}
            {allCaptures.map(c => (
              <div key={c.id} className="px-4 py-3 border-b border-zinc-800 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-zinc-500 font-mono text-xs">{c.id}</span>
                  <span className={`text-xs font-mono ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                  <Badge label={c.raw.priority} style={PRIORITY_COLORS[c.raw.priority] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                </div>
                <div className="text-zinc-300 text-sm">{c.raw.title}</div>
                <div className="text-zinc-500 text-xs mt-0.5">{c.raw.sourceType} · {c.createdAt}</div>
                {c.classification && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.classification.suggestedTargets.map(t =>
                      <Badge key={t} label={t} style={TARGET_COLORS[t] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                    )}
                  </div>
                )}
                {c.promotion && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.promotion.generatedIds.map(id =>
                      <Badge key={id} label={id} style="bg-emerald-900/40 text-emerald-400 border-emerald-800" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        {activeTab === "stats" && (
          <div className="space-y-4">
            {stats.topTargets.length > 0 && (
              <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">TOP KB TARGETS</div>
                {stats.topTargets.map(({ target, count }) => (
                  <div key={target} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 last:border-0">
                    <Badge label={target} style={TARGET_COLORS[target] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
                    <span className="text-violet-400 font-mono text-xs">{count}x</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {Object.entries(stats.byStatus ?? {}).length > 0 && (
                <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">BY STATUS</div>
                  {Object.entries(stats.byStatus).map(([k, v]) => (
                    <div key={k} className="flex justify-between px-4 py-2 border-b border-zinc-800 last:border-0">
                      <span className={`text-xs font-mono ${STATUS_COLORS[k] ?? "text-zinc-400"}`}>{k}</span>
                      <span className="text-zinc-400 font-mono text-xs">{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {Object.entries(stats.bySource ?? {}).length > 0 && (
                <div className="border border-zinc-700 rounded-lg bg-zinc-900">
                  <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">BY SOURCE</div>
                  {Object.entries(stats.bySource).map(([k, v]) => (
                    <div key={k} className="flex justify-between px-4 py-2 border-b border-zinc-800 last:border-0">
                      <span className="text-zinc-400 text-xs">{k.replace(/_/g, " ")}</span>
                      <span className="text-zinc-400 font-mono text-xs">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {stats.total === 0 && (
              <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm bg-zinc-900">
                Submit captures to see statistics here.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}