"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { countSprintBuilds } from "@/lib/supabase/repositories/builds";

/** 칸반 스프린트 진행률 옆 "빌드 N개" — 누르면 빌드 화면이 이 스프린트로 걸러져 열린다. 0개면 그리지 않는다. */
export function SprintBuildsLink({ sprintId }: { sprintId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    countSprintBuilds(getBrowserSupabaseClient(), sprintId)
      .then((value) => {
        if (!cancelled) setCount(value);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [sprintId]);

  if (count === 0) return null;
  return (
    <Link
      href={`/builds?sprint=${sprintId}`}
      className="inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors duration-150 hover:text-cyan-400"
    >
      <Package className="h-3.5 w-3.5" />
      빌드 {count}개
    </Link>
  );
}
