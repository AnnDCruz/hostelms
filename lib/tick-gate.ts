import { redis } from "@/lib/redis";

// Several browsers poll the endpoints that run time-based work (laundry timers, missed shift logouts). Without a
// gate each poll would run the whole job. A short in-memory gate covers one server instance; a Redis lock, when
// configured, covers many. Every job is idempotent anyway, so a gate that lets two through is harmless.
const lastRun = new Map<string, number>();

export async function acquireTickSlot(key: string, minIntervalMs = 3_000): Promise<boolean> {
  const nowMs = Date.now();
  if (nowMs - (lastRun.get(key) ?? 0) < minIntervalMs) return false;
  lastRun.set(key, nowMs);
  if (redis) {
    try {
      return (await redis.set(`tick:${key}`, "1", { nx: true, ex: Math.max(1, Math.ceil(minIntervalMs / 1000)) })) === "OK";
    } catch {
      // Redis unavailable: the in-memory gate is enough.
    }
  }
  return true;
}
