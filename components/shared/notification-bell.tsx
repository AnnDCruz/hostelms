"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationCategory, Role } from "@prisma/client";
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount, type CategoryFilter } from "@/hooks/use-notifications";
import { notificationHref } from "@/lib/notification-links";
import type { NotificationDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";

const FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "All", label: "All" },
  { key: "Gatepass", label: "Gate passes" },
  { key: "Maintenance", label: "Maintenance" },
  { key: "Feedback", label: "Feedback" },
  { key: "Laundry", label: "Laundry" },
  { key: "Shift", label: "Shifts" },
  { key: "System", label: "System" },
];
const LABEL = Object.fromEntries(FILTERS.map((f) => [f.key, f.label])) as Record<NotificationCategory | "All", string>;

function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString([], { dateStyle: "medium" });
}

export function NotificationBell({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>("All");
  const count = useUnreadCount();
  const list = useNotifications(category, open);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const unread = count.data?.unread ?? 0;
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  function openItem(n: NotificationDTO) {
    if (!n.isRead) markRead.mutate(n.id);
    const href = notificationHref(role, n.linkEntity, n.linkId);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-5 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <Popover open={open} onOpenChange={setOpen} title="Notifications" description={unread > 0 ? `${unread} unread` : "You are all caught up"}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={category === f.key}
                  onClick={() => setCategory(f.key)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs",
                    category === f.key ? "border-accent bg-accent/10 font-medium text-accent" : "border-border text-muted hover:bg-surface",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" className="h-8 px-2 text-xs" disabled={markAll.isPending || unread === 0} onClick={() => markAll.mutate(category)}>
              {category === "All" ? "Mark all as read" : `Mark ${LABEL[category]} as read`}
            </Button>
          </div>

          {list.isLoading && <p className="text-sm text-muted">Loading…</p>}
          {list.error && <p role="alert" className="text-sm text-danger">{list.error.message}</p>}
          {list.data && items.length === 0 && <p className="text-sm text-muted">No notifications here.</p>}

          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {items.map((n) => {
              const href = notificationHref(role, n.linkEntity, n.linkId);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "w-full rounded-md border p-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-accent",
                      n.isRead ? "border-border bg-background text-muted hover:bg-surface" : "border-accent/30 bg-accent/5 hover:bg-accent/10",
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className={cn(!n.isRead && "font-semibold text-foreground")}>
                        {!n.isRead && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </span>
                      <Badge>{LABEL[n.category]}</Badge>
                    </span>
                    <span className="mt-0.5 block">{n.body}</span>
                    <span className="mt-1 flex items-center justify-between text-xs text-muted">
                      <span>{timeAgo(n.createdAt)}</span>
                      {href && <span className="font-medium text-accent">Open</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                {list.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
