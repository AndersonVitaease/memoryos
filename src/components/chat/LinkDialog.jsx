import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link as LinkIcon } from "lucide-react";

export default function LinkDialog({ open, onOpenChange, onSubmit }) {
  const [url, setUrl] = useState("");

  const handleSubmit = () => {
    if (!url.trim()) return;
    let finalUrl = url.trim();
    if (!finalUrl.startsWith("http")) {
      finalUrl = "https://" + finalUrl;
    }
    onSubmit(finalUrl);
    setUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar link à memória</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-zinc-400 shrink-0" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!url.trim()}>
            Adicionar à memória
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}