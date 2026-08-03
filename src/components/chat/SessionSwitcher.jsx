import React, { useState, useEffect, useRef } from "react";
import { Plus, MessageSquare, ChevronDown, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatTime } from "@/components/timeline/formatTime";

export default function SessionSwitcher({ currentSession, onNew, onSwitch, disabled }) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.ChatSession.filter(
        { status: "active" },
        "-last_message_at",
        30
      );
      setSessions(list);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [currentSession?.id]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleNew = () => {
    setOpen(false);
    onNew?.();
  };

  const handleSwitch = (id) => {
    setOpen(false);
    onSwitch?.(id);
  };

  const title = currentSession?.title || "Nova conversa";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition disabled:opacity-40 max-w-[220px]"
      >
        <MessageSquare className="w-4 h-4 text-violet-500 shrink-0" />
        <span className="truncate">{title}</span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-40 w-72 rounded-2xl border border-zinc-200 bg-white shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <button
            type="button"
            onClick={handleNew}
            className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-violet-50/60 transition text-left border-b border-zinc-100"
          >
            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <Plus className="w-4 h-4 text-violet-600" />
            </div>
            <span className="text-sm font-medium text-violet-700">Nova conversa</span>
          </button>

          <div className="max-h-72 overflow-y-auto py-1">
            {loading && sessions.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-4">Carregando...</p>
            )}
            {!loading && sessions.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-4">Nenhuma conversa ainda.</p>
            )}
            {sessions.map((s) => {
              const isActive = s.id === currentSession?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSwitch(s.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-zinc-50 transition text-left ${
                    isActive ? "bg-violet-50/40" : ""
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${isActive ? "text-violet-700 font-medium" : "text-zinc-700"}`}>
                      {s.title || "Nova conversa"}
                    </p>
                    {s.last_message_at && (
                      <p className="text-[10px] text-zinc-400">{formatTime(s.last_message_at)}</p>
                    )}
                  </div>
                  {isActive && <Check className="w-4 h-4 text-violet-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}