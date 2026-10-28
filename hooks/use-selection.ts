"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Which record's popover is open. Clicking a row selects it; a notification link
// (?open=<id>) opens it directly. Closing clears both.
export function useSelection() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openParam = params.get("open");
  const [manual, setManual] = useState<string | null>(null);

  return {
    selectedId: manual ?? openParam,
    select: (id: string) => setManual(id),
    close: () => {
      setManual(null);
      if (openParam) router.replace(pathname, { scroll: false });
    },
  };
}
