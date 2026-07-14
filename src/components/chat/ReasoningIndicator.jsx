/**
 * ReasoningIndicator.jsx
 * Progressive reasoning phase display.
 * Shows: Recuperando memoria... → Consultando especialistas... → etc.
 */

import React from "react";
import { Loader2 } from "lucide-react";

const DEFAULT_LABEL = "Consultando a memoria...";

export default function ReasoningIndicator({ label }) {
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <Loader2 className="w-4 h-4 animate-spin text-violet-500 shrink-0" />
      <span className="text-sm text-zinc-400 transition-all duration-300">
        {label || DEFAULT_LABEL}
      </span>
    </div>
  );
}