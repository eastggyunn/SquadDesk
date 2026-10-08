"use client";

import { useFormStatus } from "react-dom";
import { primaryButton } from "@/components/ui/button-styles";

export function AuthSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full ${primaryButton}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
