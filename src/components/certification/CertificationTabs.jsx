// CertificationTabs.jsx — Sprint EF-39.6 — SRP: renders tab bar only
import React from "react";

export const TAB_IDS = [
  "summary","tests","architecture","ast","source","solid",
  "performance","integrity","immutability","deps","smells",
  "evidence","failures","timing",
];

export default function CertificationTabs({ activeTab, setActiveTab, failureCount }) {
  return (
    <div className="flex gap-0.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
      {TAB_IDS.map(t => (
        <button key={t} onClick={() => setActiveTab(t)}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap capitalize min-w-[60px] ${
            activeTab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"
          }`}>
          {t}{t === "failures" && failureCount > 0 ? ` (${failureCount})` : ""}
        </button>
      ))}
    </div>
  );
}