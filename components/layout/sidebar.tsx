"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SPRING } from "@/lib/motion";
import type { CurrentUser } from "@/lib/supabase/current-user";
import { logout } from "@/lib/supabase/auth-actions";
import { getAvatarColor } from "@/lib/avatar-color";
import { clearPersistedStores } from "@/lib/store/clear-persisted-stores";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { ProjectSwitcher } from "./project-switcher";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";
import { useOpenBugCount } from "@/lib/hooks/use-open-bug-count";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

const APP_VERSION_LABEL = "v0.1.0 · Dev Build";
const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 80;

export function Sidebar({ currentUser }: { currentUser: CurrentUser | null }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const openBugCount = useOpenBugCount();
  const hasMounted = useHasMounted();
  const displayName = currentUser?.assignee.name ?? "게스트";
  const displayRole = currentUser?.assignee.role ?? "-";
  const initials = displayName.slice(0, 1);

  async function handleLogout() {
    clearPersistedStores();
    await logout();
  }

  return (
    <motion.aside
      // 벽에 붙지 않고 떠 있는 패널 — 반투명 배경 + blur라 나중에 글래스 재질로 바꾸기 쉽다.
      // 접기/펴기는 너비만 스프링으로 바꾸고, 안쪽 아이콘·아바타·버튼은 모두 같은 세로줄
      // (접힌 너비 80px의 가운데)에 고정해 둔다. 그래서 접을 때는 오른쪽이 왼쪽으로 말려
      // 들어가며 글자만 가려지고, 아이콘은 제자리에 그대로 있다.
      initial={false}
      animate={{ width: isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={SPRING.collapse}
      className="sticky top-3 m-3 mr-0 flex h-[calc(100vh-1.5rem)] flex-shrink-0 flex-col overflow-hidden whitespace-nowrap rounded-3xl border border-zinc-800/80 bg-zinc-900/80 shadow-[var(--panel-shadow)] backdrop-blur-xl"
    >
      {/* 로고 + 접기 버튼. 버튼은 오른쪽 끝에 붙어 있어 패널이 말려 들어가면 함께 왼쪽으로 와서
          접힌 폭(80px)의 정가운데에 멈춘다 — 접힌 상태에서는 로고 대신 이 버튼이 맨 위에 남는다.
          버튼은 사이드바 패널 자체를 기준으로 절대 배치한다 — 로고 줄의 폭과 상관없이 접힌 상태에서
          정확히 가운데(아이콘 줄)에 온다. 접히면 로고 글자는 사라지고 버튼만 남는다. */}
      <div className="min-w-0 overflow-hidden border-b border-zinc-800/60 py-6 pl-[33px] pr-16">
        {/* 버전은 자주 볼 정보가 아니라 따로 줄을 두지 않고 로고 툴팁으로 보여준다. */}
        <Reveal show={!isCollapsed} className="text-lg font-semibold tracking-tight text-zinc-100">
          <span title={APP_VERSION_LABEL}>SquadDesk</span>
        </Reveal>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className="absolute right-[25px] top-6 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = isNavItemActive(href, pathname);
          const badge = href === "/bugs" && hasMounted && openBugCount > 0 ? openBugCount : null;

          return (
            <Link
              key={href}
              href={href}
              title={isCollapsed ? label : undefined}
              className={`group relative flex items-center gap-3 overflow-hidden rounded-xl py-2.5 pl-[17px] pr-3 text-sm font-medium transition-colors ${
                isActive ? "bg-zinc-800/70 text-zinc-50" : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100"
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 transition-colors ${
                  isActive ? "text-cyan-400" : "text-zinc-500 group-hover:text-zinc-300"
                }`}
              />
              <Reveal show={!isCollapsed}>{label}</Reveal>
              {badge !== null && (
                <>
                  <Reveal
                    show={!isCollapsed}
                    className="ml-auto rounded-full bg-cyan-500/15 px-1.5 text-[11px] font-semibold tabular-nums text-cyan-300"
                  >
                    {badge}
                  </Reveal>
                  <Reveal
                    show={isCollapsed}
                    className="absolute left-[34px] top-2 h-1.5 w-1.5 rounded-full bg-cyan-400"
                    aria-label={`미처리 버그 ${badge}건`}
                  />
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {currentUser && (
        // 접혀도 언마운트하지 않고 펼친 너비 그대로 둔 채 가린다 — 펼칠 때 목록이 좁은 폭에서
        // 줄바꿈되며 비집고 들어오는 일이 없다. 가려진 동안은 inert로 포커스도 막는다.
        <Reveal as="div" show={!isCollapsed} className="w-[254px] shrink-0" inert={isCollapsed}>
          <HydrationGate>
            <ProjectSwitcher />
          </HydrationGate>
        </Reveal>
      )}

      <div className="flex items-center gap-2.5 border-t border-zinc-800/80 py-3 pl-[23px] pr-4">
        <span
          title={displayName}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(
            displayName
          )}`}
        >
          {initials}
        </span>

        <Reveal as="div" show={!isCollapsed} className="flex min-w-0 flex-1 items-center gap-2.5" inert={isCollapsed}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-zinc-100">{displayName}</span>
            <span className="block truncate text-xs text-zinc-500">{displayRole}</span>
          </span>

          {currentUser && (
            <button
              type="button"
              onClick={handleLogout}
              title="로그아웃"
              className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </Reveal>
      </div>

    </motion.aside>
  );
}

/**
 * 사이드바 글자 전용 페이드. 접을 때는 너비가 줄기 시작하자마자 빠르게 사라지고,
 * 펼칠 때는 너비가 어느 정도 열린 뒤에 나타나 글자가 좁은 틈으로 비집고 들어오지 않는다.
 */
function Reveal({
  show,
  as = "span",
  className,
  inert,
  children,
  ...rest
}: {
  show: boolean;
  /** 블록 요소(목록 등)를 감쌀 때는 "div". */
  as?: "span" | "div";
  className?: string;
  inert?: boolean;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  const Component = as === "div" ? motion.div : motion.span;
  return (
    <Component
      initial={false}
      animate={{ opacity: show ? 1 : 0 }}
      transition={show ? { duration: 0.2, delay: 0.1, ease: "easeOut" } : { duration: 0.1, ease: "easeOut" }}
      aria-hidden={show ? undefined : true}
      // React 18은 inert 속성을 DOM에 그대로 쓰지 않으므로 노드에 직접 설정한다.
      ref={(node: HTMLElement | null) => {
        if (node) node.inert = Boolean(inert);
      }}
      className={className}
      {...rest}
    >
      {children}
    </Component>
  );
}
