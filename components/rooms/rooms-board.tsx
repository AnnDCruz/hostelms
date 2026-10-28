"use client";

import { useState } from "react";
import { useBlocks } from "@/hooks/use-blocks";
import { useRooms } from "@/hooks/use-rooms";
import type { RoomDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover } from "@/components/ui/popover";
import { AddRoomForm } from "./add-room-form";
import { RoomCell } from "./room-cell";
import { RoomDetail } from "./room-detail";

export function RoomsBoard() {
  const blocks = useBlocks();
  const [blockId, setBlockId] = useState<string | null>(null);
  const activeId = blockId ?? blocks.data?.[0]?.id ?? null;
  const block = blocks.data?.find((b) => b.id === activeId);
  const rooms = useRooms(activeId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selected = rooms.data?.find((r) => r.id === selectedId) ?? null;

  const floors = new Map<number, RoomDTO[]>();
  for (const r of rooms.data ?? []) floors.set(r.floor, [...(floors.get(r.floor) ?? []), r]);

  if (blocks.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (blocks.error) return <p role="alert" className="text-sm text-danger">{blocks.error.message}</p>;
  if (!blocks.data?.length) return <p className="text-sm text-muted">You are not assigned to any block yet.</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Blocks">
        {blocks.data.map((b) => (
          <button
            key={b.id}
            type="button"
            aria-pressed={b.id === activeId}
            onClick={() => setBlockId(b.id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              b.id === activeId ? "border-accent bg-accent/10 font-medium text-accent" : "border-border bg-background text-muted hover:bg-surface",
            )}
          >
            Block {b.name}
          </button>
        ))}
      </div>

      {block && (
        <Card>
          <CardHeader>
            <CardTitle>
              Block {block.name} ({block.gender === "Male" ? "boys" : "girls"})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge tone="neutral">{block.counts.Vacant} vacant</Badge>
              <Badge tone="accent">{block.counts.Occupied} occupied</Badge>
              <Badge tone="danger">{block.counts.Blocked} blocked</Badge>
              <Badge tone="staff">{block.counts.Staff} staff</Badge>
              <Button onClick={() => setAdding(true)}>Add room</Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            {rooms.isLoading && <p className="text-sm text-muted">Loading rooms…</p>}
            {rooms.data?.length === 0 && <p className="text-sm text-muted">No rooms in this block yet. Use Add room.</p>}
            {[...floors.entries()].map(([floor, list]) => (
              <section key={floor}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Floor {floor}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {list.map((r) => (
                    <RoomCell key={r.id} room={r} blockName={block.name} onSelect={() => setSelectedId(r.id)} />
                  ))}
                </div>
              </section>
            ))}
          </CardBody>
        </Card>
      )}

      {block && (
        <Popover open={adding} onOpenChange={setAdding} title={`Add a room to Block ${block.name}`}>
          <AddRoomForm blockId={block.id} onDone={() => setAdding(false)} />
        </Popover>
      )}

      {block && selected && (
        <Popover open onOpenChange={(o) => !o && setSelectedId(null)} title={`Room ${block.name}-${selected.roomNumber}`}>
          <RoomDetail room={selected} block={block} blocks={blocks.data} />
        </Popover>
      )}
    </div>
  );
}
