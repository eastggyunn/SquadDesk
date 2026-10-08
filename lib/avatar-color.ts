const PALETTE = [
  "bg-cyan-500/20 text-cyan-300",
  "bg-violet-500/20 text-violet-300",
  "bg-rose-500/20 text-rose-300",
  "bg-amber-500/20 text-amber-300",
  "bg-emerald-500/20 text-emerald-300",
];

export function getAvatarColor(name: string) {
  const index = name.charCodeAt(0) % PALETTE.length;
  return PALETTE[index];
}
