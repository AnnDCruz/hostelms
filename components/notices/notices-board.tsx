"use client";

import { useState } from "react";
import { useSelection } from "@/hooks/use-selection";
import { useDeleteNotice, useNotices } from "@/hooks/use-notices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover } from "@/components/ui/popover";
import { NoticeForm } from "./notice-form";
import { NoticeThread } from "./notice-thread";

type BoardRole = "Student" | "Warden" | "ChiefWarden";

const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export function NoticesBoard({ role }: { role: BoardRole }) {
  const { data, isLoading, error } = useNotices();
  const del = useDeleteNotice();
  const [posting, setPosting] = useState(false);
  const { selectedId, select: setSelectedId, close } = useSelection();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selected = data?.find((n) => n.id === selectedId) ?? null;
  const canPost = role === "Warden" || role === "ChiefWarden";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Notice board</CardTitle>
          {canPost && <Button onClick={() => setPosting(true)}>Post notice</Button>}
        </CardHeader>
        <CardBody className="space-y-3">
          {isLoading && <p className="text-sm text-muted">Loading…</p>}
          {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
          {data?.length === 0 && <p className="text-sm text-muted">No notices right now.</p>}
          {data?.map((n) => (
            <article key={n.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="text-left font-medium focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => {
                    setConfirmDelete(false);
                    del.reset();
                    setSelectedId(n.id);
                  }}
                >
                  {n.title}
                </button>
                {n.expired && <Badge tone="danger">Expired</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{n.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  {n.postedBy}
                  {n.postedByRole === "ChiefWarden" ? "" : " (warden)"} · {fmt(n.createdAt)}
                </span>
                {n.blocks.map((b) => (
                  <Badge key={b.id}>Block {b.name}</Badge>
                ))}
                <span>
                  {n.commentCount} comment{n.commentCount === 1 ? "" : "s"}
                </span>
              </div>
            </article>
          ))}
        </CardBody>
      </Card>

      <Popover open={posting} onOpenChange={setPosting} title="Post a notice" description="Students in the chosen blocks are notified.">
        <NoticeForm onDone={() => setPosting(false)} />
      </Popover>

      {selected && (
        <Popover open onOpenChange={(o) => !o && close()} title={selected.title}>
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">{selected.body}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>
                Posted by {selected.postedBy} · {fmt(selected.createdAt)}
              </span>
              {selected.blocks.map((b) => (
                <Badge key={b.id}>Block {b.name}</Badge>
              ))}
              {selected.expiresAt && <span>{selected.expired ? "Expired" : "Expires"} {fmt(selected.expiresAt)}</span>}
            </div>

            {selected.canDelete && (
              <div>
                {!confirmDelete ? (
                  <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
                    Delete notice
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-md border border-border bg-surface p-3 text-sm">
                    <p>Delete this notice and all its comments? This cannot be undone.</p>
                    {del.error && <p role="alert" className="text-danger">{del.error.message}</p>}
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                      <Button variant="danger" disabled={del.isPending} onClick={() => del.mutate(selected.id, { onSuccess: () => close() })}>
                        Confirm delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <NoticeThread noticeId={selected.id} />
          </div>
        </Popover>
      )}
    </div>
  );
}
