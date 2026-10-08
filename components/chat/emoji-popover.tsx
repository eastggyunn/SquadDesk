"use client";

import { useRef, useState } from "react";
import { Smile } from "lucide-react";
import { AnchoredPopover } from "@/components/ui/anchored-popover";

const EMOJIS = [
  "😀", "😂", "😅", "😍", "🥲", "😭", "😡", "🤔",
  "👍", "👎", "🙏", "👀", "🎉", "🔥", "💯", "✅",
  "❌", "🚀", "💡", "🐛", "🛠️", "⏰", "🙌", "😴",
];

interface EmojiPopoverProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPopover({ onSelect }: EmojiPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="이모지"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <Smile className="h-4 w-4" />
      </button>

      <AnchoredPopover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} placement="top" widthClassName="w-64">
        <p className="px-1 pb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">이모지</p>
        <div className="grid grid-cols-6 gap-1">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md text-lg transition-colors hover:bg-zinc-800"
            >
              {emoji}
            </button>
          ))}
        </div>
      </AnchoredPopover>
    </>
  );
}
