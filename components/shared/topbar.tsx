"use client";

import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { NAV } from "@/lib/constants";
import { logoutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./notification-bell";

export function Topbar({ role, email }: { role: Role; email: string }) {
  const pathname = usePathname();
  const title = NAV[role].find((n) => n.href === pathname)?.label ?? "HostelMS";
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <NotificationBell role={role} />
        <span className="hidden text-sm text-muted sm:inline">{email}</span>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
