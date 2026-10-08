"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, X } from "lucide-react";
import { primaryButtonSm } from "@/components/ui/button-styles";

/**
 * 새로 만든 초대 링크를 한 번만 보여준다. 토큰 원문은 DB에 해시로만 저장되므로
 * 이 화면을 닫으면 다시 볼 수 없다 — 잃어버리면 초대를 취소하고 새로 만들어야 한다.
 */
export function InviteLinkCallout({ token, email, onClose }: { token: string; email: string; onClose: () => void }) {
  const [inviteUrl, setInviteUrl] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>();

  // origin은 브라우저에서만 알 수 있으므로 마운트 후 조합한다(SSR 불일치 방지).
  useEffect(() => {
    setInviteUrl(`${window.location.origin}/invite/${token}`);
  }, [token]);

  // 복사 직후 콜아웃을 닫으면 타이머가 언마운트된 컴포넌트를 건드린다.
  useEffect(() => () => clearTimeout(copyResetTimer.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setIsCopied(true);
      clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없으면 사용자가 입력란에서 직접 복사하면 된다.
    }
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.06] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-cyan-300">
          <Link2 className="h-4 w-4 shrink-0" />
          {email} 님의 초대 링크가 생성되었습니다
        </p>
        <button
          type="button"
          onClick={onClose}
          title="닫기"
          className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-1.5 text-xs text-zinc-400">
        이 링크는 <span className="font-medium text-zinc-200">지금만 확인할 수 있습니다.</span> 초대 대상에게 직접
        전달해주세요. 링크를 잃어버리면 초대를 취소하고 새로 만들어야 합니다.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={inviteUrl}
          onFocus={(event) => event.target.select()}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300 focus:border-cyan-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleCopy}
          className={`shrink-0 ${primaryButtonSm}`}
        >
          {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {isCopied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}
