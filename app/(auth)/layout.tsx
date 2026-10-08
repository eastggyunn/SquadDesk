import { CenteredBrandShell } from "@/components/layout/centered-brand-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <CenteredBrandShell>
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur">{children}</div>
    </CenteredBrandShell>
  );
}
