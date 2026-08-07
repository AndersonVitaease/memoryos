/**
 * OIEPage.jsx — /oie
 * OIE Fase 2 (Sprint 3): "Architecture Indexer + página /oie".
 *
 * Primeira UI consumidora dos módulos das Fases 2-5 do Operational
 * Intelligence Engine (ArchitectureIndexer, HealthMonitor, TrendLayer,
 * CoverageAnalyzer, DecisionAnalyzer, EvidenceEngine, Explainer) — até
 * aqui, código completo mas sem nenhum consumidor.
 *
 * Somente leitura. Não expõe mutação, não pode corromper estado (ver
 * CLAUDE.md, sessão 2026-08-07, garantia de não-quebra #4).
 *
 * OIE é consultivo, nunca autônomo: esta página explica e recomenda,
 * nunca corrige nada sozinha.
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  HealthMonitor,
  TrendLayer,
  ArchitectureIndexer,
  CoverageAnalyzer,
  DecisionAnalyzer,
  EvidenceEngine,
  Explainer,
} from "@/lib/operational-intelligence";
import LiveExplanationsPanel from "@/components/oie/LiveExplanationsPanel";
import OIEConfigPanel from "@/components/oie/OIEConfigPanel";

const SEVERITY_COLOR = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  warning:  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  info:     "bg-zinc-500/10 text-zinc-300 border-zinc-700",
};

function Section({ title, subtitle, children }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-zinc-100 text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-semibold text-zinc-100">{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

// ── Health (Fase 4) ────────────────────────────────────────────────────────
function HealthSection() {
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    HealthMonitor.snapshot(1000).then(setSnap).catch((e) => setErr(e.message));
  }, []);

  if (err) return <Section title="Health (Fase 4)"><p className="text-red-400 text-sm">{err}</p></Section>;
  if (!snap) return <Section title="Health (Fase 4)"><p className="text-zinc-500 text-sm">Carregando…</p></Section>;

  return (
    <Section title="Health Snapshot" subtitle="HealthMonitor.snapshot() — últimas 1000 ExecutionObservation">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <Stat label="Observações" value={snap.total} />
        <Stat label="Success rate" value={`${(snap.successRate * 100).toFixed(1)}%`} />
        <Stat label="Error signatures" value={snap.topErrorSignatures.length} />
        <Stat label="Behavior signatures" value={snap.topBehaviorSignatures.length} />
      </div>
      {snap.total === 0 && (
        <p className="text-xs text-zinc-500">Nenhuma ExecutionObservation ainda — o RuntimeObserver está em shadow mode, populando conforme o uso real do MemoryOS acontece.</p>
      )}
      {snap.topBehaviorSignatures.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-zinc-400 mb-1">Top behavior_signatures (falhas silenciosas):</p>
          <div className="flex flex-wrap gap-2">
            {snap.topBehaviorSignatures.map((s) => (
              <Badge key={s.signature} variant="outline" className="border-amber-500/30 text-amber-400">
                {s.signature} × {s.count}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {snap.worstConnectors.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-zinc-400 mb-1">Connectors com maior failure rate:</p>
          <div className="flex flex-wrap gap-2">
            {snap.worstConnectors.map((c) => (
              <Badge key={c.connector} variant="outline" className="border-red-500/30 text-red-400">
                {c.connector}: {(c.failureRate * 100).toFixed(0)}%
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Architecture Map + Drift (Fase 2) ───────────────────────────────────────
function ArchitectureSection() {
  const [map, setMap] = useState(null);
  const [drift, setDrift] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      ArchitectureIndexer.buildArchitectureMap(),
      ArchitectureIndexer.validateMappingIntegrity(),
    ])
      .then(([m, d]) => { setMap(m); setDrift(d); })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <Section title="Architecture Map (Fase 2)"><p className="text-red-400 text-sm">{err}</p></Section>;
  if (!map) return <Section title="Architecture Map (Fase 2)"><p className="text-zinc-500 text-sm">Carregando…</p></Section>;

  return (
    <Section title="Architecture Map" subtitle="ArchitectureIndexer — projeção read-only do GoalCapabilityRegistry + ConnectorRegistry vivos">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Stat label="Goals" value={map.goalCount} />
        <Stat label="Connectors" value={map.connectorCount} />
        <Stat label="Capabilities esperadas" value={map.totalExpectedCapabilities} />
      </div>
      {drift && drift.findings.length === 0 && (
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">Zero drift — planejamento e runtime sincronizados</Badge>
      )}
      {drift && drift.findings.length > 0 && (
        <div>
          <p className="text-xs text-amber-400 mb-1">{drift.findings.length} drift finding(s):</p>
          <ul className="text-xs text-zinc-400 space-y-1">
            {drift.findings.map((f, i) => (
              <li key={i}>
                <Badge variant="outline" className="border-amber-500/30 text-amber-400 mr-2">{f.kind}</Badge>
                {f.goalType} → {f.connector}.{f.capability}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

// ── Trend (Fase 4) ───────────────────────────────────────────────────────────
function TrendSection() {
  const [proj, setProj] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    TrendLayer.project("failure_rate", "day", 2000).then(setProj).catch((e) => setErr(e.message));
  }, []);

  if (err) return <Section title="Trend (Fase 4)"><p className="text-red-400 text-sm">{err}</p></Section>;
  if (!proj) return <Section title="Trend (Fase 4)"><p className="text-zinc-500 text-sm">Carregando…</p></Section>;

  return (
    <Section title="Trend — failure_rate por dia" subtitle="TrendLayer.project() — projeção temporal, não é um domínio com dados próprios">
      {proj.points.length === 0 ? (
        <p className="text-xs text-zinc-500">Sem pontos ainda (precisa de ExecutionObservation com created_date suficiente).</p>
      ) : (
        <div className="space-y-1">
          {proj.points.slice(-14).map((p) => (
            <div key={p.bucket} className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500 w-24">{p.bucket}</span>
              <div className="flex-1 bg-zinc-800 rounded h-2 overflow-hidden">
                <div className="bg-amber-500 h-2" style={{ width: `${Math.min(p.value * 100, 100)}%` }} />
              </div>
              <span className="text-zinc-400 w-12 text-right">{(p.value * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Session Explainer (Fases 2.5, 3, 4.5, 5 encadeadas) ─────────────────────
function SessionExplainerSection({ externalSessionId }) {
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [explanations, setExplanations] = useState(null);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState(null);

  // Drill-in: ao clicar num alerta do LiveExplanationsPanel, repassa o
  // sessionId e dispara a analise completa automaticamente.
  useEffect(() => {
    if (externalSessionId && externalSessionId !== sessionId) {
      setSessionId(externalSessionId);
      // dispara analise apos o state atualizar
      setTimeout(() => doAnalyze(externalSessionId), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSessionId]);

  const doAnalyze = async (sid) => {
    const id = (sid ?? sessionId).trim();
    if (!id) return;
    setLoading(true);
    setErr(null);
    setExplanations(null);
    try {
      const [coverageList, decision] = await Promise.all([
        CoverageAnalyzer.analyzeRecent(id, 20),
        DecisionAnalyzer.analyzeSession(id),
      ]);
      const packets = [
        ...coverageList.flatMap((c) => EvidenceEngine.fromCoverage(c)),
        ...EvidenceEngine.fromDecision(decision),
      ];
      const expl = Explainer.explainAll(packets);
      setExplanations(expl);
      setSummary(Explainer.summarize(expl));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section
      title="Explicar uma sessão"
      subtitle="Encadeia Coverage (Fase 3) + Decision (Fase 2.5) → Evidence Engine (Fase 4.5) → Explainer (Fase 5). Consultivo — só explica, nunca corrige."
    >
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="session_id"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="bg-zinc-950 border-zinc-800 text-zinc-100"
        />
        <Button onClick={() => doAnalyze()} disabled={loading || !sessionId.trim()}>
          {loading ? "Analisando…" : "Explicar"}
        </Button>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}

      {summary && (
        <div className="flex gap-3 mb-3 text-xs">
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">{summary.total} finding(s)</Badge>
          {summary.critical > 0 && <Badge variant="outline" className="border-red-500/30 text-red-400">{summary.critical} critical</Badge>}
          {summary.warning > 0 && <Badge variant="outline" className="border-amber-500/30 text-amber-400">{summary.warning} warning</Badge>}
          {summary.info > 0 && <Badge variant="outline" className="border-zinc-700 text-zinc-400">{summary.info} info</Badge>}
        </div>
      )}

      {explanations && explanations.length === 0 && (
        <p className="text-xs text-emerald-400">Nenhuma anomalia encontrada para esta sessão — comportamento consistente.</p>
      )}

      {explanations && explanations.length > 0 && (
        <div className="space-y-3">
          {explanations.map((e, i) => (
            <div key={i} className={`border rounded p-3 text-xs ${SEVERITY_COLOR[e.severity]}`}>
              <div className="font-medium mb-1">{e.title}</div>
              <ul className="list-disc list-inside space-y-0.5 opacity-90 mb-2">
                {e.causalChain.map((step, j) => <li key={j}>{step}</li>)}
              </ul>
              <p className="opacity-80 mb-1"><strong>Recomendação:</strong> {e.recommendation}</p>
              {e.evidenceRefs.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer opacity-60">{e.evidenceRefs.length} evidência(s)</summary>
                  <ul className="mt-1 space-y-0.5 opacity-70">
                    {e.evidenceRefs.map((r, k) => <li key={k}>{r}</li>)}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export default function OIEPage() {
  // Drill-in: LiveExplanationsPanel repassa o sessionId de um alerta clicado
  // para o SessionExplainerSection analisar a sessao completa automaticamente.
  const [pickedSession, setPickedSession] = useState("");

  return (
    <div className="min-h-screen bg-zinc-950 p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Operational Intelligence Engine</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Missão: explicar continuamente o comportamento do MemoryOS. Diagnóstico é subproduto,
          learning é projeção temporal. Consultivo — nunca autônomo. Somente leitura.
        </p>
      </div>

      {/* Configuracao consultiva — master switch, modulos, limiares, bus pause */}
      <OIEConfigPanel />

      {/* Track 2 — explicações ao vivo (rolling cache do OIEAlertBus) */}
      <Section
        title="Explicações ao vivo"
        subtitle="OIEOrchestrator → OIEAlertBus — findings critical/warning das execuções recentes do pipeline, sem precisar digitar session_id. Clique num alerta para analisar a sessão completa abaixo."
      >
        <LiveExplanationsPanel onPickSession={setPickedSession} />
      </Section>

      <HealthSection />
      <ArchitectureSection />
      <TrendSection />
      <SessionExplainerSection externalSessionId={pickedSession} />
    </div>
  );
}