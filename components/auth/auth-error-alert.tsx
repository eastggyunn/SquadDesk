import { ErrorAlert } from "@/components/ui/error-alert";

/** 인증 폼용 오류 배너. 표시는 공용 ErrorAlert와 동일하다. */
export function AuthErrorAlert({ message }: { message: string | null }) {
  return <ErrorAlert message={message} />;
}
