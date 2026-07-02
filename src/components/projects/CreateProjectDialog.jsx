import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";

const colors = [
  { name: "violet", class: "bg-violet-500" },
  { name: "blue", class: "bg-blue-500" },
  { name: "emerald", class: "bg-emerald-500" },
  { name: "amber", class: "bg-amber-500" },
  { name: "rose", class: "bg-rose-500" },
  { name: "slate", class: "bg-slate-500" },
];

export default function CreateProjectDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("violet");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const project = await base44.entities.Project.create({ name: name.trim(), description: description.trim(), color });
    setName("");
    setDescription("");
    setColor("violet");
    setLoading(false);
    onOpenChange(false);
    onCreated?.(project);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Novo Projeto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome do projeto</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Vitaease" className="mt-1.5" />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o projeto..." className="mt-1.5" rows={3} />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-1.5">
              {colors.map((c) => (
                <button
                  type="button"
                  key={c.name}
                  onClick={() => setColor(c.name)}
                  className={`w-8 h-8 rounded-full ${c.class} transition-all ${color === c.name ? "ring-2 ring-offset-2 ring-zinc-900 scale-110" : "hover:scale-105"}`}
                />
              ))}
            </div>
          </div>
          <Button type="submit" disabled={loading || !name.trim()} className="w-full bg-zinc-900 hover:bg-zinc-800">
            {loading ? "Criando..." : "Criar Projeto"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}