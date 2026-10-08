import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // _next/static, _next/image, favicon, 정적 이미지 파일은 인증 게이트를 거칠 필요가 없다.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
