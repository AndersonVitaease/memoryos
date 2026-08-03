import React from "react";
import { MessageSquareText, ListChecks, CalendarClock, Lightbulb } from "lucide-react";

const PROMPTS = [
  { icon: MessageSquareText, label: "Resuma minhas ultimas conversas" },
  { icon: ListChecks, label: "Quais tarefas pendentes eu tenho?" },
  { icon: CalendarClock, label: "Lembre-me de compromissos proximos" },
  { icon: Lightbulb, label: "O que eu decidi recentemente?" },
];

export default function SuggestedPrompts({ onPick }) {
  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
      {PROMPTS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p.label)}
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-white hover:border-violet-300 hover:bg-violet-50/50 text-left transition group"
        >
          <p.icon className="w-4 h-4 text-zinc-400 group-hover:text-violet-500 shrink-0 transition" />
          <span className="text-sm text-zinc-600 group-hover:text-zinc-800 transition">
            {p.label}
          </span>
        </button>
      ))}
    </div>
  );
}