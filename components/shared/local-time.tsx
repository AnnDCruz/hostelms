"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Formats a timestamp in the viewer's own timezone. Server components only know the server's timezone,
// so the time is drawn after hydration instead of being baked into the HTML.
export function LocalTime({ iso, withDate = false }: { iso: string; withDate?: boolean }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return <span aria-hidden="true">&nbsp;</span>;
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return <time dateTime={iso}>{withDate ? `${d.toLocaleDateString([], { day: "2-digit", month: "short" })}, ${time}` : time}</time>;
}
