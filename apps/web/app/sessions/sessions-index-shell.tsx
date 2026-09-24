"use client";

import {
  Command,
  GitPullRequestArrow,
  Mic,
  Plus,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MojoAurora } from "@/components/brand/mojo-aurora";
import { MojoAvatar } from "@/components/brand/mojo-avatar";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BRAND, getMojoGreeting } from "@/lib/brand";
import { useSessionsShell } from "./sessions-shell-context";

const TIPS = [
  {
    icon: GitPullRequestArrow,
    title: "Ticket to PR",
    body: "Turn on auto commit + PR and Mojo opens the pull request for you.",
  },
  {
    icon: Mic,
    title: "Say it out loud",
    body: "Hit the mic in any chat to describe a bug by voice.",
  },
  {
    icon: Command,
    title: "Slash commands",
    body: "Type / in the composer to run skills and shortcuts.",
  },
];

export function SessionsIndexShell() {
  const { openNewSessionDialog } = useSessionsShell();
  // Greeting depends on the viewer's local clock, so resolve after mount.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    setGreeting(getMojoGreeting());
  }, []);

  return (
    <>
      <header className="border-b border-border px-3 py-2 lg:px-4 lg:py-3">
        <div className="flex min-h-8 items-center gap-2">
          <SidebarTrigger className="shrink-0" />
        </div>
      </header>
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-12">
        <MojoAurora intensity="subtle" />
        <div className="relative flex max-w-2xl flex-col items-center text-center">
          <div className="mojo-rise relative">
            <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-gradient-mojo opacity-30 blur-3xl" />
            <MojoAvatar size="xl" status="online" />
          </div>
          <p className="mojo-rise mt-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur [animation-delay:60ms]">
            <Sparkles className="size-3 text-mojo-banana" />
            {BRAND.mascot} is online and caffeinated
          </p>
          <h1 className="mojo-rise mt-4 text-3xl font-semibold tracking-tight [animation-delay:120ms] sm:text-4xl">
            {greeting ?? "Hey there."}{" "}
            <span className="text-gradient-mojo">What should we ship?</span>
          </h1>
          <p className="mojo-rise mt-3 text-muted-foreground [animation-delay:180ms]">
            Pick up a session from the sidebar, or hand Mojo something new.
          </p>
          <Button
            variant="mojo"
            size="lg"
            onClick={openNewSessionDialog}
            className="mojo-rise mt-8 rounded-xl [animation-delay:240ms]"
          >
            <Plus className="h-4 w-4" />
            New session
          </Button>

          <div className="mt-12 grid w-full gap-3 sm:grid-cols-3">
            {TIPS.map((tip, index) => (
              <div
                key={tip.title}
                style={{ animationDelay: `${320 + index * 80}ms` }}
                className="mojo-pop-in rounded-xl border border-border bg-card/60 p-4 text-left backdrop-blur"
              >
                <tip.icon className="size-4 text-mojo-cyan" />
                <p className="mt-3 text-sm font-medium">{tip.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {tip.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
