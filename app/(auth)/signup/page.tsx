import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { withRedirectTo } from "@/lib/supabase/redirect";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string };
}) {
  const loginHref = withRedirectTo("/login", searchParams.redirectTo);

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-50">회원가입</h1>
      <p className="mt-1 text-sm text-zinc-500">이메일과 비밀번호로 SquadDesk 계정을 만드세요.</p>

      <div className="mt-6">
        <SignupForm redirectTo={searchParams.redirectTo} />
      </div>

      <p className="mt-6 text-center text-sm text-zinc-500">
        이미 계정이 있으신가요?{" "}
        <Link href={loginHref} className="font-medium text-cyan-400 hover:text-cyan-300">
          로그인
        </Link>
      </p>
    </div>
  );
}
