"use client";

import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import type { ProjectMemberRole } from "@/lib/supabase/schema";
import { primaryButton } from "@/components/ui/button-styles";
import { Select } from "@/components/ui/select";
import { ROLE_OPTIONS } from "./member-list";

interface InviteFormProps {
  onInvite: (email: string, role: ProjectMemberRole) => Promise<string | null>;
  onInvited: (token: string, email: string) => void;
}

export function InviteForm({ onInvite, onInvited }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectMemberRole>("member");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    const token = await onInvite(trimmed, role);
    setIsSubmitting(false);

    if (token) {
      onInvited(token, trimmed.toLowerCase());
      setEmail("");
      setRole("member");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <label htmlFor="invite-email" className="block text-xs font-medium text-zinc-400">
          초대할 이메일
        </label>
        <input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="teammate@example.com"
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="invite-role" className="block text-xs font-medium text-zinc-400">
          역할
        </label>
        <Select
          id="invite-role"
          value={role}
          onChange={(next) => setRole(next as ProjectMemberRole)}
          options={ROLE_OPTIONS}
          wrapperClassName="mt-1 w-32"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !email.trim()}
        className={primaryButton}
      >
        <UserPlus className="h-4 w-4" />
        {isSubmitting ? "생성 중..." : "초대 링크 만들기"}
      </button>
    </form>
  );
}
