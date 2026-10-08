import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 오른쪽에 붙는 주요 액션(대개 "+ 추가" 버튼). 모든 화면에서 같은 자리에 둔다. */
  action?: ReactNode;
}

/** 모든 앱 화면 공통 상단 — 제목/설명은 왼쪽, 주요 액션은 오른쪽. */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
