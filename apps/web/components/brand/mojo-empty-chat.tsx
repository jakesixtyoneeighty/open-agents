"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { BRAND, getMojoGreeting, MOJO_SUGGESTIONS } from "@/lib/brand";
import { MojoAvatar } from "./mojo-avatar";

/**
 * Empty-chat welcome: Mojo greeting plus starter prompts that drop into
 * the composer when picked.
 */
export function MojoEmptyChat({
  onPickSuggestion,
  repoLabel,
}: {
  readonly onPickSuggestion: (prompt: string) => void;
  readonly repoLabel?: string | null;
}) {
  // Greeting depends on the viewer's local clock, so resolve after mount.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    setGreeting(getMojoGreeting());
  }, []);

  return (
    <div className="flex min-h-[48vh] flex-col items-center justify-center px-2 text-center">
      <div className="mojo-rise relative">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-gradient-mojo opacity-30 blur-2xl" />
        <MojoAvatar size="xl" status="online" />
      </div>
      <h2 className="mojo-rise mt-6 text-2xl font-semibold tracking-tight [animation-delay:80ms] sm:text-3xl">
        {greeting ?? "Hey there."}{" "}
        <span className="text-gradient-mojo">What are we fixing?</span>
      </h2>
      <p className="mojo-rise mt-2 max-w-md text-sm text-muted-foreground [animation-delay:140ms]">
        {repoLabel ? (
          <>
            {BRAND.mascot} is warmed up on{" "}
            <span className="font-mono text-foreground/80">{repoLabel}</span>.
            Pick a starter or describe the job.
          </>
        ) : (
          <>
            {BRAND.mascot} is ready. Pick a starter or describe what you need.
          </>
        )}
      </p>
      <div className="mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
        {MOJO_SUGGESTIONS.map((suggestion, index) => (
          <button
            key={suggestion.title}
            type="button"
            onClick={() => onPickSuggestion(suggestion.prompt)}
            style={{ animationDelay: `${200 + index * 70}ms` }}
            className="mojo-pop-in mojo-border group relative overflow-hidden rounded-xl bg-card/60 px-4 py-3 text-left backdrop-blur transition-all duration-200 before:opacity-0 hover:-translate-y-0.5 hover:bg-card hover:shadow-mojo hover:before:opacity-100"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{suggestion.title}</span>
              <ArrowUpRight className="size-4 text-muted-foreground transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-mojo-cyan" />
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {suggestion.prompt}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
