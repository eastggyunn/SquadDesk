import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { MotionProvider } from "@/components/providers/motion-provider";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

// 한글·영문 모두 Pretendard 가변 폰트 하나로 처리한다 (node_modules/pretendard에서 셀프 호스팅).
const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SquadDesk",
  description: "인디 게임 개발팀을 위한 협업 툴",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme은 아래 스크립트가 첫 렌더 전에 넣으므로 서버 HTML과 다를 수 있다.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${pretendard.className} bg-zinc-950 text-zinc-100 antialiased`}>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
