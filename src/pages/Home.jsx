import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Brain } from "lucide-react";
import { fetchMemorySnapshot, updateLastVisit } from "@/lib/memorySnapshot";
import GreetingBlock from "@/components/home/GreetingBlock";
import SinceLastVisit from "@/components/home/SinceLastVisit";
import MemorySpaces from "@/components/home/MemorySpaces";
import RecentActivity from "@/components/home/RecentActivity";

export default function Home() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const updatedRef = useRef(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMemorySnapshot();
      setSnapshot(data);
    } catch (e) {
      console.error("[Home] fetchMemorySnapshot failed:", e);
      // Provide a safe empty snapshot so the page always renders
      setSnapshot({
        user: null,
        activeSessions: [],
        spaces: [],
        pendingTasks: [],
        sinceLastVisit: null,
        activity: [],
        isFirstVisit: true,
      });
    } finally {
      setLoading(false);
      if (!updatedRef.current) {
        updatedRef.current = true;
        updateLastVisit();
      }
    }
  };

  if (loading || !snapshot) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  const { user, activeSessions, spaces, pendingTasks, sinceLastVisit, activity } = snapshot;
  const isEmpty = activeSessions.length === 0 && spaces.length === 0 && activity.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] lg:h-screen text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-violet-200">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-zinc-800 font-heading">Sua memória está começando</h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-sm">
          Converse naturalmente com o MemoryOS. Tudo que você disser será organizado e preservado automaticamente.
        </p>
        <Link
          to="/chat"
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition"
        >
          Começar a conversar
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-3xl mx-auto w-full">
      <GreetingBlock user={user} activeSession={activeSessions[0]} />
      <SinceLastVisit sinceLastVisit={sinceLastVisit} pendingTasks={pendingTasks} />
      <MemorySpaces spaces={spaces} />
      <RecentActivity activity={activity} />
    </div>
  );
}