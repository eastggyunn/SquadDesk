import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { withRedirectTo } from "@/lib/supabase/redirect";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string };
}) {
  const signupHref = withRedirectTo("/signup", searchParams.redirectTo);

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-50">로그인</h1>
      <p className="mt-1 text-sm text-zinc-500">SquadDesk 팀 계정으로 로그인하세요.</p>

      <div className="mt-6">
        <LoginForm redirectTo={searchParams.redirectTo} />
      </div>

      <p className="mt-6 text-center text-sm text-zinc-500">
        계정이 없으신가요?{" "}
        <Link href={signupHref} className="font-medium text-cyan-400 hover:text-cyan-300">
          회원가입
        </Link>
      </p>
    </div>
  );
}
