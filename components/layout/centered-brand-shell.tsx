/** 사이드바 없는 단독 화면(로그인/회원가입/초대 수락)이 공유하는 브랜드 헤더 + 중앙 정렬 셸. */
export function CenteredBrandShell({
  children,
  width = "sm",
}: {
  children: React.ReactNode;
  width?: "sm" | "md";
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span className="text-xl font-semibold tracking-tight text-zinc-50">
          Squad<span className="text-cyan-400">Desk</span>
        </span>
      </div>
      <div className={`w-full ${width === "sm" ? "max-w-sm" : "max-w-md"}`}>{children}</div>
    </div>
  );
}
