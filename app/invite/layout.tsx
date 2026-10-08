import { CenteredBrandShell } from "@/components/layout/centered-brand-shell";
import { CurrentUserProvider } from "@/components/providers/current-user-provider";
import { getCurrentUser } from "@/lib/supabase/current-user";

/**
 * 초대 수락 화면은 앱 사이드바 없이 인증 화면과 같은 단독 셸을 쓴다.
 * 다만 로그인 계정 이메일을 안내에 써야 하므로 CurrentUserProvider는 감싼다.
 * 카드(테두리/배경)는 상태별로 아이콘이 달라 InviteAcceptView의 Panel이 직접 그린다.
 */
export default async function InviteLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  return (
    <CurrentUserProvider value={currentUser}>
      <CenteredBrandShell width="md">{children}</CenteredBrandShell>
    </CurrentUserProvider>
  );
}
