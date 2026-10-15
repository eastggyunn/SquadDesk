import { BugBoard } from "@/components/bugs/bug-board";

/** ?bug=<id> — 버그 알림에서 들어올 때 열어 둘 버그. */
export default function BugsPage({ searchParams }: { searchParams: { bug?: string } }) {
  return <BugBoard deepLinkBugId={searchParams.bug ?? null} />;
}
