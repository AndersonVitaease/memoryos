/**
 * VoiceVisualizer.jsx — Voice Interaction Platform (VIP)
 * Pure rendering component. No capture logic.
 * Modes: bars | wave | orb
 */

import React, { useRef, useEffect } from "react";

// ─── Bars mode ─────────────────────────────────────────────────────────────────

function BarsVisualizer({ bars, amplitude, color = "#8b5cf6", width = 200, height = 48 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!bars || bars.length === 0) {
      // Idle state — flat line
      ctx.strokeStyle = color + "60";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      return;
    }

    const count = Math.min(bars.length, 32);
    const barW = (W / count) * 0.7;
    const gap = (W / count) * 0.3;

    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const v = bars[i] / 255;
      const barH = Math.max(2, v * H);
      const x = i * (barW + gap);
      const y = (H - barH) / 2;
      ctx.globalAlpha = 0.3 + v * 0.7;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [bars, amplitude, color]);

  return <canvas ref={canvasRef} width={width} height={height} className="w-full h-full" />;
}

// ─── Wave mode ─────────────────────────────────────────────────────────────────

function WaveVisualizer({ bars, amplitude, color = "#8b5cf6", width = 200, height = 48 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (!bars || bars.length === 0) {
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
    } else {
      const step = W / bars.length;
      for (let i = 0; i < bars.length; i++) {
        const v = (bars[i] / 255) * 2 - 1; // -1 to 1
        const x = i * step;
        const y = H / 2 + v * (H / 2) * 0.8;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }, [bars, amplitude, color]);

  return <canvas ref={canvasRef} width={width} height={height} className="w-full h-full" />;
}

// ─── Orb mode ─────────────────────────────────────────────────────────────────

function OrbVisualizer({ amplitude, energy, phase }) {
  const scale = 1 + amplitude * 0.5;
  const glow = Math.round(energy * 40);

  const colors = {
    listening: ["from-red-400", "to-red-600", `rgba(239,68,68,0.${Math.round(energy * 60)})`],
    speaking: ["from-emerald-400", "to-emerald-600", `rgba(16,185,129,0.${Math.round(energy * 60)})`],
    idle: ["from-violet-400", "to-indigo-600", "rgba(139,92,246,0.1)"],
  };
  const [from, to, shadow] = colors[phase === "listening" ? "listening" : phase === "speaking" ? "speaking" : "idle"];

  return (
    <div className="flex items-center justify-center w-20 h-20">
      <div
        className={`w-16 h-16 rounded-full bg-gradient-to-br ${from} ${to} transition-transform duration-100`}
        style={{
          transform: `scale(${scale})`,
          boxShadow: `0 0 ${glow}px ${shadow}`,
        }}
      />
    </div>
  );
}

// ─── VoiceVisualizer ──────────────────────────────────────────────────────────

export default function VoiceVisualizer({
  mode = "bars",
  waveform,
  phase = "idle",
  color,
  width = 200,
  height = 48,
}) {
  const amplitude = waveform?.amplitude ?? 0;
  const energy = waveform?.energy ?? 0;
  const bars = waveform?.bars ?? null;
  const c = color ?? (phase === "listening" ? "#ef4444" : phase === "speaking" ? "#10b981" : "#8b5cf6");

  if (mode === "orb") {
    return <OrbVisualizer amplitude={amplitude} energy={energy} phase={phase} />;
  }
  if (mode === "wave") {
    return (
      <div style={{ width, height }}>
        <WaveVisualizer bars={bars} amplitude={amplitude} color={c} width={width} height={height} />
      </div>
    );
  }
  return (
    <div style={{ width, height }}>
      <BarsVisualizer bars={bars} amplitude={amplitude} color={c} width={width} height={height} />
    </div>
  );
}