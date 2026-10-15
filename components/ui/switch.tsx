"use client";

const SIZES = {
  sm: { track: "h-5 w-9", thumb: "h-4 w-4", on: "translate-x-4" },
  md: { track: "h-6 w-11", thumb: "h-5 w-5", on: "translate-x-5" },
} as const;

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: keyof typeof SIZES;
}

/** 켜기/끄기 토글(role="switch"). 버그 툴바·알림 설정이 같은 모양을 쓴다. */
export function Switch({ checked, onChange, label, disabled, size = "md" }: SwitchProps) {
  const sizes = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${sizes.track} shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-40 ${
        checked ? "bg-cyan-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`pointer-events-none inline-block ${sizes.thumb} transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
          checked ? sizes.on : "translate-x-0"
        }`}
      />
    </button>
  );
}
