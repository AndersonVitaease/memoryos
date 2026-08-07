/**
 * OIEConfigPanel.jsx — painel de configuracao consultiva do OIE.
 *
 * Montado em /oie. Le e escreve `OIEConfig` (localStorage-backed).
 * Master switch + toggles por modulo + limiares de deteccao + pause do
 * AlertBus. Mudancas aplicam-se a proxima execucao do Orchestrator /
 * proximo publish do bus — sem restart.
 *
 * Continua consultivo: configurar NUNCA da ao OIE poder de agir. So
 * controla o que roda, com que limiares, e se os alertas sao publicados.
 */

import { useState, useEffect, useSyncExternalStore } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { OIEConfig } from "@/lib/operational-intelligence";

const MODULE_LABELS = [
  { key: "coverage", label: "Coverage Analyzer", hint: "Detecta falhas silenciosas (NoConnectorExecution, PartialTraversal…)" },
  { key: "decision", label: "Decision Analyzer", hint: "Detecta roteamento inconsistente e pergunta repetida" },
  { key: "regression", label: "Regression Analyzer", hint: "Compara sprints e detecta regressao de assinaturas" },
  { key: "evidence", label: "Evidence Engine", hint: "Costura analises em EvidencePackets com provenance" },
  { key: "explainer", label: "Explainer", hint: "Gera explicacoes determinísticas por template" },
  { key: "prediction", label: "Anomaly Predictor", hint: "Regressão linear sobre buckets — prevê breach de limiares (determinístico, sem LLM)" },
  { key: "alerts", label: "Alertas (bus)", hint: "Publica critical/warning no OIEAlertBus (toasts + painel)" },
];

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-zinc-800 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-zinc-100">{label}</div>
        {hint && <div className="text-xs text-zinc-500 mt-0.5">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberField({ label, value, onChange, hint, min = 0, step = 0.01, suffix }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-400">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="bg-zinc-950 border-zinc-800 text-zinc-100 h-9"
        />
        {suffix && <span className="text-xs text-zinc-500 whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}

export default function OIEConfigPanel() {
  // useSyncExternalStore: re-renderiza quando OIEConfig muda (de qualquer origem).
  const config = useSyncExternalStore(
    (cb) => OIEConfig.subscribe(cb),
    () => OIEConfig.get(),
    () => OIEConfig.get(),
  );

  // Inputs de limiar editaveis localmente; aplicam on blur / Enter pra evitar
  // re-render do orchestrator a cada tecla (o store notifica listeners).
  const [draftWarn, setDraftWarn] = useState(() => config.thresholds.failureRateWarning);
  const [draftCrit, setDraftCrit] = useState(() => config.thresholds.failureRateCritical);
  const [draftCooldown, setDraftCooldown] = useState(() => config.thresholds.alertCooldownMs);
  const [draftHorizon, setDraftHorizon] = useState(() => config.thresholds.predictionHorizonBuckets);
  const [draftMinSamples, setDraftMinSamples] = useState(() => config.thresholds.predictionMinSamples);
  const [draftSlope, setDraftSlope] = useState(() => config.thresholds.predictionSlopeSignificance);

  useEffect(() => {
    setDraftWarn(config.thresholds.failureRateWarning);
    setDraftCrit(config.thresholds.failureRateCritical);
    setDraftCooldown(config.thresholds.alertCooldownMs);
    setDraftHorizon(config.thresholds.predictionHorizonBuckets);
    setDraftMinSamples(config.thresholds.predictionMinSamples);
    setDraftSlope(config.thresholds.predictionSlopeSignificance);
  }, [
    config.thresholds.failureRateWarning, config.thresholds.failureRateCritical, config.thresholds.alertCooldownMs,
    config.thresholds.predictionHorizonBuckets, config.thresholds.predictionMinSamples, config.thresholds.predictionSlopeSignificance,
  ]);

  const applyThresholds = () => {
    OIEConfig.update({
      thresholds: {
        failureRateWarning: Math.max(0, Math.min(1, draftWarn || 0)),
        failureRateCritical: Math.max(0, Math.min(1, draftCrit || 0)),
        alertCooldownMs: Math.max(0, Math.round(draftCooldown || 0)),
        predictionHorizonBuckets: Math.max(1, Math.round(draftHorizon || 3)),
        predictionMinSamples: Math.max(2, Math.round(draftMinSamples || 4)),
        predictionSlopeSignificance: Math.max(0, draftSlope || 0),
      },
    });
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-zinc-100 text-base">Configuração do OIE</CardTitle>
          {config.enabled
            ? <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">ativo</Badge>
            : <Badge variant="outline" className="border-zinc-700 text-zinc-400">pausado</Badge>}
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Consultivo — controla o que roda e com que limiares, nunca dá poder de agir. Mudanças aplicam-se à próxima execução do Orchestrator.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Master switch + Bus pause */}
        <ToggleRow
          label="OIE ativo (master switch)"
          hint="Desligado: o Orchestrator retorna vazio — nenhuma análise roda, nenhum alerta é publicado."
          checked={config.enabled}
          onChange={(v) => OIEConfig.update({ enabled: v })}
        />
        <ToggleRow
          label="Pausar AlertBus"
          hint="Ligado: OIEAlertBus.publish vira no-op — sem toasts, sem popular o painel ao vivo. As análises continuam rodando."
          checked={config.alertBusPaused}
          onChange={(v) => OIEConfig.update({ alertBusPaused: v })}
        />

        {/* Módulos */}
        <div>
          <div className="text-sm text-zinc-200 mb-1">Módulos</div>
          <div className="rounded-md border border-zinc-800 px-3">
            {MODULE_LABELS.map((m) => (
              <ToggleRow
                key={m.key}
                label={m.label}
                hint={m.hint}
                checked={config.modules[m.key]}
                onChange={(v) => OIEConfig.update({ modules: { [m.key]: v } })}
              />
            ))}
          </div>
          <p className="text-[11px] text-zinc-600 mt-1.5">
            Desligar Evidence ou Explainer faz o Orchestrator produzir análise sem packets/explicações. Útil pra isolar custos de DB de um módulo específico.
          </p>
        </div>

        {/* Limiares */}
        <div>
          <div className="text-sm text-zinc-200 mb-2">Limiares de detecção</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <NumberField
              label="Delta de failure_rate (warning)"
              value={draftWarn}
              onChange={setDraftWarn}
              hint="Acima de quanto (em pts) entre sprints conta como regressão. 0.05 = 5pts."
              min={0}
              step={0.01}
            />
            <NumberField
              label="Failure_rate absoluta (critical)"
              value={draftCrit}
              onChange={setDraftCrit}
              hint="Sprint atual abaixo disso: failure_rate_increase vira warning, não critical. 0.15 = 15%."
              min={0}
              step={0.01}
            />
            <NumberField
              label="Cooldown de alertas"
              value={draftCooldown}
              onChange={setDraftCooldown}
              hint="Janela entre alertas de mesmo id. 60000 = 60s. 0 = sem cooldown."
              min={0}
              step={1000}
              suffix="ms"
            />
            <NumberField
              label="Horizonte de projeção (buckets)"
              value={draftHorizon}
              onChange={setDraftHorizon}
              hint="Quantos buckets a frente o AnomalyPredictor extrapola. 3 = 3 dias (granularidade day)."
              min={1}
              step={1}
              suffix="buckets"
            />
            <NumberField
              label="Amostras mínimas para trend"
              value={draftMinSamples}
              onChange={setDraftMinSamples}
              hint="Abaixo disso não projeta — poucos buckets = slope não confiável. Mín. 2."
              min={2}
              step={1}
              suffix="buckets"
            />
            <NumberField
              label="Slope mínimo (significância)"
              value={draftSlope}
              onChange={setDraftSlope}
              hint="Slope por bucket acima do qual conta como 'subindo'. 0.02 = 2pts/bucket. 0 = qualquer subida."
              min={0}
              step={0.005}
            />
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={applyThresholds}>Aplicar limiares</Button>
            <Button size="sm" variant="outline" onClick={() => OIEConfig.reset()} className="border-zinc-700 text-zinc-300">
              Restaurar padrão
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}