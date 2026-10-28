"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { NAV, ROLE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-background md:block">
      <div className="border-b border-border px-4 py-4">
        <p className="text-base font-semibold">HostelMS</p>
        <p className="text-xs text-muted">{ROLE_LABEL[role]}</p>
      </div>
      <nav className="flex flex-col gap-1 p-2" aria-label="Main">
        {NAV[role].map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                active ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
