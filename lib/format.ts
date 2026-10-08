/** 채팅 메시지 시각 표시(예: "오후 2:05"). 로컬로 보낸 메시지와 서버에서 불러온 메시지가 같은 형식을 쓰도록 공유한다. */
export function formatChatTimestamp(date: Date): string {
  return date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

/** timestamptz 문자열을 "2026. 08. 17." 형태의 날짜로 표시한다. */
export function formatKoreanDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * "10분 전"/"3시간 전"/"어제" 같은 상대 시간 표시. 최근 활동 피드 전용 —
 * 절대 시각이 필요한 곳은 formatKoreanDate를 쓴다.
 */
export function formatRelativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;
  return formatKoreanDate(value);
}

/**
 * 목적격 조사 "을/를"을 붙인다. 따옴표·괄호 같은 닫는 기호는 건너뛰고 마지막 글자의 받침으로 고르며,
 * 마지막 글자가 한글이 아니면(영문 파일명 등) 읽는 법을 알 수 없으므로 "을(를)"로 둔다.
 */
export function withObjectParticle(word: string): string {
  const last = word.replace(/["'”’)\]\s]+$/, "").slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (Number.isNaN(code) || code < 0 || code > 11171) return `${word}을(를)`;
  return `${word}${code % 28 === 0 ? "를" : "을"}`;
}
