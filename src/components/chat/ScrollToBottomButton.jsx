import React from "react";
import { ArrowDown } from "lucide-react";

export default function ScrollToBottomButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full bg-zinc-900 text-white text-xs font-medium shadow-lg hover:bg-zinc-800 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <ArrowDown className="w-3.5 h-3.5" />
      Ultima mensagem
    </button>
  );
}