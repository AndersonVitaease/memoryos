import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const colors = [
  { name: "violet", class: "bg-violet-500" },
  { name: "blue", class: "bg-blue-500" },
  { name: "emerald", class: "bg-emerald-500" },
  { name: "amber", class: "bg-amber-500" },
  { name: "rose", class: "bg-rose-500" },
  { name: "slate", class: "bg-slate-500" },
];

const colorMap = {
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export default function TagManager({ projectId }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("violet");

  useEffect(() => { loadTags(); }, [projectId]);

  const loadTags = async () => {
    setLoading(true);
    const data = await base44.entities.Tag.filter({ project_id: projectId }, "created_date", 100);
    setTags(data);
    setLoading(false);
  };

  const addTag = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await base44.entities.Tag.create({ project_id: projectId, name: name.trim(), color });
    setName("");
    setColor("violet");
    setShowAdd(false);
    loadTags();
  };

  const deleteTag = async (id) => {
    await base44.entities.Tag.delete(id);
    loadTags();
  };

  if (loading) return <p className="text-sm text-zinc-400">Carregando...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-zinc-500">{tags.length} tags</h3>
        <Button size="sm" onClick={() => setShowAdd(true)} className="bg-zinc-900 hover:bg-zinc-800 gap-1.5">
          <Plus className="w-4 h-4" /> Nova Tag
        </Button>
      </div>

      {tags.length === 0 ? (
        <div className="text-center py-12 text-sm text-zinc-400">
          <TagIcon className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          Nenhuma tag criada.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div key={tag.id} className="group flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${colorMap[tag.color] || colorMap.slate}`}>
                <span className={`w-2 h-2 rounded-full ${colors.find((c) => c.name === tag.color)?.class || "bg-slate-500"}`} />
                {tag.name}
              </span>
              <button onClick={() => deleteTag(tag.id)} className="p-0.5 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nova Tag</DialogTitle></DialogHeader>
          <form onSubmit={addTag} className="space-y-4">
            <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" autoFocus /></div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-1.5">
                {colors.map((c) => (
                  <button
                    type="button"
                    key={c.name}
                    onClick={() => setColor(c.name)}
                    className={`w-7 h-7 rounded-full ${c.class} transition ${color === c.name ? "ring-2 ring-offset-2 ring-zinc-900 scale-110" : "hover:scale-105"}`}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full bg-zinc-900 hover:bg-zinc-800">Criar Tag</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}