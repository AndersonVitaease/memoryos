import React from "react";

export function Panel({ title, children, accent = "#27272a" }) {
  return (
    <div style={{ background: "#18181b", border: `1px solid ${accent}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: "#52525b", letterSpacing: 1.5, marginBottom: 10, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

export function Row({ children, color = "#a1a1aa" }) {
  return <div style={{ fontSize: 10, color, marginBottom: 3, lineHeight: 1.5 }}>{children}</div>;
}

export function Stat({ label, value, sub, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#52525b", letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: "bold", color }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#52525b" }}>{sub}</div>}
    </div>
  );
}