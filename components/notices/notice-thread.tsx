"use client";

import { useState } from "react";
import type { NoticeCommentDTO } from "@/lib/types";
import { useNotice, usePostComment } from "@/hooks/use-notices";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";

const ROLE_TONE: Record<string, Tone> = { Warden: "accent", ChiefWarden: "staff", Student: "neutral" };
const ROLE_LABEL: Record<string, string> = { Warden: "Warden", ChiefWarden: "Chief warden", Student: "Student" };
const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export function NoticeThread({ noticeId }: { noticeId: string }) {
  const { data, isLoading, error } = useNotice(noticeId);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-muted">Loading comments…</p>;
  if (error) return <p role="alert" className="text-sm text-danger">{error.message}</p>;
  if (!data) return null;

  const top = data.comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => data.comments.filter((c) => c.parentId === id);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Comments ({data.comments.length})</h3>
      {top.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
      <ul className="space-y-3">
        {top.map((c) => (
          <li key={c.id} className="space-y-2">
            <Comment c={c} onReply={() => setReplyTo(replyTo === c.id ? null : c.id)} replying={replyTo === c.id} />
            {repliesOf(c.id).length > 0 && (
              <ul className="ml-4 space-y-2 border-l border-border pl-3">
                {repliesOf(c.id).map((r) => (
                  <li key={r.id}>
                    <Comment c={r} onReply={() => setReplyTo(replyTo === c.id ? null : c.id)} replying={false} />
                  </li>
                ))}
              </ul>
            )}
            {replyTo === c.id && (
              <div className="ml-4 pl-3">
                <Composer noticeId={noticeId} parentId={c.id} placeholder="Write a reply" label="Post reply" onDone={() => setReplyTo(null)} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <Composer noticeId={noticeId} placeholder="Add a comment" label="Comment" />
    </div>
  );
}

function Comment({ c, onReply, replying }: { c: NoticeCommentDTO; onReply: () => void; replying: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{c.authorName}</span>
        <Badge tone={ROLE_TONE[c.authorRole] ?? "neutral"}>{ROLE_LABEL[c.authorRole] ?? c.authorRole}</Badge>
        <span className="text-xs text-muted">{fmt(c.createdAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
      <button
        type="button"
        onClick={onReply}
        aria-expanded={replying}
        className="mt-1 text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Reply
      </button>
    </div>
  );
}

function Composer({ noticeId, parentId, placeholder, label, onDone }: { noticeId: string; parentId?: string; placeholder: string; label: string; onDone?: () => void }) {
  const post = usePostComment(noticeId);
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        post.mutate(
          { body, parentId: parentId ?? null },
          {
            onSuccess: () => {
              setBody("");
              onDone?.();
            },
          },
        );
      }}
    >
      <textarea aria-label={placeholder} required maxLength={1000} rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} className={fieldClass} />
      {post.error && <p role="alert" className="text-sm text-danger">{post.error.message}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={post.isPending || !body.trim()}>
          {post.isPending ? "Sending…" : label}
        </Button>
      </div>
    </form>
  );
}
