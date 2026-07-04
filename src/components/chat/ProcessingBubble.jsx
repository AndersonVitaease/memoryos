import React from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { PROCESSING_STAGES, TYPE_EMOJIS } from "@/lib/knowledgeIngestionPipeline";

export default function ProcessingBubble({ item }) {
  const currentStageIndex = PROCESSING_STAGES.findIndex(
    (s) => s.id === item.stage
  );
  const emoji = TYPE_EMOJIS[item.type] || "📎";

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 bg-white border border-zinc-200 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg shrink-0">{emoji}</span>
          <span className="text-sm font-medium text-zinc-700 truncate">
            {item.name}
          </span>
        </div>

        {item.error ? (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs">{item.error}</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {PROCESSING_STAGES.map((stage, index) => {
              const isDone = index < currentStageIndex;
              const isCurrent = index === currentStageIndex;

              if (!isDone && !isCurrent) return null;

              return (
                <div key={stage.id} className="flex items-center gap-2">
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin shrink-0" />
                  )}
                  <span
                    className={`text-xs ${
                      isDone ? "text-zinc-400" : "text-zinc-700 font-medium"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}