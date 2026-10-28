import { NextResponse } from "next/server";
import { runLaundryTick } from "@/lib/laundry";

// Optional safety net for quiet hours. Laundry timers already advance whenever anyone is signed in
// (the page and the notification bell both poll), so this only matters if nobody has the app open.
// Point a scheduler at it, e.g. Vercel Cron, and set CRON_SECRET (Vercel sends it as a Bearer token).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  await runLaundryTick(true);
  return NextResponse.json({ ok: true, data: { ticked: true } });
}
