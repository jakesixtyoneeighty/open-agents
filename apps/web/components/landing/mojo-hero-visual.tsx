import { CheckCircle2, GitPullRequest, Sparkles } from "lucide-react";
import Image from "next/image";
import { BRAND } from "@/lib/brand";

function GlassCard({
  className,
  children,
}: {
  readonly className: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute rounded-xl border border-white/15 bg-[oklch(0.16_0.04_272/70%)] p-3 text-white shadow-[0_20px_50px_-15px_oklch(0.3_0.2_272/80%)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

/** Hero artwork: Mojo at the help desk with floating status cards. */
export function MojoHeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <div className="absolute inset-[8%] -z-10 rounded-[40%] bg-gradient-mojo opacity-50 blur-[80px]" />

      <div className="mojo-border relative overflow-hidden rounded-[28px] shadow-[0_40px_120px_-30px_oklch(0.45_0.22_272/70%)] before:opacity-80">
        <Image
          src={BRAND.assets.hero}
          alt="Mojo, MojoCode's mascot, at the help desk wearing a headset"
          width={1122}
          height={1402}
          priority
          sizes="(min-width: 1024px) 520px, 90vw"
          className="h-auto w-full"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[oklch(0.12_0.03_272/85%)] to-transparent" />
      </div>

      <GlassCard className="mojo-float -left-4 top-[14%] w-52 sm:-left-12">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Ticket #4821
        </div>
        <p className="mt-1.5 text-sm font-medium">AI integration issue</p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
          <CheckCircle2 className="size-3" />
          Resolved by Mojo
        </div>
      </GlassCard>

      <GlassCard className="mojo-float -right-3 top-[44%] w-48 [animation-delay:-2s] sm:-right-10">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitPullRequest className="size-4 text-mojo-cyan" />
          PR #219 opened
        </div>
        <div className="mt-2 flex items-center gap-2 font-mono text-xs">
          <span className="text-emerald-300">+184</span>
          <span className="text-rose-300">−37</span>
          <span className="ml-auto text-white/40">checks ✓</span>
        </div>
      </GlassCard>

      <GlassCard className="mojo-float bottom-[6%] left-[8%] [animation-delay:-4s]">
        <pre className="font-mono text-[11px] leading-relaxed text-white/80">
          <span className="text-mojo-violet">async function</span>{" "}
          <span className="text-mojo-cyan">solveProblems</span>() {"{"}
          {"\n  "}
          <span className="text-mojo-violet">return</span> support
          {"\n    "}.believeInPeople();
          {"\n"}
          {"}"}
        </pre>
      </GlassCard>

      <div className="absolute -top-3 right-[12%] inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[oklch(0.16_0.04_272/70%)] px-3 py-1 text-xs text-white backdrop-blur-xl">
        <Sparkles className="size-3 text-mojo-banana" />
        99.9% all systems operational
      </div>
    </div>
  );
}
