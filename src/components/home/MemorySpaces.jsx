import React from "react";
import { useNavigate } from "react-router-dom";
import { Brain } from "lucide-react";

const spaceTypeLabels = {
  pessoal: "Pessoal",
  empresa: "Empresa",
  condominio: "Condomínio",
  turismo: "Turismo",
  outro: "Outro",
};

export default function MemorySpaces({ spaces }) {
  const navigate = useNavigate();

  if (!spaces || spaces.length === 0) return null;

  return (
    <div className="mb-10">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
        Sua memória está organizada em
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {spaces.map((space) => (
          <button
            key={space.id}
            onClick={() => navigate(`/projects/${space.id}`)}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-100 transition text-left"
          >
            <Brain className="w-4 h-4 text-violet-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900 truncate">
                {space.name}
              </p>
            </div>
            <span className="text-xs text-zinc-400 flex-shrink-0">
              {spaceTypeLabels[space.type] || space.type}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
