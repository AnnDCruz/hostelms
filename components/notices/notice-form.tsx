"use client";

import { useState } from "react";
import { useBlocks } from "@/hooks/use-blocks";
import { useCreateNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";

export function NoticeForm({ onDone }: { onDone: () => void }) {
  const blocks = useBlocks();
  const create = useCreateNotice();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expires, setExpires] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);

  const all = blocks.data?.map((b) => b.id) ?? [];
  const toggle = (id: string) => setChosen((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { title, body, blockIds: chosen, expiresAt: expires ? new Date(expires).toISOString() : null },
          { onSuccess: onDone },
        );
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Title</span>
        <input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Notice</span>
        <textarea required minLength={3} maxLength={2000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} className={fieldClass} />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Post to blocks</legend>
        {blocks.isLoading && <p className="text-sm text-muted">Loading blocks…</p>}
        {blocks.data && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.length === all.length && all.length > 0}
                onChange={(e) => setChosen(e.target.checked ? all : [])}
              />
              Select all
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {blocks.data.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={chosen.includes(b.id)} onChange={() => toggle(b.id)} />
                  Block {b.name}
                </label>
              ))}
            </div>
          </>
        )}
      </fieldset>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Expires (optional)</span>
        <input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} className={fieldClass} />
        <span className="text-xs text-muted">Students stop seeing the notice after this time. Leave empty to keep it up.</span>
      </label>

      {create.error && <p role="alert" className="text-sm text-danger">{create.error.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={create.isPending || chosen.length === 0}>
          {create.isPending ? "Posting…" : "Post notice"}
        </Button>
      </div>
    </form>
  );
}
