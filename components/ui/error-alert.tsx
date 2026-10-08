/** 화면 어디서나 쓰는 한국어 오류 배너. message가 없으면 아무 것도 렌더링하지 않는다. */
export function ErrorAlert({ message, className = "" }: { message: string | null; className?: string }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className={`rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400 ${className}`}
    >
      {message}
    </p>
  );
}
