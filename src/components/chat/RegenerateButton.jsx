import React from "react";
import { RotateCcw } from "lucide-react";

export default function RegenerateButton({ onRegenerate, disabled }) {
  return (
    <button
      type="button"
      onClick={onRegenerate}
      disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-violet-600 hover:bg-violet-50 transition disabled:opacity-30 disabled:hover:text-zinc-400 disabled:hover:bg-transparent"
      title="Regenerar resposta"
    >
      <RotateCcw className="w-3 h-3" />
      Regenerar
    </button>
  );
}