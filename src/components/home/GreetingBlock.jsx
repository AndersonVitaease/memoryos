import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { getGreeting, getFirstName } from "@/lib/memorySnapshot";

export default function GreetingBlock({ user, activeSession }) {
  const navigate = useNavigate();
  const greeting = getGreeting();
  const firstName = getFirstName(user);

  return (
    <div className="mb-10">
      <h1 className="text-3xl font-bold text-zinc-900 font-heading tracking-tight">
        {greeting}{firstName ? `, ${firstName}` : ""}.
      </h1>
      <p className="text-zinc-400 mt-1">Bem-vindo de volta.</p>

      <button
        onClick={() => navigate("/chat")}
        className="mt-6 w-full text-left group"
      >
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl p-6 transition-all group-hover:shadow-lg group-hover:shadow-zinc-200/60">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              {activeSession?.summary ? (
                <>
                  <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider mb-2">
                    Continue de onde parou
                  </p>
                  <p className="text-white text-sm leading-relaxed line-clamp-2">{activeSession.summary}</p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider mb-2">
                    Sua memória está pronta
                  </p>
                  <p className="text-white text-sm leading-relaxed">
                    Comece uma conversa para continuar construindo sua memória.
                  </p>
                </>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition flex-shrink-0">
              <ArrowRight className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}