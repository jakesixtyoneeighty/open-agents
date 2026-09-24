"use client";

import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SignInOptions } from "@/components/auth/sign-in-options";
import { MojoAurora } from "@/components/brand/mojo-aurora";
import { MojoAvatar } from "@/components/brand/mojo-avatar";
import { AppMockup } from "@/components/landing/app-mockup";
import { CapabilityMarquee } from "@/components/landing/capability-marquee";
import { LandingFooter } from "@/components/landing/footer";
import { MojoCta } from "@/components/landing/mojo-cta";
import { MojoFeatures } from "@/components/landing/mojo-features";
import { MojoHeroVisual } from "@/components/landing/mojo-hero-visual";
import { MojoHowItWorks } from "@/components/landing/mojo-how-it-works";
import { LandingNav } from "@/components/landing/nav";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export function SignedOutHero() {
  const heroButtonsRef = useRef<HTMLDivElement>(null);
  const [heroButtonsVisible, setHeroButtonsVisible] = useState(true);

  useEffect(() => {
    const el = heroButtonsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroButtonsVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      id="top"
      className="landing relative isolate min-h-screen overflow-x-hidden bg-(--l-bg) text-(--l-fg)"
    >
      <LandingNav showSignIn={!heroButtonsVisible} />

      <section className="relative overflow-hidden px-6 pb-20 pt-28 md:pb-28 md:pt-36">
        <MojoAurora intensity="vivid" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-16 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="mojo-rise inline-flex items-center gap-2 rounded-full border border-(--l-border) bg-(--l-surface)/60 py-1 pl-1 pr-3 text-xs text-(--l-fg-2) backdrop-blur">
              <MojoAvatar size="xs" status="online" />
              Meet {BRAND.mascot} — your senior help desk, now shipping code
            </div>

            <h1 className="mojo-rise mt-6 text-5xl font-semibold leading-[1.02] tracking-tight [animation-delay:80ms] sm:text-6xl md:text-7xl">
              Same problems.
              <br />
              <span className="text-gradient-mojo mojo-gradient-pan">
                Brighter solutions.
              </span>
            </h1>

            <p className="mojo-rise mt-6 max-w-xl text-balance text-base leading-relaxed text-(--l-fg-2) [animation-delay:160ms] sm:text-lg">
              {BRAND.description}
            </p>

            <div
              ref={heroButtonsRef}
              className="mojo-rise mt-8 flex flex-wrap items-center gap-3 [animation-delay:240ms]"
            >
              <SignInOptions />
              <Button variant="ghost" size="lg" asChild>
                <a href="#watch">
                  Watch Mojo work
                  <ArrowDown className="size-4" />
                </a>
              </Button>
            </div>

            <div className="mojo-rise mt-10 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-[0.2em] text-(--l-fg-3) [animation-delay:320ms]">
              <span>People</span>
              <span className="text-mojo-cyan">×</span>
              <span>AI</span>
              <span className="text-mojo-violet">×</span>
              <span>Better software</span>
            </div>
          </div>

          <div className="mojo-rise [animation-delay:200ms]">
            <MojoHeroVisual />
          </div>
        </div>
      </section>

      <CapabilityMarquee />

      <section id="watch" className="scroll-mt-24 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-[1200px]">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
              Watch <span className="text-gradient-mojo">Mojo</span> work.
            </h2>
            <p className="mt-4 text-balance text-(--l-fg-2) sm:text-lg">
              Multiple sessions, live tool calls, todos ticking off. Click
              around — it&apos;s all running.
            </p>
          </div>
          <div className="relative mt-12">
            <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-mojo opacity-25 blur-3xl" />
            <div className="mojo-border overflow-hidden rounded-2xl bg-(--l-panel) p-2 before:opacity-80 sm:p-3">
              <AppMockup />
            </div>
          </div>
        </div>
      </section>

      <MojoFeatures />
      <MojoHowItWorks />
      <MojoCta />
      <LandingFooter />
    </div>
  );
}
