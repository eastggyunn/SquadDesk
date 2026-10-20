"use client";

import { useFormStatus } from "react-dom";
import { primaryButton, secondaryButton } from "@/components/ui/button-styles";

export function AuthSubmitButton({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full ${variant === "primary" ? primaryButton : secondaryButton}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
