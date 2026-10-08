"use client";

import type { ReactNode } from "react";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

/**
 * Wraps content that reads from a persist-backed Zustand store. Renders
 * nothing until the client has mounted, so the first client render matches
 * the server's (store-default) render and React never sees a hydration
 * mismatch once localStorage-restored data takes over.
 */
export function HydrationGate({ children }: { children: ReactNode }) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return null;
  return <>{children}</>;
}
