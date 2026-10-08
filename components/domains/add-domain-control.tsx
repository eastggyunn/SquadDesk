"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { primaryButton, primaryButtonSm } from "@/components/ui/button-styles";
import { SPRING } from "@/lib/motion";

interface AddDomainControlProps {
  onCreate: (label: string) => void;
  isSubmitting?: boolean;
}

export function AddDomainControl({ onCreate, isSubmitting = false }: AddDomainControlProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");

  function handleCreate() {
    if (isSubmitting) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName("");
    setIsAdding(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setIsAdding((prev) => !prev)}
        className={primaryButton}
      >
        <Plus className="h-4 w-4" />
        업무 영역 추가
      </button>

      <AnimatePresence initial={false}>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING.collapse}
            className="w-full max-w-xs overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2">
              <input
                autoFocus
                value={name}
                disabled={isSubmitting}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="예: 클라이언트 프로그래밍"
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 transition-opacity duration-150 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={isSubmitting}
                className={`shrink-0 ${primaryButtonSm}`}
              >
                {isSubmitting ? "저장 중..." : "추가"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
