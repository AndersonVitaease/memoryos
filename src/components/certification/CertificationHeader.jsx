// CertificationHeader.jsx — Sprint EF-39.6 — SRP: renders header only
import React from "react";

export default function CertificationHeader() {
  return (
    <div className="border border-violet-700/60 rounded-xl p-5 bg-violet-950/10">
      <div className="text-zinc-500 text-xs tracking-widest mb-1">
        SPRINT EF-39.6 — MODULAR ARCHITECTURAL CERTIFICATION ENGINE
      </div>
      <div className="text-xl font-bold">MemoryStore — Full Certification Run</div>
      <div className="text-zinc-400 text-sm mt-1">
        Rule-based source analysis · Plugin auditor registry · Score engine · Report builder · Zero mocks
      </div>
    </div>
  );
}