/**
 * VoiceVisualizer.jsx — Voice Experience Platform (VXP)
 * Sprint 7.0.1: requestAnimationFrame-driven 60fps rendering.
 * Modes: bars | wave | orb
 * No fake animation — all driven by real VoiceAnalyzer data.
 */

import React, { useRef, useEffect } from "react";

// ─── Bars mode — rAF driven ───────────────────────────────────────────────────

function BarsVisualizer({ waveform, color = "#8b5cf6", width = 200, height = 48, animated = false }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const waveformRef = useRef(waveform);

  useEffect(() => { waveformRef.current = waveform; }, [waveform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const wf = waveformRef.current;

      ctx.clearRect(0, 0, W, H);

      if (!wf || !wf.bars || wf.bars.length === 0) {
        // Flat idle line
        ctx.strokeStyle = color + "50";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
      } else {
        const bars = wf.bars;
        const count = Math.min(bars.length, 32);
        const barW = (W / count) * 0.65;
        const gap = (W / count) * 0.35;

        for (let i = 0; i < count; i++) {
          const v = bars[i] / 255;
          const barH = Math.max(2, v * H);
          const x = i * (barW + gap);
          const y = (H - barH) / 2;
          ctx.globalAlpha = 0.25 + v * 0.75;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (animated) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, animated]);

  // Non-animated: redraw when waveform changes
  useEffect(() => {
    if (animated) return; // rAF handles it
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!waveform || !waveform.bars || waveform.bars.length === 0) {
      ctx.strokeStyle = color + "50";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      return;
    }

    const bars = waveform.bars;
    const count = Math.min(bars.length, 32);
    const barW = (W / count) * 0.65;
    const gap = (W / count) * 0.35;

    for (let i = 0; i < count; i++) {
      const v = bars[i] / 255;
      const barH = Math.max(2, v * H);
      const x = i * (barW + gap);
      const y = (H - barH) / 2;
      ctx.globalAlpha = 0.25 + v * 0.75;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [waveform, color, animated]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full"
      aria-hidden="true"
    />
  );
}

// ─── Wave mode ────────────────────────────────────────────────────────────────

function WaveVisualizer({ waveform, color = "#8b5cf6", width = 200, height = 48, animated = false }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const waveformRef = useRef(waveform);

  useEffect(() => { waveformRef.current = waveform; }, [waveform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const wf = waveformRef.current;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      if (!wf || !wf.bars || wf.bars.length === 0) {
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
      } else {
        const step = W / wf.bars.length;
        for (let i = 0; i < wf.bars.length; i++) {
          const v = (wf.bars[i] / 255) * 2 - 1;
          const x = i * step;
          const y = H / 2 + v * (H / 2) * 0.8;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      if (animated) rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, animated]);

  useEffect(() => {
    if (animated) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (!waveform || !waveform.bars || waveform.bars.length === 0) {
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
    } else {
      const step = W / waveform.bars.length;
      for (let i = 0; i < waveform.bars.length; i++) {
        const v = (waveform.bars[i] / 255) * 2 - 1;
        const x = i * step;
        const y = H / 2 + v * (H / 2) * 0.8;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }, [waveform, color, animated]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full"
      aria-hidden="true"
    />
  );
}

// ─── Orb mode ─────────────────────────────────────────────────────────────────

function OrbVisualizer({ amplitude, energy, phase }) {
  const scale = 1 + amplitude * 0.5;
  const glow = Math.round(energy * 40);

  const colors = {
    listening: { from: "from-red-400", to: "to-red-600", shadow: `rgba(239,68,68,0.${Math.min(Math.round(energy * 60), 9)})` },
    speaking:  { from: "from-emerald-400", to: "to-emerald-600", shadow: `rgba(16,185,129,0.${Math.min(Math.round(energy * 60), 9)})` },
    idle:      { from: "from-violet-400", to: "to-indigo-600", shadow: "rgba(139,92,246,0.15)" },
  };

  const c = colors[phase === "listening" ? "listening" : phase === "speaking" ? "speaking" : "idle"];

  return (
    <div className="flex items-center justify-center w-20 h-20" aria-hidden="true">
      <div
        className={`w-16 h-16 rounded-full bg-gradient-to-br ${c.from} ${c.to} transition-transform duration-75`}
        style={{
          transform: `scale(${scale})`,
          boxShadow: `0 0 ${glow}px ${c.shadow}`,
          willChange: "transform, box-shadow",
        }}
      />
    </div>
  );
}

// ─── VoiceVisualizer (main export) ────────────────────────────────────────────

export default function VoiceVisualizer({
  mode = "bars",
  waveform,
  phase = "idle",
  color,
  width = 200,
  height = 48,
  animated = false,
}) {
  const amplitude = waveform?.amplitude ?? 0;
  const energy = waveform?.energy ?? 0;
  const c = color ?? (phase === "listening" ? "#ef4444" : phase === "speaking" ? "#10b981" : "#8b5cf6");

  if (mode === "orb") {
    return <OrbVisualizer amplitude={amplitude} energy={energy} phase={phase} />;
  }

  if (mode === "wave") {
    return (
      <div style={{ width, height }}>
        <WaveVisualizer waveform={waveform} color={c} width={width} height={height} animated={animated} />
      </div>
    );
  }

  return (
    <div style={{ width, height }}>
      <BarsVisualizer waveform={waveform} color={c} width={width} height={height} animated={animated} />
    </div>
  );
}